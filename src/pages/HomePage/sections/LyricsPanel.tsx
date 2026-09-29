// 网易云风格歌词：16 行可视，当前句始终居中高亮，文本完整显示不省略，透明无边框，随播放进度滚动
import { useLayoutEffect, useRef } from 'react';
import { Music2 } from 'lucide-react';
import type { ITrack } from '@/lib/types';
import { cn } from '@/lib/utils';

const LINE_H = 44;
const VISIBLE = 16;
const PANEL_H = LINE_H * VISIBLE;

export interface LyricsPanelProps {
  track: ITrack;
  currentTime: number;
}

export default function LyricsPanel({ track, currentTime }: LyricsPanelProps) {
  const lyrics = track.lyrics;
  const credit = [track.lyricist && `作词:${track.lyricist}`, track.composer && `作曲:${track.composer}`]
    .filter(Boolean)
    .join('  ');

  const synced = lyrics && lyrics.kind === 'synced' ? lyrics.lines : null;
  const activeIndex = synced
    ? synced.reduce((acc, line, i) => (line.time <= currentTime + 0.25 ? i : acc), -1)
    : -1;

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  // 滚动：让正在播放的句子始终处于可视窗口的中间
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;
    const target = active.offsetTop + active.offsetHeight / 2 - scroller.clientHeight / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [activeIndex]);

  const maskStyle = {
    WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%)',
    maskImage: 'linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%)',
  };

  if (!lyrics) {
    return (
      <div
        className="flex w-full items-center justify-center gap-2 text-foreground/35"
        style={{ height: PANEL_H }}
      >
        <Music2 className="h-5 w-5" />
        <span className="text-sm">暂无歌词</span>
      </div>
    );
  }

  // 有 LRC 时间戳：跟随播放进度滚动，当前句居中高亮
  if (synced) {
    return (
      <div className="flex w-full flex-col items-start gap-2">
        {credit && <p className="max-w-full truncate text-xs text-foreground/40">{credit}</p>}
        <div ref={scrollRef} className="relative w-full overflow-hidden" style={{ height: PANEL_H, ...maskStyle }}>
          <div className="flex flex-col">
            {synced.map((line, i) => (
              <p
                key={`${line.time}-${i}`}
                ref={i === activeIndex ? activeRef : undefined}
                data-lyric-line
                className={cn(
                  'whitespace-pre-wrap text-2xl leading-[44px] transition-colors duration-300',
                  i === activeIndex ? 'font-semibold text-foreground' : 'text-foreground/35',
                )}
              >
                {line.text || '\u3000'}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 无时间戳：纯文本歌词，滚动查看全部
  if (lyrics.kind === 'plain') {
    const plainLines = lyrics.text.split(/\r?\n/).filter(Boolean);
    return (
      <div className="flex w-full flex-col items-start gap-2">
        {credit && <p className="max-w-full truncate text-xs text-foreground/40">{credit}</p>}
        <div ref={scrollRef} className="relative w-full overflow-hidden" style={{ height: PANEL_H, ...maskStyle }}>
          <div className="flex flex-col">
            {plainLines.map((text, i) => (
              <p key={i} data-lyric-line className="whitespace-pre-wrap text-2xl leading-[44px] text-foreground/45">
                {text || '\u3000'}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return null;
}
