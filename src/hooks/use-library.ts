// hook: useLibrary — 音乐库状态：文件夹/文件导入、扫描进度、上次曲库缓存恢复
// Electron 桌面壳：走原生对话框 + Node 端解析 + 磁盘缓存；浏览器：原 File System Access 流程
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { importDroppedItems, parseFileList, scanDirectory } from '@/lib/import';
import { clearDirHandle, getDirHandle, pickDirectory, saveDirHandle, supportsDirPicker } from '@/lib/storage';
import { electronAPI, isElectron } from '@/lib/electron';
import type { ITrack } from '@/lib/types';

export interface ILibraryApi {
  tracks: ITrack[];
  sourceName: string | null;
  scanning: boolean;
  done: number;
  total: number;
  pendingDir: FileSystemDirectoryHandle | null;
  importFolder: () => Promise<void>;
  importFiles: (files?: File[]) => Promise<void>;
  importDropped: (items: DataTransferItemList | FileList) => Promise<void>;
  restoreDir: () => Promise<void>;
  removeSource: () => void;
  removeTrack: (id: string) => void;
}

export function useLibrary(): ILibraryApi {
  const [tracks, setTracks] = useState<ITrack[]>([]);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [pendingDir, setPendingDir] = useState<FileSystemDirectoryHandle | null>(null);
  const tracksRef = useRef<ITrack[]>([]);
  const sourceNameRef = useRef<string | null>(null);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    sourceNameRef.current = sourceName;
  }, [sourceName]);

  const replaceTracks = useCallback((next: ITrack[]) => {
    for (const t of tracksRef.current) {
      if (t.src.startsWith('blob:')) URL.revokeObjectURL(t.src);
    }
    tracksRef.current = next;
    setTracks(next);
  }, []);

  const notifyParseIssues = useCallback((list: ITrack[]) => {
    const failed = list.filter((t) => !t.metaOk).length;
    if (failed > 0) {
      toast.warning(`有 ${failed} 首歌曲未能识别标签（将显示为未知歌手/未知专辑），可能文件损坏或格式异常`);
    }
  }, []);

  const finishScan = useCallback(
    (list: ITrack[], name: string) => {
      replaceTracks(list);
      setSourceName(name);
      setTotal(list.length);
      setDone(list.length);
      if (list.length > 0) {
        toast.success(`已导入 ${list.length} 首音乐`);
        notifyParseIssues(list);
      }
    },
    [replaceTracks, notifyParseIssues],
  );

  // ── 浏览器分支：扫描恢复 ──────────────────────────────────
  const runScan = useCallback(
    async (handle: FileSystemDirectoryHandle, name: string) => {
      setScanning(true);
      setDone(0);
      setTotal(0);
      let lastFlush = 0;
      try {
        const list = await scanDirectory(handle, (p) => {
          if (p.done === p.total || Date.now() - lastFlush > 120) {
            lastFlush = Date.now();
            setDone(p.done);
            setTotal(p.total);
          }
        });
        finishScan(list, name);
      } catch {
        toast.error('读取音乐文件夹失败');
      } finally {
        setScanning(false);
      }
    },
    [finishScan],
  );

  // ── Electron 分支：原生对话框 + 主进程解析 ────────────────
  const importFolder = useCallback(async () => {
    if (isElectron) {
      const api = electronAPI();
      if (!api) return;
      const dir = await api.pickFolder();
      if (!dir) return; // 用户取消
      setScanning(true);
      setDone(0);
      setTotal(0);
      try {
        const result = await api.scan({ dir, sourceName: dir.split(/[\\/]/).pop() || '本地音乐' });
        finishScan(result.tracks, result.sourceName || '本地音乐');
      } catch {
        toast.error('读取音乐文件夹失败');
      } finally {
        setScanning(false);
      }
      return;
    }
    if (!supportsDirPicker()) {
      toast.info('当前浏览器不支持选择文件夹，请改用「选择文件」导入');
      return;
    }
    const handle = await pickDirectory();
    if (!handle) return;
    await saveDirHandle(handle);
    await runScan(handle, handle.name);
  }, [finishScan, runScan]);

  const importFiles = useCallback(
    async (files?: File[]) => {
      if (isElectron) {
        const api = electronAPI();
        if (!api) return;
        const paths = await api.pickFiles();
        if (!paths || paths.length === 0) return;
        setScanning(true);
        setDone(0);
        setTotal(0);
        try {
          const result = await api.scan({ files: paths, sourceName: '文件选择' });
          finishScan(result.tracks, result.sourceName || '文件选择');
        } catch {
          toast.error('解析音乐文件失败');
        } finally {
          setScanning(false);
        }
        return;
      }
      const picked = files ?? [];
      if (picked.length === 0) return;
      setScanning(true);
      setDone(0);
      setTotal(0);
      let lastFlush = 0;
      try {
        const list = await parseFileList(picked, (p) => {
          if (p.done === p.total || Date.now() - lastFlush > 120) {
            lastFlush = Date.now();
            setDone(p.done);
            setTotal(p.total);
          }
        });
        finishScan(list, '文件选择');
      } catch {
        toast.error('解析音乐文件失败');
      } finally {
        setScanning(false);
      }
    },
    [finishScan],
  );

  const importDropped = useCallback(
    async (items: DataTransferItemList | FileList) => {
      if (isElectron) {
        // Electron 拖拽的 File 对象带 path，直接走主进程扫描
        const api = electronAPI();
        if (!api) return;
        const paths: string[] = [];
        const list: File[] =
          'length' in items
            ? Array.from(items as FileList)
            : Array.from(items as DataTransferItemList)
                .filter((it) => it.kind === 'file')
                .map((it) => it.getAsFile())
                .filter((f): f is File => f !== null);
        for (const f of list) {
          const p = (f as File & { path?: string }).path;
          if (p) paths.push(p);
        }
        if (paths.length === 0) return;
        setScanning(true);
        setDone(0);
        setTotal(0);
        try {
          const result = await api.scan({ files: paths, sourceName: '拖拽导入' });
          finishScan(result.tracks, result.sourceName || '拖拽导入');
        } catch {
          toast.error('解析音乐文件失败');
        } finally {
          setScanning(false);
        }
        return;
      }
      setScanning(true);
      setDone(0);
      setTotal(0);
      let lastFlush = 0;
      try {
        const list = await importDroppedItems(items as DataTransferItemList, (p) => {
          if (p.done === p.total || Date.now() - lastFlush > 120) {
            lastFlush = Date.now();
            setDone(p.done);
            setTotal(p.total);
          }
        });
        finishScan(list, '拖拽导入');
      } catch {
        toast.error('解析音乐文件失败');
      } finally {
        setScanning(false);
      }
    },
    [finishScan],
  );

  const removeSource = useCallback(() => {
    if (isElectron) {
      void electronAPI()?.clearCache();
      setSourceName(null);
      replaceTracks([]);
      return;
    }
    void clearDirHandle();
    setPendingDir(null);
    setSourceName(null);
    replaceTracks([]);
  }, [replaceTracks]);

  // 删除单首歌曲：更新内存 + Electron 下同步重写磁盘缓存（避免重启后回跳）
  const removeTrack = useCallback(
    (id: string) => {
      const cur = tracksRef.current;
      const next = cur.filter((t) => t.id !== id);
      if (next.length === cur.length) return;
      replaceTracks(next);
      if (isElectron) {
        void electronAPI()?.updateCache({ tracks: next, sourceName: sourceNameRef.current });
      }
    },
    [replaceTracks],
  );

  const restoreDir = useCallback(
    async (handle: FileSystemDirectoryHandle | null) => {
      if (!handle) return;
      try {
        const perm = await handle.requestPermission({ mode: 'read' });
        if (perm === 'granted') {
          setPendingDir(null);
          await runScan(handle, handle.name);
        } else {
          toast.error('未获得文件夹访问权限');
        }
      } catch {
        toast.error('恢复音乐库失败');
      }
    },
    [runScan],
  );

  // ── 启动恢复：Electron 读磁盘缓存（免重新解析）；浏览器恢复上次目录 ──
  const runScanRef = useRef(runScan);
  useEffect(() => {
    runScanRef.current = runScan;
  }, [runScan]);
  const finishScanRef = useRef(finishScan);
  useEffect(() => {
    finishScanRef.current = finishScan;
  }, [finishScan]);
  // 旧缓存里的 music:// 自定义协议在大 flac 拖动进度条时会触发
  // PIPELINE_ERROR_READ（协议中止/重连竞态），统一转换为 file:// 直连（Chromium 原生处理）
  const normalizeTrack = useCallback((t: ITrack): ITrack => ({
    ...t,
    src: t.src.startsWith('music:') ? t.src.replace(/^music:/, 'file:') : t.src,
    coverUrl: t.coverUrl?.startsWith('music:') ? t.coverUrl.replace(/^music:/, 'file:') : t.coverUrl,
  }), []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isElectron) {
        try {
          const cached = await electronAPI()?.loadCache();
          if (cancelled) return;
          if (cached && cached.tracks.length > 0) {
            finishScanRef.current(cached.tracks.map(normalizeTrack), cached.sourceName || '本地音乐');
            toast.success(`已从缓存加载 ${cached.tracks.length} 首音乐，无需重新解析`);
          }
        } catch {
          /* 缓存不可用，静默 */
        }
        return;
      }
      try {
        const handle = await getDirHandle();
        if (!handle || cancelled) return;
        const perm = await handle.queryPermission({ mode: 'read' });
        if (cancelled) return;
        if (perm === 'granted') {
          await runScanRef.current(handle, handle.name);
        } else if (perm === 'prompt') {
          setPendingDir(handle);
        }
      } catch {
        /* 无法恢复，静默 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    tracks,
    sourceName,
    scanning,
    done,
    total,
    pendingDir,
    importFolder,
    importFiles,
    importDropped,
    restoreDir: () => restoreDir(pendingDir),
    removeSource,
    removeTrack,
  };
}
