// EXPORTS: extractCoverColors, toRgba, hashHue, placeholderGradient
import type { ICoverColors } from './types';

const FALLBACK: ICoverColors = { main: 'rgb(90, 90, 90)', accent: 'rgb(150, 150, 150)' };

interface IHistBin {
  count: number;
  r: number;
  g: number;
  b: number;
}

const RGB_RE = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/;

function toRgb(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function toRgba(rgb: string, alpha: number): string {
  const m = RGB_RE.exec(rgb);
  if (!m) return rgb;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

function hueOf(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueDistance(a: IHistBin, b: IHistBin): number {
  const h1 = hueOf(a.r, a.g, a.b);
  const h2 = hueOf(b.r, b.g, b.b);
  let d = Math.abs(h1 - h2);
  if (d > 180) d = 360 - d;
  return d;
}

function lighten(rgb: string, amount: number): string {
  const m = RGB_RE.exec(rgb);
  if (!m) return rgb;
  const ch = (v: string) => Math.min(255, Math.round(Number(v) + amount));
  return `rgb(${ch(m[1])}, ${ch(m[2])}, ${ch(m[3])})`;
}

// ── 提亮提饱和：保持色相不变，让深色/低饱和封面的重点色在黑色背景上清晰可见 ──
function toHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hp < 1) {
    rp = c; gp = x;
  } else if (hp < 2) {
    rp = x; gp = c;
  } else if (hp < 3) {
    gp = c; bp = x;
  } else if (hp < 4) {
    gp = x; bp = c;
  } else if (hp < 5) {
    rp = x; bp = c;
  } else {
    rp = c; bp = x;
  }
  const m = l - c / 2;
  return [Math.round((rp + m) * 255), Math.round((gp + m) * 255), Math.round((bp + m) * 255)];
}

function vividize(r: number, g: number, b: number, minLight: number, minSat: number): [number, number, number] {
  const { h, s, l } = toHsl(r, g, b);
  return fromHsl(h, Math.max(s, minSat), Math.max(l, minLight));
}

function quantize(data: Uint8ClampedArray): ICoverColors {
  const bins = new Map<number, IHistBin>();
  const rawBins = new Map<number, IHistBin>();
  // 整体饱和度统计 + 亮度直方图：用于识别黑白/灰调封面
  let satSum = 0;
  let coloredCount = 0;
  let totalCount = 0;
  const lumHist = new Map<number, { count: number; lumSum: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    totalCount += 1;
    satSum += sat;
    if (sat >= 0.12) coloredCount += 1;
    const lk = Math.min(31, Math.floor(lum * 32));
    const lb = lumHist.get(lk);
    if (lb) {
      lb.count += 1;
      lb.lumSum += lum;
    } else {
      lumHist.set(lk, { count: 1, lumSum: lum });
    }
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const put = (map: Map<number, IHistBin>) => {
      const bin = map.get(key);
      if (bin) {
        bin.count += 1;
        bin.r += r;
        bin.g += g;
        bin.b += b;
      } else {
        map.set(key, { count: 1, r, g, b });
      }
    };
    put(rawBins);
    // 主色候选：滤掉接近黑/白和灰调的噪声像素，让重点色更贴近封面真实主色
    if (lum < 0.08 || lum > 0.92 || sat < 0.12) continue;
    put(bins);
  }
  // 灰阶封面（黑白/灰调，整体饱和度低）：输出中性灰，保持黑白色调，
  // 避免把压缩噪声/伪影的零星彩色像素取成粉色等错误主色
  const avgSat = totalCount > 0 ? satSum / totalCount : 0;
  const coloredRatio = totalCount > 0 ? coloredCount / totalCount : 0;
  if (totalCount > 0 && (avgSat < 0.18 || coloredRatio < 0.25)) {
    const peak = [...lumHist.values()].sort((x, y) => y.count - x.count)[0];
    const v = Math.round((peak.lumSum / peak.count) * 255);
    const clamp = (n: number) => Math.max(16, Math.min(240, n));
    const main = toRgb(v, v, v);
    const accentV = v > 150 ? clamp(v - 110) : clamp(v + 120);
    const accent = toRgb(accentV, accentV, accentV);
    return { main, accent };
  }
  const source = bins.size > 0 ? bins : rawBins;
  if (source.size === 0) return FALLBACK;
  const list = [...source.values()]
    .map((b) => ({ r: b.r / b.count, g: b.g / b.count, b: b.b / b.count, count: b.count }))
    .sort((x, y) => y.count - x.count);
  const top = list[0];
  // 主色：提高亮度与饱和度，保证深色封面也能在黑色背景上呈现明显变色
  const [mr, mg, mb] = vividize(top.r, top.g, top.b, 0.38, 0.46);
  const main = toRgb(mr, mg, mb);
  let accent = main;
  let best = 0.2;
  for (const c of list.slice(0, 16)) {
    const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    if (lum < 0.28) continue;
    const d = hueDistance(c, top);
    if (d > best) {
      best = d;
      // 辅助色：提亮幅度更大，让发光更有层次
      const [ar, ag, ab] = vividize(c.r, c.g, c.b, 0.52, 0.6);
      accent = toRgb(ar, ag, ab);
    }
  }
  if (accent === main) accent = lighten(main, 60);
  return { main, accent };
}

export function extractCoverColors(url: string): Promise<ICoverColors> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(FALLBACK);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        resolve(quantize(data));
      } catch {
        resolve(FALLBACK);
      }
    };
    img.onerror = () => resolve(FALLBACK);
    // 跨源（自定义协议封面）必须匿名加载，否则 canvas 被污染、getImageData 抛错；
    // file:// 封面同源（Chromium 无 CORS 检查），若设 crossorigin 反而会加载失败
    if (!url.startsWith('file:')) img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

export function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function placeholderGradient(hue: number): string {
  return `linear-gradient(135deg, hsl(${hue} 38% 30%), hsl(${(hue + 42) % 360} 45% 16%))`;
}
