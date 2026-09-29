// EXPORTS: parseLrc, normalizeLyricsText
import type { ILyricsData, ILyricsLine } from './types';

export function parseLrc(text: string): ILyricsLine[] | null {
  const out: ILyricsLine[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const times: number[] = [];
    const re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const mins = Number(m[1]);
      const secs = Number(m[2]);
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      times.push(mins * 60 + secs + frac);
    }
    if (times.length === 0) continue;
    const content = raw.slice(raw.lastIndexOf(']') + 1).trim();
    if (!content) continue;
    for (const t of times) out.push({ time: t, text: content });
  }
  if (out.length === 0) return null;
  out.sort((a, b) => a.time - b.time);
  return out;
}

export function normalizeLyricsText(raw: unknown): ILyricsData {
  if (raw == null) return null;
  let text = '';
  if (typeof raw === 'string') {
    text = raw;
  } else if (Array.isArray(raw)) {
    text = raw
      .map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object' && 'text' in x) return String((x as { text: unknown }).text);
        return '';
      })
      .filter(Boolean)
      .join('\n');
  } else if (typeof raw === 'object') {
    const o = raw as { text?: unknown };
    if (typeof o.text === 'string') text = o.text;
  }
  if (!text.trim()) return null;
  const synced = parseLrc(text);
  if (synced) return { kind: 'synced', lines: synced };
  return { kind: 'plain', text: text.trim() };
}
