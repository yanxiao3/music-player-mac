// 播放主界面：左侧大封面+歌名/歌手，右侧歌词常显，底部透明控制条
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Music2,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import CoverThumb from './CoverThumb';
import LyricsPanel from './LyricsPanel';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ITrack } from '@/lib/types';

export interface PlayerScreenProps {
  current: ITrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
  onToggleShuffle: () => void;
  onCoverRect?: (rect: DOMRect | null) => void;
}

export default function PlayerScreen({
  current,
  isPlaying,
  currentTime,
  duration,
  volume,
  shuffle,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onVolume,
  onToggleShuffle,
  onCoverRect,
}: PlayerScreenProps) {
  // 组合整体右移：让「封面与歌词之间的空隙中心」对齐歌词第一行第二个字（网易云式观感）
  // 右移量按真实测量计算，并 clamp 到不超出内容区右缘（小窗口下避免溢出）
  const contentRef = useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const coverBoxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      const el = contentRef.current;
      if (!el) return;
      const cover = el.querySelector<HTMLElement>('[data-cover]');
      const lyrics = el.querySelector<HTMLElement>('[data-lyrics]');
      if (!cover || !lyrics) return;
      const coverRect = cover.getBoundingClientRect();
      const lyricRect = lyrics.getBoundingClientRect();
      const gapCenter = (coverRect.right + lyricRect.left) / 2;
      // 歌词第一行前两个字的范围 → 第二字中心
      let char2x = lyricRect.left + 20;
      const firstLine = lyrics.querySelector<HTMLElement>('[data-lyric-line]');
      if (firstLine && firstLine.firstChild && firstLine.firstChild.nodeType === Node.TEXT_NODE) {
        try {
          const txt = firstLine.firstChild.textContent || '';
          if (txt.trim().length >= 2) {
            const rng = document.createRange();
            rng.setStart(firstLine.firstChild, 0);
            rng.setEnd(firstLine.firstChild, 2);
            const r = rng.getBoundingClientRect();
            if (r.width > 0) char2x = r.left + r.width / 2;
          }
        } catch {
          /* 保留 fallback */
        }
      }
      const comboW = coverRect.width + (lyricRect.left - coverRect.right) + lyricRect.width;
      const mainW = el.getBoundingClientRect().width;
      const maxShift = Math.max(0, (mainW - comboW) / 2);
      const target = char2x - gapCenter;
      setOffsetX(Math.round(Math.min(target, maxShift)));
    };
    raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [current?.id]);

  // 上报封面在窗口中的位置，供背景层以封面为圆心发光
  const reportCoverRect = useCallback(() => {
    const box = coverBoxRef.current;
    onCoverRect?.(box ? box.getBoundingClientRect() : null);
  }, [onCoverRect]);

  useLayoutEffect(() => {
    const box = coverBoxRef.current;
    if (!box) return;
    let raf = 0;
    const run = () => {
      raf = requestAnimationFrame(reportCoverRect);
    };
    const ro = new ResizeObserver(run);
    ro.observe(box);
    window.addEventListener('resize', run);
    run();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', run);
    };
  }, [current?.id, reportCoverRect]);

  if (!current) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-8">
        <div className="flex h-44 w-44 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground">
          <Music2 className="h-16 w-16" />
        </div>
        <p className="text-sm text-muted-foreground">音乐已就绪，点击播放开始播放全部歌曲</p>
        <Button
          type="button"
          size="icon"
          onClick={onTogglePlay}
          className="h-16 w-16 rounded-full shadow-lg"
          aria-label="播放"
        >
          <Play className="ml-0.5 h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 内容区：左侧封面+歌手/歌名，右侧歌词独立整列（16 行完整显示），整体居中 + 空隙右移 */}
      <div
        ref={contentRef}
        className="flex min-h-0 flex-1 items-center justify-center gap-12 px-14 py-6"
        style={{ transform: `translateX(${offsetX}px)` }}
      >
        <div className="flex shrink-0 flex-col items-center gap-5">
          <div data-cover ref={coverBoxRef}>
            <CoverThumb
              url={current.coverUrl}
              title={current.title}
              className="aspect-square w-[min(50vh,440px)] rounded-2xl shadow-2xl"
            />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <p className="max-w-[min(50vh,440px)] truncate text-lg text-muted-foreground">
              {current.artist} · {current.album}
            </p>
            <h1 className="max-w-[min(50vh,440px)] truncate text-4xl font-bold tracking-tight">{current.title}</h1>
          </div>
        </div>
        <div data-lyrics className="flex w-[min(44vw,640px)] shrink-0 flex-col items-start justify-center">
          <LyricsPanel track={current} currentTime={currentTime} />
        </div>
      </div>

      {/* 底部控制条：进度 + 播放按钮 + 音量（透明无边框） */}
      <div className="flex shrink-0 items-center gap-4 px-6 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {formatDuration(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            max={Math.max(duration, 0.001)}
            step={0.1}
            onValueChange={(v) => onSeek(v[0] ?? 0)}
            className="flex-1"
          />
          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatDuration(duration)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleShuffle}
            className={cn(shuffle ? 'text-white hover:text-white' : 'text-zinc-700 hover:text-zinc-500')}
            aria-label="随机播放"
          >
            <Shuffle className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onPrev}
            className="text-muted-foreground hover:text-foreground"
            aria-label="上一首"
          >
            <SkipBack className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            size="icon"
            onClick={onTogglePlay}
            className="mx-1.5 h-12 w-12 rounded-full shadow-lg"
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onNext}
            className="text-muted-foreground hover:text-foreground"
            aria-label="下一首"
          >
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex w-36 shrink-0 items-center gap-2">
          {volume === 0 ? (
            <VolumeX className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Slider
            value={[volume]}
            max={1}
            step={0.01}
            onValueChange={(v) => onVolume(v[0] ?? 0)}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
