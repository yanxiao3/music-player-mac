// EXPORTS: groupAlbums, groupArtists, albumTracks, artistTracks
import type { IAlbumGroup, IArtistGroup, ITrack } from './types';

function albumKey(t: ITrack): string {
  return `${t.album}::${t.albumArtist}`;
}

export function groupAlbums(tracks: ITrack[]): IAlbumGroup[] {
  const map = new Map<string, IAlbumGroup>();
  for (const t of tracks) {
    const key = albumKey(t);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        album: t.album,
        artist: t.albumArtist,
        coverUrl: null,
        trackCount: 0,
        totalDuration: 0,
        trackIds: [],
      };
      map.set(key, g);
    }
    g.trackCount += 1;
    g.totalDuration += t.duration || 0;
    g.trackIds.push(t.id);
    if (!g.coverUrl && t.coverUrl) g.coverUrl = t.coverUrl;
  }
  return [...map.values()].sort((a, b) => a.album.localeCompare(b.album, 'zh-Hans-CN'));
}

export function groupArtists(tracks: ITrack[]): IArtistGroup[] {
  const map = new Map<string, IArtistGroup>();
  for (const t of tracks) {
    const name = t.artist;
    let g = map.get(name);
    if (!g) {
      g = { name, coverUrl: null, trackCount: 0, albumCount: 0, trackIds: [] };
      map.set(name, g);
    }
    g.trackCount += 1;
    g.trackIds.push(t.id);
    if (!g.coverUrl && t.coverUrl) g.coverUrl = t.coverUrl;
  }
  const albumSets = new Map<string, Set<string>>();
  for (const t of tracks) {
    const set = albumSets.get(t.artist);
    if (set) set.add(t.album);
    else albumSets.set(t.artist, new Set([t.album]));
  }
  for (const g of map.values()) g.albumCount = albumSets.get(g.name)?.size ?? 0;
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

export function albumTracks(tracks: ITrack[], key: string): ITrack[] {
  return tracks
    .filter((t) => albumKey(t) === key)
    .sort((a, b) => (a.trackNo ?? 999) - (b.trackNo ?? 999) || a.title.localeCompare(b.title, 'zh-Hans-CN'));
}

export function artistTracks(tracks: ITrack[], name: string): ITrack[] {
  return tracks.filter((t) => t.artist === name);
}
