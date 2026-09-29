// Electron 环境桥：检测桌面壳并提供类型化 API（浏览器模式返回 undefined，走原 File System Access 流程）
export interface ScanProgress {
  done: number;
  total: number;
}

export interface ScanResult {
  tracks: import('./types').ITrack[];
  total: number;
  failed: number;
  sourceName: string | null;
}

export interface CachePayload {
  tracks: import('./types').ITrack[];
  sourceName: string | null;
}

export interface ElectronAPI {
  pickFolder: () => Promise<string | null>;
  pickFiles: () => Promise<string[] | null>;
  scan: (payload: { dir?: string; files?: string[]; sourceName?: string | null }) => Promise<ScanResult>;
  loadCache: () => Promise<CachePayload | null>;
  clearCache: () => Promise<boolean>;
  updateCache: (payload: CachePayload) => Promise<boolean>;
  showInFolder: (filePath: string) => Promise<boolean>;
  onScanProgress: (cb: (p: ScanProgress) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);

export function electronAPI(): ElectronAPI | undefined {
  return window.electronAPI;
}
