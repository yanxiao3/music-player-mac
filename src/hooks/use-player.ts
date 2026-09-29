// hook: usePlayer — 播放引擎：单例音频、队列、进度、音量、随机与循环
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { store } from '@/lib/storage';
import type { ITrack, RepeatMode } from '@/lib/types';

export interface IPlayerApi {
  queue: ITrack[];
  current: ITrack | null;
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  playQueue: (tracks: ITrack[], startIndex?: number) => void;
  playAt: (index: number) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  removeFromQueue: (id: string) => void;
}

export function usePlayer(): IPlayerApi {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<ITrack[]>([]);
  // 未洗牌的基础队列：顺序模式的播放顺序，也是随机模式洗牌前的底本
  const [baseQueue, setBaseQueue] = useState<ITrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState<number>(() => store.get<number>('volume', 0.8));
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const stateRef = useRef({ queue, currentIndex, repeat, shuffle });
  useEffect(() => {
    stateRef.current = { queue, currentIndex, repeat, shuffle };
  }, [queue, currentIndex, repeat, shuffle]);

  const baseQueueRef = useRef(baseQueue);
  useEffect(() => {
    baseQueueRef.current = baseQueue;
  }, [baseQueue]);

  // 洗牌一次（点击随机按钮时调用，切歌不再逐首重洗）
  const shuffleArray = useCallback((arr: ITrack[]): ITrack[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, []);

  const loadAndPlay = useCallback((track: ITrack, index: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentIndex(index);
    setCurrentTime(0);
    setDuration(track.duration || 0);
    audio.volume = volumeRef.current;
    audio.src = track.src;
    audio.play().then(
      () => setIsPlaying(true),
      (e: unknown) => {
        setIsPlaying(false);
        const err = e as { name?: string; message?: string };
        if (err?.name === 'NotAllowedError') {
          toast.error(`浏览器拦截了自动播放，请点击播放按钮重试：${track.title}`);
        } else {
          toast.error(`无法播放：${track.title}（${err?.name ?? ''} ${err?.message ?? ''}）`);
        }
      },
    );
  }, []);

  const playNext = useCallback(
    (reason: 'ended' | 'error') => {
      const audio = audioRef.current;
      if (!audio) return;
      const s = stateRef.current;
      if (s.queue.length === 0) return;
      if (reason === 'ended' && s.repeat === 'one') {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      // 按当前队列顺序播放：随机开启时队列已是点击随机那一刻洗牌好的顺序，
      // 切歌时顺延即可，不再每首重新随机
      let nextIndex = s.currentIndex + 1;
      if (nextIndex >= s.queue.length) {
        if (s.repeat === 'all') {
          nextIndex = 0;
        } else {
          setCurrentIndex(-1);
          setIsPlaying(false);
          audio.pause();
          return;
        }
      }
      loadAndPlay(s.queue[nextIndex], nextIndex);
    },
    [loadAndPlay],
  );

  const playNextRef = useRef<(reason: 'ended' | 'error') => void>(() => {});
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // 单例音频元素与事件绑定
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => playNextRef.current('ended');
    const onError = () => {
      const code = audio.error ? audio.error.code : '?';
      const msg = audio.error?.message || '';
      toast.error(`播放失败（错误码 ${code} ${msg}），已自动跳过`);
      playNextRef.current('error');
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audioRef.current = null;
    };
  }, []);

  const playQueue = useCallback(
    (tracks: ITrack[], startIndex = 0) => {
      if (tracks.length === 0) return;
      setBaseQueue(tracks);
      // 随机已开启：以用户点选的歌曲为起点，其余洗牌一次
      if (stateRef.current.shuffle) {
        const shuffled = shuffleArray(tracks);
        setQueue(shuffled);
        const id = tracks[startIndex]?.id;
        const ni = shuffled.findIndex((t) => t.id === id);
        loadAndPlay(shuffled[Math.max(0, ni)], Math.max(0, ni));
      } else {
        setQueue(tracks);
        loadAndPlay(tracks[startIndex], startIndex);
      }
    },
    [loadAndPlay, shuffleArray],
  );

  const playAt = useCallback(
    (index: number) => {
      const s = stateRef.current;
      if (index < 0 || index >= s.queue.length) return;
      loadAndPlay(s.queue[index], index);
    },
    [loadAndPlay],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || currentIndex < 0) return;
    if (audio.paused) {
      audio.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false),
      );
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [currentIndex]);

  const next = useCallback(() => playNext('ended'), [playNext]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const s = stateRef.current;
    if (s.queue.length === 0) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    let idx = s.currentIndex - 1;
    if (idx < 0) idx = s.queue.length - 1;
    loadAndPlay(s.queue[idx], idx);
  }, [loadAndPlay]);

  const seek = useCallback((t: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = t;
    setCurrentTime(t);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    const audio = audioRef.current;
    if (audio) audio.volume = v;
    store.set('volume', v);
  }, []);

  const toggleShuffle = useCallback(() => {
    const s = stateRef.current;
    const next = !s.shuffle;
    setShuffle(next);
    // 底本：未洗牌的基础队列；队列为空（首次播放前）则用当前队列
    const base = baseQueueRef.current.length > 0 ? baseQueueRef.current : s.queue;
    const curId = s.queue[s.currentIndex]?.id;
    if (next) {
      // 开启随机：整份队列洗牌一次，正在播放的歌曲保持在播放位
      const shuffled = shuffleArray(base);
      setQueue(shuffled);
      const ni = curId ? shuffled.findIndex((t) => t.id === curId) : -1;
      setCurrentIndex(ni >= 0 ? ni : s.currentIndex);
    } else {
      // 关闭随机：恢复基础顺序
      setQueue(base);
      const ni = curId ? base.findIndex((t) => t.id === curId) : -1;
      setCurrentIndex(ni >= 0 ? ni : s.currentIndex);
    }
  }, [shuffleArray]);

  const toggleRepeat = useCallback(
    () => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
    [],
  );

  // 从播放队列移除歌曲（配合侧栏删除）：正在播放被删则顺移到下一首；同步更新基础队列
  const removeFromQueue = useCallback(
    (id: string) => {
      const audio = audioRef.current;
      if (!audio) return;
      const s = stateRef.current;
      const idx = s.queue.findIndex((t) => t.id === id);
      if (idx < 0) return;
      const next = s.queue.filter((t) => t.id !== id);
      setBaseQueue((b) => b.filter((t) => t.id !== id));
      if (next.length === 0) {
        audio.pause();
        setQueue([]);
        setCurrentIndex(-1);
        setIsPlaying(false);
        return;
      }
      if (idx === s.currentIndex) {
        const nidx = Math.min(idx, next.length - 1);
        setQueue(next);
        loadAndPlay(next[nidx], nidx);
      } else {
        const nidx = idx < s.currentIndex ? s.currentIndex - 1 : s.currentIndex;
        setQueue(next);
        setCurrentIndex(nidx);
      }
    },
    [loadAndPlay],
  );

  return {
    queue,
    current,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    shuffle,
    repeat,
    playQueue,
    playAt,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    toggleRepeat,
    removeFromQueue,
  };
}
