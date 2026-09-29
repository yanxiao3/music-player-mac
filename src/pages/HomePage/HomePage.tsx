// 首页：本地音乐播放器主界面
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FolderUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLibrary } from '@/hooks/use-library';
import { usePlayer } from '@/hooks/use-player';
import { albumTracks, artistTracks, groupAlbums, groupArtists } from '@/lib/group';
import { extractCoverColors } from '@/lib/color';
import type { ICoverColors, ITrack } from '@/lib/types';
import CoverBackdrop from './sections/CoverBackdrop';
import SidebarNav, { type SidebarTab } from './sections/SidebarNav';
import PlayerScreen from './sections/PlayerScreen';
import QueuePanel from './sections/QueuePanel';
import EmptyState from './sections/EmptyState';
import { electronAPI, isElectron } from '@/lib/electron';

export default function HomePage() {
  const library = useLibrary();
  const player = usePlayer();
  const { playQueue } = player;
  const { importFolder, importFiles, restoreDir, importDropped } = library;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('all');
  const [coverColors, setCoverColors] = useState<{ url: string; colors: ICoverColors } | null>(null);
  const [coverRect, setCoverRect] = useState<DOMRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const albums = groupAlbums(library.tracks);
  const artists = groupArtists(library.tracks);

  const handlePickAlbum = useCallback(
    (key: string) => {
      const list = albumTracks(library.tracks, key);
      if (list.length > 0) playQueue(list, 0);
    },
    [library.tracks, playQueue],
  );

  const handlePickArtist = useCallback(
    (name: string) => {
      const list = artistTracks(library.tracks, name);
      if (list.length > 0) playQueue(list, 0);
    },
    [library.tracks, playQueue],
  );

  // 「所有」视图：从全部歌曲的第 index 首开始播放
  const handlePickTrack = useCallback(
    (index: number) => {
      if (library.tracks.length > 0) playQueue(library.tracks, index);
    },
    [library.tracks, playQueue],
  );

  // 播放按钮：未在播放时从全库开始（开随机则随机起点，否则顺序）；已播放则暂停/继续
  const { current, shuffle, togglePlay } = player;
  const handleTogglePlay = useCallback(() => {
    if (!current) {
      if (library.tracks.length === 0) return;
      const start = shuffle ? Math.floor(Math.random() * library.tracks.length) : 0;
      playQueue(library.tracks, start);
    } else {
      togglePlay();
    }
  }, [current, shuffle, library.tracks, playQueue, togglePlay]);

  // 键盘快捷键：空格播放/暂停，←/→ 上一曲/下一曲（输入框、进度条、音量条聚焦时不抢键）
  const togglePlayRef = useRef(handleTogglePlay);
  useEffect(() => {
    togglePlayRef.current = handleTogglePlay;
  }, [handleTogglePlay]);
  const nextRef = useRef(player.next);
  useEffect(() => {
    nextRef.current = player.next;
  }, [player.next]);
  const prevRef = useRef(player.prev);
  useEffect(() => {
    prevRef.current = player.prev;
  }, [player.prev]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const textish =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(t?.isContentEditable);
      if (e.code === 'Space') {
        if (textish) return; // 输入场景不拦截（按钮聚焦时空格走原生点击）
        e.preventDefault();
        togglePlayRef.current();
      } else if (e.key === 'ArrowRight') {
        if (textish || t?.getAttribute('role') === 'slider') return; // 进度/音量条聚焦时方向键用于调节
        e.preventDefault();
        nextRef.current();
      } else if (e.key === 'ArrowLeft') {
        if (textish || t?.getAttribute('role') === 'slider') return;
        e.preventDefault();
        prevRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 当前封面重点色 → 背景氛围（异步提取 + 缓存 + 换歌瞬间沿用旧色，避免闪烁）
  const currentCoverUrl = player.current?.coverUrl;
  const colorsCacheRef = useRef(new Map<string, ICoverColors>());
  const [lastColors, setLastColors] = useState<ICoverColors | null>(null);
  useEffect(() => {
    const cover = currentCoverUrl;
    if (!cover) return;
    const cached = colorsCacheRef.current.get(cover);
    if (cached) {
      setLastColors(cached);
      setCoverColors({ url: cover, colors: cached });
      return;
    }
    let cancelled = false;
    void extractCoverColors(cover).then((c) => {
      if (cancelled) return;
      colorsCacheRef.current.set(cover, c);
      setLastColors(c);
      setCoverColors({ url: cover, colors: c });
    });
    return () => {
      cancelled = true;
    };
  }, [currentCoverUrl]);

  // 无封面（未播放/空态）时清空背景锚点，避免残留上一首的位置
  useEffect(() => {
    if (!player.current) {
      const raf = requestAnimationFrame(() => setCoverRect(null));
      return () => cancelAnimationFrame(raf);
    }
    // player.current 是稳定到每次渲染的 getter，播放状态变化由播放器内部事件驱动重渲染
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.current]);

  const colors =
    currentCoverUrl && coverColors && coverColors.url === currentCoverUrl
      ? coverColors.colors
      : currentCoverUrl
        ? lastColors
        : null;

  const handleImportFolder = useCallback(() => {
    void importFolder();
  }, [importFolder]);

  const handleImportFiles = useCallback(
    (files?: File[]) => {
      void importFiles(files);
    },
    [importFiles],
  );

  const handleRestoreDir = useCallback(() => {
    void restoreDir();
  }, [restoreDir]);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) handleImportFiles(files);
    e.target.value = '';
  }, [handleImportFiles]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setDragging(false);
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        void importDropped(e.dataTransfer.items);
      }
    },
    [importDropped],
  );

  // 右键菜单动作：删除歌曲（同步移除播放队列项）；在文件管理器中定位
  const handleRemoveTrack = useCallback(
    (track: ITrack) => {
      library.removeTrack(track.id);
      player.removeFromQueue(track.id);
      toast.info(`已删除：${track.title}`);
    },
    [library, player],
  );

  const handleShowInFolder = useCallback((track: ITrack) => {
    if (!isElectron || !track.relPath) return;
    void electronAPI()?.showInFolder(track.relPath);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCountRef.current += 1;
    setDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCountRef.current = Math.max(0, dragCountRef.current - 1);
    if (dragCountRef.current === 0) setDragging(false);
  }, []);

  const showEmpty = library.tracks.length === 0;

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden bg-background text-foreground"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CoverBackdrop colors={colors} coverRect={coverRect} />
      <SidebarNav
        open={sidebarOpen}
        onToggleOpen={() => setSidebarOpen((o) => !o)}
        tab={sidebarTab}
        onTabChange={setSidebarTab}
        tracks={library.tracks}
        albums={albums}
        artists={artists}
        current={player.current}
        onPickTrack={handlePickTrack}
        onPickAlbum={handlePickAlbum}
        onPickArtist={handlePickArtist}
        onRemoveTrack={handleRemoveTrack}
        onShowInFolder={handleShowInFolder}
      />
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* 右上角导入入口：点击向下展开导入歌曲/文件夹 */}
        <div className="absolute right-4 top-4 z-20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <FolderUp className="h-4 w-4" />
                {library.scanning ? `导入中 ${library.done}/${library.total}` : '导入歌曲'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  if (isElectron) {
                    void handleImportFiles();
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
              >
                导入歌曲
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleImportFolder}>导入文件夹</DropdownMenuItem>
              {library.tracks.length > 0 && <DropdownMenuSeparator />}
              {library.tracks.length > 0 && (
                <DropdownMenuItem onClick={library.removeSource} className="text-destructive">
                  清空音乐库
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.lrc"
          multiple
          className="hidden"
          onChange={handleFilePick}
        />
        {showEmpty ? (
          <EmptyState
            scanning={library.scanning}
            done={library.done}
            total={library.total}
            pendingDir={library.pendingDir}
            onPickFolder={handleImportFolder}
            onPickFiles={handleImportFiles}
            onRestoreDir={handleRestoreDir}
          />
        ) : (
          <PlayerScreen
            current={player.current}
            isPlaying={player.isPlaying}
            currentTime={player.currentTime}
            duration={player.duration}
            volume={player.volume}
            shuffle={player.shuffle}
            onTogglePlay={handleTogglePlay}
            onNext={player.next}
            onPrev={player.prev}
            onSeek={player.seek}
            onVolume={player.setVolume}
            onToggleShuffle={player.toggleShuffle}
            onCoverRect={setCoverRect}
          />
        )}
        {!showEmpty && (
          <QueuePanel
            queue={player.queue}
            currentIndex={player.currentIndex}
            isPlaying={player.isPlaying}
            onPlayAt={player.playAt}
          />
        )}
      </main>
      {dragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-foreground/30 bg-background/80">
          <p className="text-lg font-medium">松开以导入音乐</p>
        </div>
      )}
    </div>
  );
}
