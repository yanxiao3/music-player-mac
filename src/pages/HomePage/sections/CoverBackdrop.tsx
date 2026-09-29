// 背景氛围层：默认纯黑；以专辑封面为圆心自发光向外扩散；切歌时先渐隐为黑，再渐出到新封面重点色
import { useEffect, useState } from 'react';
import { toRgba } from '@/lib/color';
import type { ICoverColors } from '@/lib/types';

export interface CoverBackdropProps {
  colors: ICoverColors | null;
  coverRect: DOMRect | null;
}

const FADE_MS = 320;

function layerBackground(c: ICoverColors | null, coverRect: DOMRect | null): string {
  if (!c) return 'var(--background)';
  const glow = toRgba(c.accent, 0.6);
  const mid = toRgba(c.accent, 0.34);
  const edge = toRgba(c.main, 0.28);
  if (coverRect && coverRect.width > 0) {
    // 以封面几何中心为圆心、按封面尺寸换算半径百分比，重点色从封面边缘向外
    // 大范围扩散覆盖整个中间页面（含右侧歌词区），远处才逐渐衰减到纯黑
    const cx = ((coverRect.left + coverRect.width / 2) / window.innerWidth) * 100;
    const cy = ((coverRect.top + coverRect.height / 2) / window.innerHeight) * 100;
    const coverR = (Math.max(coverRect.width, coverRect.height) / 2 / window.innerWidth) * 100;
    return `
      radial-gradient(circle at ${cx.toFixed(2)}% ${cy.toFixed(2)}%, ${glow} 0%, ${glow} ${(coverR * 0.9).toFixed(2)}%, ${mid} ${(coverR * 2.3).toFixed(2)}%, ${edge} ${(coverR * 4.4).toFixed(2)}%, rgba(0,0,0,0.78) ${(coverR * 6.8).toFixed(2)}%, #000 100%),
      var(--background)`;
  }
  // 未拿到封面位置（空态/首帧）：fallback 居中扩散
  return `
    radial-gradient(85% 120% at 50% 42%, ${glow} 0%, ${mid} 26%, ${edge} 50%, rgba(0,0,0,0.72) 76%, #000 100%),
    var(--background)`;
}

export default function CoverBackdrop({ colors, coverRect }: CoverBackdropProps) {
  const [display, setDisplay] = useState<ICoverColors | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // 先渐隐当前层到黑色，再换成新颜色渐出（全部在回调中执行）
    const fade = window.setTimeout(() => setVisible(false), 0);
    const swap = window.setTimeout(() => {
      setDisplay(colors);
      setVisible(true);
    }, FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(swap);
    };
  }, [colors]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background: layerBackground(display, coverRect),
          opacity: visible ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease`,
        }}
      />
    </div>
  );
}
