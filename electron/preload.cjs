// Electron 预加载：安全暴露本地能力给渲染进程
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files'),
  scan: (payload) => ipcRenderer.invoke('scan:paths', payload),
  loadCache: () => ipcRenderer.invoke('cache:load'),
  clearCache: () => ipcRenderer.invoke('cache:clear'),
  updateCache: (payload) => ipcRenderer.invoke('cache:update', payload),
  showInFolder: (p) => ipcRenderer.invoke('file:show-in-folder', p),
  onScanProgress: (cb) => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('scan:progress', handler);
    return () => ipcRenderer.removeListener('scan:progress', handler);
  },
});
