// EXPORTS: isAudioFile, parseAudioFile
import { parseBlob } from 'music-metadata-browser';
import { normalizeLyricsText } from './lyrics';
import type { ITrack } from './types';

const AUDIO_EXTS = new Set([
  'mp3',
  'flac',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'wma',
  'aiff',
  'ape',
  'mp4',
  'dsf',
]);

export function isAudioFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTS.has(ext);
}

// music-metadata 没有把 ID3 USLT 帧映射进 common.lyrics，这里从原生帧直接提取
function extractNativeLyrics(meta: Awaited<ReturnType<typeof parseBlob>> | null): string | undefined {
  const native = meta?.native as
    | Record<string, Array<{ id?: string; value?: unknown }>>
    | undefined;
  if (!native) return undefined;
  const texts: string[] = [];
  for (const tag of ['ID3v2.2', 'ID3v2.3', 'ID3v2.4']) {
    for (const f of native[tag] ?? []) {
      if (f.id !== 'USLT' || !f.value || typeof f.value !== 'object') continue;
      const v = f.value as { text?: unknown };
      if (typeof v.text === 'string' && v.text.trim()) texts.push(v.text);
    }
  }
  return texts.length > 0 ? texts.join('\n') : undefined;
}

export async function parseAudioFile(file: File, relPath: string, sidecarLrc?: string): Promise<ITrack> {
  const src = URL.createObjectURL(file);
  let meta: Awaited<ReturnType<typeof parseBlob>> | null = null;
  try {
    meta = await parseBlob(file);
  } catch {
    meta = null;
  }
  const common = meta?.common;
  let coverUrl: string | null = null;
  const picture = common?.picture?.[0];
  if (picture) {
    try {
      // FLAC 等格式的 picture 不带 format 字段，按数据头嗅探真实图片类型
      const raw = picture.data instanceof Uint8Array ? picture.data : new Uint8Array(picture.data ?? []);
      const data = new Uint8Array(raw.length);
      data.set(raw);
      let mime = picture.format || '';
      if (!mime) {
        if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
          mime = 'image/png';
        } else if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
          mime = 'image/jpeg';
        } else if (data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
          mime = 'image/gif';
        } else {
          mime = 'image/jpeg';
        }
      }
      coverUrl = URL.createObjectURL(new Blob([data], { type: mime }));
    } catch {
      coverUrl = null;
    }
  }
  function hasLyricsText(v: unknown): boolean {
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) {
      return v.some((x) => {
        if (typeof x === 'string') return x.trim().length > 0;
        return (
          x !== null &&
          typeof x === 'object' &&
          'text' in x &&
          typeof (x as { text?: unknown }).text === 'string' &&
          Boolean(((x as { text: string }).text ?? '').trim())
        );
      });
    }
    return false;
  }
  const lyricsSource = hasLyricsText(common?.lyrics) ? common?.lyrics : extractNativeLyrics(meta);
  const lyrics = sidecarLrc ? normalizeLyricsText(sidecarLrc) : normalizeLyricsText(lyricsSource);
  const base = relPath.split('/').pop() ?? file.name;
  const title = common?.title?.trim() || base.replace(/\.[^.]+$/, '');
  const artist = common?.artist?.trim() || '未知歌手';
  const album = common?.album?.trim() || '未知专辑';
  const albumArtist = common?.albumartist?.trim() || artist;
  return {
    id: encodeURIComponent(relPath),
    fileName: file.name,
    relPath,
    src,
    coverUrl,
    title,
    artist,
    album,
    albumArtist,
    year: common?.year ?? null,
    genre: Array.isArray(common?.genre) ? (common?.genre?.[0] ?? '') : '',
    trackNo: common?.track?.no ?? null,
    composer: Array.isArray(common?.composer) ? (common?.composer?.[0] ?? '') : (common?.composer ?? ''),
    lyricist: Array.isArray(common?.lyricist) ? (common?.lyricist?.[0] ?? '') : (common?.lyricist ?? ''),
    duration: meta?.format?.duration ?? 0,
    lyrics,
    size: file.size,
    lastModified: file.lastModified,
    metaOk: meta !== null,
  };
}
