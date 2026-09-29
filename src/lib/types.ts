// EXPORTS: ITrack, IAlbumGroup, IArtistGroup, ILyricsLine, ILyricsData, ICoverColors, RepeatMode
export type RepeatMode = 'off' | 'all' | 'one';

export interface ILyricsLine {
  time: number;
  text: string;
}

export type ILyricsData =
  | { kind: 'synced'; lines: ILyricsLine[] }
  | { kind: 'plain'; text: string }
  | null;

export interface ITrack {
  id: string;
  fileName: string;
  relPath: string;
  src: string;
  coverUrl: string | null;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: number | null;
  genre: string;
  trackNo: number | null;
  composer: string;
  lyricist: string;
  duration: number;
  lyrics: ILyricsData;
  size: number;
  lastModified: number;
  /** 元数据解析是否成功（false 表示文件标签无法解析，歌手/专辑等信息为未知） */
  metaOk: boolean;
}

export interface IAlbumGroup {
  key: string;
  album: string;
  artist: string;
  coverUrl: string | null;
  trackCount: number;
  totalDuration: number;
  trackIds: string[];
}

export interface IArtistGroup {
  name: string;
  coverUrl: string | null;
  trackCount: number;
  albumCount: number;
  trackIds: string[];
}

export interface ICoverColors {
  main: string;
  accent: string;
}
