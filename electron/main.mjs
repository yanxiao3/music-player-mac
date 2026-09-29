// Electron 主进程：窗口 + 本地文件协议 + 扫描/解析/缓存 IPC
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanTracks, loadCache, saveCache } from './scanner.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_HTML = path.join(__dirname, '..', 'dist', 'electron', 'index.html');

// 防后台节流：播放/动画期间渲染进程不降频（保证侧栏动画、歌词滚动流畅）
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// 单实例：避免多开导致缓存写冲突
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
}

const coversDir = () => path.join(app.getPath('userData'), 'covers');
const cacheFile = () => path.join(app.getPath('userData'), 'library-cache.json');

let win = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'music',
    privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: false },
  },
]);

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  win.loadFile(RENDERER_HTML);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { win = null; });
}

const MIME_BY_EXT = {
  '.flac': 'audio/flac', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff', '.wma': 'audio/x-ms-wma', '.ape': 'audio/x-ape', '.webm': 'audio/webm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp',
};

const mimeOf = (p) => MIME_BY_EXT[path.extname(p).toLowerCase()] || 'application/octet-stream';

// 用 web ReadableStream 包裹 Node 流：客户端（Chromium）中途取消请求时显式销毁文件流，
// 避免大 Range 响应在快速 seek 下被 abort 时产生 Read error（PIPELINE_ERROR_READ）
function fileResponse(p, { start, end, status, headers }) {
  const nodeStream = fs.createReadStream(p, { start, end });
  let cancelled = false;
  const web = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        if (cancelled) return;
        try {
          controller.enqueue(chunk);
        } catch {
          nodeStream.destroy();
        }
      });
      nodeStream.on('end', () => {
        if (!cancelled) controller.close();
      });
      nodeStream.on('error', (err) => {
        if (!cancelled) controller.error(err);
      });
    },
    cancel() {
      cancelled = true;
      nodeStream.destroy();
    },
  });
  return new Response(web, { status, headers });
}

app.whenReady().then(() => {
  // music:// 协议：兼容旧缓存里的封面/音频 URL（新导入已走 file:// 直连，规避
  // 自定义协议在大 flac seek 时 Chromium 中止/重连竞态导致的 PIPELINE_ERROR_READ）
  // 初始加载请求返回 200 全量走单连接顺序流，seek 时不再产生新 Range 请求
  protocol.handle('music', async (request) => {
    const url = new URL(request.url);
    let p = decodeURIComponent(url.pathname);
    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    try {
      const stat = await fs.promises.stat(p);
      if (!stat.isFile()) return new Response('', { status: 404, statusText: 'Not Found' });
      const size = stat.size;
      const headers = new Headers();
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Type', mimeOf(p));
      const range = request.headers.get('Range');
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (m) {
          const start = m[1] !== '' ? parseInt(m[1], 10) : 0;
          const end = m[2] !== '' ? parseInt(m[2], 10) : size - 1;
          if (start === 0 && (m[2] === '' || end >= size - 1)) {
            headers.set('Content-Length', String(size));
            return fileResponse(p, { start: 0, end: size - 1, status: 200, headers });
          }
          if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < size && end >= 0) {
            const s = Math.max(0, start);
            const e = Math.min(end, size - 1);
            headers.set('Content-Range', `bytes ${s}-${e}/${size}`);
            headers.set('Content-Length', String(e - s + 1));
            return fileResponse(p, { start: s, end: e, status: 206, headers });
          }
          headers.set('Content-Range', `bytes */${size}`);
          return new Response('', { status: 416, headers });
        }
      }
      headers.set('Content-Length', String(size));
      return fileResponse(p, { start: 0, end: size - 1, status: 200, headers });
    } catch {
      return new Response('', { status: 500 });
    }
  });

  ipcMain.handle('dialog:pick-folder', async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });

  ipcMain.handle('dialog:pick-files', async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '音频文件', extensions: ['flac', 'mp3', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'aiff', 'wma', 'ape', 'webm'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths;
  });

  // 扫描/解析（Node 端解析，速度快且不阻塞渲染进程），完成后写入缓存
  ipcMain.handle('scan:paths', async (_e, payload) => {
    const result = await scanTracks(
      { dir: payload.dir, files: payload.files },
      coversDir(),
      (p) => { if (win) win.webContents.send('scan:progress', p); },
    );
    saveCache(cacheFile(), { tracks: result.tracks, sourceName: payload.sourceName || null });
    return { ...result, sourceName: payload.sourceName || null };
  });

  ipcMain.handle('cache:load', () => loadCache(cacheFile()));
  ipcMain.handle('cache:clear', () => {
    try {
      fs.rmSync(cacheFile(), { force: true });
      return true;
    } catch {
      return false;
    }
  });

  // 删除歌曲后整体重写缓存（避免删除项在重启后回跳）
  ipcMain.handle('cache:update', (_e, payload) => {
    try {
      saveCache(cacheFile(), { tracks: payload.tracks || [], sourceName: payload.sourceName || null });
      return true;
    } catch {
      return false;
    }
  });

  // 在文件管理器中定位歌曲文件
  ipcMain.handle('file:show-in-folder', (_e, p) => {
    try {
      if (typeof p === 'string' && p.length > 0) {
        shell.showItemInFolder(p);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
