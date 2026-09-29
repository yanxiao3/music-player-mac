// 浏览器端 Node 全局 polyfill：music-metadata-browser 的打包产物运行时引用 Buffer
import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  (window as unknown as { Buffer?: typeof Buffer }).Buffer = Buffer;
}

export {};
