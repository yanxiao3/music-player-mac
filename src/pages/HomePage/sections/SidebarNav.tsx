// 左侧导航栏：可伸缩，按 所有歌曲 / 专辑 / 歌手 三种视图；歌曲行支持右键菜单（删除/定位文件）
import { useEffect, useState } from 'react';
import { Disc3, FolderOpen, ListMusic, MicVocal, PanelLeftClose, PanelLeftOpen, Trash2 } from 'lucide-react';
import CoverThumb from './CoverThumb';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/electron';
import type { IAlbumGroup, IArtistGroup, ITrack } from '@/lib/types';

export type SidebarTab = 'all' | 'albums' | 'artists';

export interface SidebarNavProps {
  open: boolean;
  onToggleOpen: () => void;
  tab: SidebarTab;
  onTabChange: (t: SidebarTab) => void;
  tracks: ITrack[];
  albums: IAlbumGroup[];
  artists: IArtistGroup[];
  current: ITrack | null;
  onPickTrack: (index: number) => void;
  onPickAlbum: (key: string) => void;
  onPickArtist: (name: string) => void;
  onRemoveTrack: (track: ITrack) => void;
  onShowInFolder: (track: ITrack) => void;
}

interface CtxMenu {
  x: number;
  y: number;
  track: ITrack;
}

export default function SidebarNav({
  open,
  onToggleOpen,
  tab,
  onTabChange,
  tracks,
  albums,
  artists,
  current,
  onPickTrack,
  onPickAlbum,
  onPickArtist,
  onRemoveTrack,
  onShowInFolder,
}: SidebarNavProps) {
  const [menu, setMenu] = useState<CtxMenu | null>(null);

  // 右键菜单关闭：点击其他处 / 滚动 / Esc / 窗口失焦
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const onTrackContext = (e: React.MouseEvent, track: ITrack) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, track });
  };

  const albumActive = (g: IAlbumGroup) =>
    current !== null && current.album === g.album && current.albumArtist === g.artist;
  const artistActive = (g: IArtistGroup) => current !== null && current.artist === g.name;

  const tabBtn = (key: SidebarTab, label: string, icon: React.ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={() => onTabChange(key)}
      className={cn(
        'flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
        tab === key ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
      )}
    >
      {icon}
      {open && label}
    </button>
  );

  return (
    <aside
      className={cn(
        'relative z-10 flex h-full shrink-0 flex-col border-r border-border bg-card/40 backdrop-blur transition-[width] duration-200',
        open ? 'w-72' : 'w-[76px]',
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/10">
          <Disc3 className="h-4 w-4" />
        </div>
        {open && <span className="truncate text-sm font-semibold tracking-wide">本地音乐</span>}
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          aria-label={open ? '收起侧栏' : '展开侧栏'}
        >
          {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex gap-1 px-2">
        {tabBtn('all', '所有', <ListMusic className="h-4 w-4 shrink-0" />)}
        {tabBtn('albums', '专辑', <Disc3 className="h-4 w-4 shrink-0" />)}
        {tabBtn('artists', '歌手', <MicVocal className="h-4 w-4 shrink-0" />)}
      </div>

      <div className="mt-1 flex-1 overflow-y-auto px-2 pb-4">
        {tab === 'all'
          ? tracks.map((t, i) => {
              const active = current !== null && current.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onPickTrack(i)}
                  onContextMenu={(e) => onTrackContext(e, t)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                    active ? 'bg-foreground/10' : 'hover:bg-foreground/5',
                  )}
                >
                  <CoverThumb
                    url={t.coverUrl}
                    title={t.title}
                    className={cn('shrink-0 rounded-md', open ? 'h-10 w-10' : 'h-9 w-9')}
                  />
                  {open && (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t.artist} · {t.album}
                      </span>
                    </span>
                  )}
                </button>
              );
            })
          : tab === 'albums'
            ? albums.map((g) => {
                const active = albumActive(g);
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => onPickAlbum(g.key)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                      active ? 'bg-foreground/10' : 'hover:bg-foreground/5',
                    )}
                  >
                    <CoverThumb
                      url={g.coverUrl}
                      title={g.album}
                      className={cn('shrink-0 rounded-md', open ? 'h-10 w-10' : 'h-9 w-9')}
                    />
                    {open && (
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{g.album}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {g.artist} · {g.trackCount} 首
                        </span>
                      </span>
                    )}
                  </button>
                );
              })
            : artists.map((g) => {
                const active = artistActive(g);
                return (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => onPickArtist(g.name)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                      active ? 'bg-foreground/10' : 'hover:bg-foreground/5',
                    )}
                  >
                    <CoverThumb
                      url={g.coverUrl}
                      title={g.name}
                      className={cn('shrink-0 rounded-full', open ? 'h-10 w-10' : 'h-9 w-9')}
                    />
                    {open && (
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{g.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {g.albumCount} 张专辑 · {g.trackCount} 首
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
        {tracks.length === 0 && tab === 'all' && (
          <p className="px-2 py-4 text-xs text-muted-foreground">暂无歌曲，先导入音乐</p>
        )}
      </div>

      {/* 歌曲右键次级菜单 */}
      {menu && (
        <div
          data-ctx-menu
          className="fixed z-[60] w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <p className="truncate px-3 py-1.5 text-xs text-muted-foreground">{menu.track.title}</p>
          <button
            type="button"
            onClick={() => {
              onRemoveTrack(menu.track);
              setMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-foreground/5"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            删除歌曲
          </button>
          {isElectron && (
            <button
              type="button"
              onClick={() => {
                onShowInFolder(menu.track);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/5"
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              跳转文件所在位置
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
