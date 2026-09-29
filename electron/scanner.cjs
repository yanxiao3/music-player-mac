// 桌面版扫描与解析引擎（纯 Node，无 electron 依赖，可独立测试）
// 功能：递归收集音频文件、music-metadata 解析标签、封面落盘、歌词兼容、缓存读写
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mm = require('music-metadata');

const AUDIO_EXTS = new Set([
  '.flac', '.mp3', '.wav', '.ogg', '.opus', '.m4a', '.aac',
  '.aiff', '.aif', '.wma', '.ape', '.mp4', '.mka', '.webm',
]);

// ── 文件收集 ──────────────────────────────────────────────
function collectAudioFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      collectAudioFiles(p, out);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (AUDIO_EXTS.has(ext)) out.push(p);
    }
  }
  return out;
}

// ── 封面魔数嗅探（FLAC picture 常缺 format 字段）────────────
function sniffImageExt(buf) {
  if (!buf || buf.length < 12) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
  return 'jpg';
}

function musicUrl(absPath) {
  // file:// 直连：Chromium 原生处理本地文件，seek 走文件 IO，无自定义协议
  // abort/重连竞态（music:// 自定义协议在大 flac seek 时报 PIPELINE_ERROR_READ）
  // 跨平台：Windows 盘符（H:/...）与 macOS 根路径（/Users/...）统一成 file:///path
  let u = absPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return 'file:///' + encodeURI(u);
}

// ── 歌词兼容：Vorbis LYRICS 可能是字符串 / 对象数组 / syncText 时间戳 / LRC 文本 ────
function parseLrcText(text) {
  const lines = [];
  const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s*(.*)/g;
  let m;
  while ((m = re.exec(text))) {
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const frac = (m[3] || '').padEnd(3, '0');
    lines.push({ time: min * 60 + sec + Number(frac) / 1000, text: m[4] });
  }
  return lines;
}

function normalizeLyrics(raw) {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : [raw];
  const timed = [];
  const plainParts = [];
  for (const it of arr) {
    if (typeof it === 'string') {
      plainParts.push(it);
    } else if (it && typeof it === 'object') {
      if (Array.isArray(it.syncText) && it.syncText.length > 0) {
        for (const st of it.syncText) {
          const t = Number(st.timestamp);
          if (Number.isFinite(t) && st.text) timed.push({ time: t / 1000, text: st.text });
        }
      } else if (it.time !== undefined && it.text) {
        const t = Number(it.time);
        if (Number.isFinite(t)) timed.push({ time: t, text: it.text });
      } else if (typeof it.text === 'string') {
        plainParts.push(it.text);
      }
    }
  }
  if (timed.length > 0) {
    timed.sort((a, b) => a.time - b.time);
    return { kind: 'synced', lines: timed };
  }
  // 无时间戳：可能是 LRC 文本（[mm:ss.xx] 行）或纯文本
  const text = plainParts.join('\n');
  const lrcLines = parseLrcText(text);
  if (lrcLines.length > 0) return { kind: 'synced', lines: lrcLines };
  const cleaned = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return { kind: 'plain', text: cleaned.join('\n') };
}

// ── 单文件解析 ────────────────────────────────────────────
async function parseTrack(filePath, coversDir) {
  const stat = fs.statSync(filePath);
  let mmMeta;
  try {
    mmMeta = await mm.parseFile(filePath, { duration: true });
  } catch {
    mmMeta = { common: {}, format: {} };
  }
  const c = mmMeta.common || {};
  const f = mmMeta.format || {};

  // 歌手/专辑/年份等
  const title = str(c.title) || path.basename(filePath, path.extname(filePath));
  const artist = str(c.artist) || '未知歌手';
  const album = str(c.album) || '未知专辑';
  const albumArtist = str(c.albumartist) || artist;
  const year = c.year && Number.isFinite(Number(c.year)) ? Number(c.year) : null;
  const genre = Array.isArray(c.genre) ? c.genre.join('/') : str(c.genre);
  const trackNo = c.track && c.track.no !== undefined ? c.track.no : null;

  // 作词/作曲：common 字段或 native 标签兜底
  const composer = str(c.composer) || nativeTag(c, 'COMPOSER');
  const lyricist = str(c.lyricist) || nativeTag(c, 'LYRICIST') || nativeTag(c, 'TEXT') || '';

  // 歌词（含同步歌词）
  const lyrics = normalizeLyrics(c.lyrics);

  // 封面：落盘到 coversDir，返回 music:// URL
  let coverUrl = null;
  const pic = Array.isArray(c.picture) && c.picture.length > 0 ? c.picture[0] : null;
  if (pic && pic.data && pic.data.length > 0) {
    const ext = sniffImageExt(pic.data);
    const name = crypto.createHash('sha1').update(filePath).digest('hex') + '.' + ext;
    const coverFile = path.join(coversDir, name);
    try {
      fs.mkdirSync(coversDir, { recursive: true });
      if (!fs.existsSync(coverFile)) fs.writeFileSync(coverFile, pic.data);
      coverUrl = musicUrl(coverFile);
    } catch {
      coverUrl = null;
    }
  }

  const metaOk = Boolean(c.title) || Boolean(c.artist);

  return {
    id: crypto.createHash('sha1').update(filePath).digest('hex'),
    fileName: path.basename(filePath),
    relPath: filePath,
    src: musicUrl(filePath),
    coverUrl,
    title,
    artist,
    album,
    albumArtist,
    year,
    genre,
    trackNo,
    composer,
    lyricist,
    duration: typeof f.duration === 'number' ? f.duration : 0,
    lyrics,
    size: stat.size,
    lastModified: stat.mtimeMs,
    metaOk,
  };
}

function str(v) {
  if (Array.isArray(v)) return v.filter((x) => x && x !== '').join('/');
  return typeof v === 'string' ? v : v != null ? String(v) : '';
}

// native 标签兜底：遍历所有 native 标签找指定 key（大小写不敏感）
function nativeTag(common, key) {
  const native = common.native;
  if (!native) return '';
  const upper = key.toUpperCase();
  for (const list of Object.values(native)) {
    if (!Array.isArray(list)) continue;
    for (const tag of list) {
      if (tag && tag.id && String(tag.id).toUpperCase() === upper) {
        return str(tag.value);
      }
    }
  }
  return '';
}

// ── 批量扫描 ──────────────────────────────────────────────
async function scanTracks({ dir, files }, coversDir, onProgress) {
  const list = dir ? collectAudioFiles(dir) : (files || []).filter((p) => fs.existsSync(p));
  const total = list.length;
  const tracks = [];
  let done = 0;
  let failed = 0;
  const CONCURRENCY = 8;
  let cursor = 0;
  const worker = async () => {
    while (cursor < total) {
      const idx = cursor++;
      const filePath = list[idx];
      try {
        const t = await parseTrack(filePath, coversDir);
        if (!t.metaOk) failed += 1;
        tracks.push(t);
      } catch {
        failed += 1;
      }
      done += 1;
      if (onProgress) onProgress({ done, total });
    }
  };
  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, total)) }, worker);
  await Promise.all(workers);
  tracks.sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-Hans-CN', { numeric: true }));
  return { tracks, total, failed };
}

// ── 缓存读写 ──────────────────────────────────────────────
function loadCache(cacheFile) {
  try {
    const raw = fs.readFileSync(cacheFile, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tracks)) return null;
    // 校验关键文件仍存在（歌曲文件 / 封面文件），缺失则整库失效重扫
    const alive = data.tracks.filter((t) => fs.existsSync(t.relPath));
    if (alive.length === 0) return null;
    return { tracks: alive, sourceName: data.sourceName || null, total: alive.length };
  } catch {
    return null;
  }
}

function saveCache(cacheFile, payload) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(payload), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  collectAudioFiles,
  parseTrack,
  scanTracks,
  loadCache,
  saveCache,
  musicUrl,
};
