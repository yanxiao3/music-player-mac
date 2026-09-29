// 空状态：无音乐库时的引导页（导入、恢复上次文件夹、扫描进度）
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { FolderOpen, Music2, RotateCcw } from 'lucide-react';
import { supportsDirPicker } from '@/lib/storage';

export interface EmptyStateProps {
  scanning: boolean;
  done: number;
  total: number;
  pendingDir: FileSystemDirectoryHandle | null;
  onPickFolder: () => void;
  onPickFiles: (files: File[]) => void;
  onRestoreDir: () => void;
}

export default function EmptyState({
  scanning,
  done,
  total,
  pendingDir,
  onPickFolder,
  onPickFiles,
  onRestoreDir,
}: EmptyStateProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canDir = supportsDirPicker();

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-8">
      <div className="flex h-52 w-52 items-center justify-center rounded-3xl bg-foreground/5 text-muted-foreground">
        <Music2 className="h-20 w-20" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-xl font-semibold tracking-tight">导入你的本地音乐</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          选择包含音乐的文件夹或单个文件，自动识别封面、歌词、歌手、专辑等信息
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={onPickFolder} disabled={scanning || !canDir}>
          <FolderOpen className="h-4 w-4" />
          选择文件夹
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
        >
          <Music2 className="h-4 w-4" />
          选择文件
        </Button>
        {pendingDir && (
          <Button type="button" variant="outline" onClick={onRestoreDir} disabled={scanning}>
            <RotateCcw className="h-4 w-4" />
            恢复上次的音乐文件夹
          </Button>
        )}
      </div>
      {scanning ? (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="h-4 w-4" />
          正在解析 {done}/{total}
        </span>
      ) : (
        <p className="text-xs text-muted-foreground">也可以直接把文件或文件夹拖进窗口</p>
      )}
      {!canDir && (
        <p className="text-xs text-muted-foreground">当前浏览器不支持选择文件夹，可用「选择文件」导入</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.lrc"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onPickFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
}
