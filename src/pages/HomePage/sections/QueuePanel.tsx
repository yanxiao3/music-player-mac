// 播放队列：可折叠，默认收起；展开后点击切换播放
import { useState } from 'react';
import { AudioLines, ChevronDown, ChevronUp, ListMusic } from 'lucide-react';
import CoverThumb from './CoverThumb';
import { formatDuration } from '@/lib/format';
import type { ITrack } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface QueuePanelProps {
  queue: ITrack[];
  currentIndex: number;
  isPlaying: boolean;
  onPlayAt: (index: number) => void;
}

export default function QueuePanel({ queue, currentIndex, isPlaying, onPlayAt }: QueuePanelProps) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section className="shrink-0 border-t border-border bg-black/25 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-10 w-full items-center gap-2 px-4 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={!collapsed}
      >
        <ListMusic className="h-4 w-4" />
        播放队列
        <span className="text-muted-foreground/70">({queue.length})</span>
        <span className="ml-auto flex items-center gap-2">
          {currentIndex >= 0 && queue[currentIndex] && (
            <span className="hidden max-w-[220px] truncate text-foreground/80 sm:block">
              {queue[currentIndex]?.title}
            </span>
          )}
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {!collapsed &&
        (queue.length === 0 ? (
          <p className="px-4 pb-3 text-xs text-muted-foreground">队列为空，从左侧选择歌曲开始播放</p>
        ) : (
          <div className="max-h-[30vh] overflow-y-auto px-2 pb-2">
            <ul>
              {queue.map((t, i) => {
                const active = i === currentIndex;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onPlayAt(i)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-foreground/5',
                        active && 'bg-foreground/10 hover:bg-foreground/10',
                      )}
                    >
                      <CoverThumb url={t.coverUrl} title={t.title} className="h-9 w-9 shrink-0 rounded-md" />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-sm',
                            active ? 'font-medium text-foreground' : 'text-foreground/90',
                          )}
                        >
                          {t.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{t.artist}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {active && (
                          <AudioLines
                            className={cn('h-4 w-4', isPlaying ? 'animate-pulse text-foreground' : 'text-foreground/60')}
                          />
                        )}
                        <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                          {formatDuration(t.duration)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </section>
  );
}
