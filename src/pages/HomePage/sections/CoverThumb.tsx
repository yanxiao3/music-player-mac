// 封面缩略图：有封面显示图片，无封面用确定性渐变占位
import { Music } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { hashHue, placeholderGradient } from '@/lib/color';
import { cn } from '@/lib/utils';

export interface CoverThumbProps {
  url: string | null;
  title: string;
  className?: string;
}

export default function CoverThumb({ url, title, className }: CoverThumbProps) {
  const hue = hashHue(title || '未知');
  if (url) {
    return <Image src={url} alt={title} className={cn('object-cover', className)} />;
  }
  return (
    <div
      aria-label={title}
      className={cn('flex items-center justify-center text-foreground/40', className)}
      style={{ background: placeholderGradient(hue) }}
    >
      <Music className="h-[45%] w-[45%]" />
    </div>
  );
}
