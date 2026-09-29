// EXPORTS: scanDirectory, parseFileList, importDroppedItems
import { isAudioFile, parseAudioFile } from './metadata';
import type { ITrack } from './types';

export interface IImportProgress {
  done: number;
  total: number;
}

export type ProgressFn = (p: IImportProgress) => void;

interface IFileEntry {
  relPath: string;
  file: File;
}

const CONCURRENCY = 5;

export async function scanDirectory(
  handle: FileSystemDirectoryHandle,
  onProgress: ProgressFn,
): Promise<ITrack[]> {
  const entries: IFileEntry[] = [];
  const lrcFiles = new Map<string, File>();
  await walkDir(handle, '', 0, entries, lrcFiles);
  return parseEntries(entries, lrcFiles, onProgress);
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  rel: string,
  depth: number,
  entries: IFileEntry[],
  lrcFiles: Map<string, File>,
): Promise<void> {
  for await (const [name, entry] of dir.entries()) {
    const childRel = rel ? `${rel}/${name}` : name;
    if (entry.kind === 'file') {
      if (isAudioFile(name)) {
        entries.push({ relPath: childRel, file: await entry.getFile() });
      } else if (name.toLowerCase().endsWith('.lrc')) {
        lrcFiles.set(childRel.replace(/\.lrc$/i, ''), await entry.getFile());
      }
    } else if (entry.kind === 'directory' && depth < 5) {
      await walkDir(entry, childRel, depth + 1, entries, lrcFiles);
    }
  }
}

export async function parseFileList(files: File[], onProgress: ProgressFn): Promise<ITrack[]> {
  const entries: IFileEntry[] = [];
  const lrcFiles = new Map<string, File>();
  for (const f of files) {
    if (isAudioFile(f.name)) {
      entries.push({ relPath: f.name, file: f });
    } else if (f.name.toLowerCase().endsWith('.lrc')) {
      lrcFiles.set(f.name.replace(/\.lrc$/i, ''), f);
    }
  }
  return parseEntries(entries, lrcFiles, onProgress);
}

export async function importDroppedItems(
  items: DataTransferItemList,
  onProgress: ProgressFn,
): Promise<ITrack[]> {
  const entries: IFileEntry[] = [];
  const lrcFiles = new Map<string, File>();
  const roots: FileSystemEntry[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) roots.push(entry);
  }
  await walkEntries(roots, '', 0, entries, lrcFiles);
  return parseEntries(entries, lrcFiles, onProgress);
}

async function walkEntries(
  list: FileSystemEntry[],
  rel: string,
  depth: number,
  entries: IFileEntry[],
  lrcFiles: Map<string, File>,
): Promise<void> {
  for (const entry of list) {
    if (entry.isFile) {
      const file = await entryFile(entry as FileSystemFileEntry);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (isAudioFile(entry.name)) {
        entries.push({ relPath: childRel, file });
      } else if (entry.name.toLowerCase().endsWith('.lrc')) {
        lrcFiles.set(childRel.replace(/\.lrc$/i, ''), file);
      }
    } else if (entry.isDirectory && depth < 5) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children = await readDirEntries(reader);
      await walkEntries(children, rel ? `${rel}/${entry.name}` : entry.name, depth + 1, entries, lrcFiles);
    }
  }
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file((f) => resolve(f), (err) => reject(err));
  });
}

function readDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(out);
            return;
          }
          out.push(...batch);
          readBatch();
        },
        (err) => reject(err),
      );
    };
    readBatch();
  });
}

async function parseEntries(
  entries: IFileEntry[],
  lrcFiles: Map<string, File>,
  onProgress: ProgressFn,
): Promise<ITrack[]> {
  const total = entries.length;
  const results: (ITrack | null)[] = new Array(total);
  let done = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < total) {
      const i = idx;
      idx += 1;
      const e = entries[i];
      try {
        const baseKey = e.relPath.replace(/\.[^.]+$/, '');
        const lrc = lrcFiles.get(baseKey);
        const lrcText = lrc ? await lrc.text() : undefined;
        results[i] = await parseAudioFile(e.file, e.relPath, lrcText);
      } catch {
        results[i] = null;
      }
      done += 1;
      onProgress({ done, total });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));
  return results.filter((t): t is ITrack => t !== null);
}
