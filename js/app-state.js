/*
  app-state.js
  ------------------------------------------------------------
  アプリ起動中だけ保持する「メモリ上のキャッシュ」。

  検索や一覧表示のたびにIndexedDBへ問い合わせるのではなく、
  起動時に全曲・全アーティスト・全グループを読み込んでおき、
  以降はここを参照する(仕様書にある「起動時に全曲をメモリに読み込み、
  JSで検索すれば十分速い」という方針に基づく)。

  曲数が将来大きく増えてこの方式が辛くなった場合は、この
  ファイルの中身だけを「必要な分だけ都度取得する」実装に変えればよく、
  UI側(ui/views以下)を大きく変えずに済むようにしている。
*/

import { getAllSongs, getAllArtists, getAllGroups } from "./data/repository.js";

const state = {
  songs: [],
  artists: [],
  groups: [],
  isLoaded: false,
};

/**
 * 起動時に一度だけ呼び、DBから全データをメモリに読み込む。
 * @returns {Promise<void>}
 */
export async function loadAppState() {
  const [songs, artists, groups] = await Promise.all([
    getAllSongs(),
    getAllArtists(),
    getAllGroups(),
  ]);
  state.songs = songs;
  state.artists = artists;
  state.groups = groups;
  state.isLoaded = true;
}

export function getSongsCache() {
  return state.songs;
}

export function getArtistsCache() {
  return state.artists;
}

export function getGroupsCache() {
  return state.groups;
}

export function isAppStateLoaded() {
  return state.isLoaded;
}

/**
 * 曲を1件、メモリキャッシュ内でも追加/更新する。
 * (DBへの保存自体はrepository.js側で行い、この関数は
 *  「保存が終わった後、キャッシュも最新化する」ために呼ぶ)
 * @param {object} song
 */
export function upsertSongInCache(song) {
  const index = state.songs.findIndex((s) => s.id === song.id);
  if (index === -1) {
    state.songs.push(song);
  } else {
    state.songs[index] = song;
  }
}

/**
 * キャッシュから曲を削除する。
 * @param {string} songId
 */
export function removeSongFromCache(songId) {
  state.songs = state.songs.filter((s) => s.id !== songId);
}

/** @param {object} artist */
export function upsertArtistInCache(artist) {
  const index = state.artists.findIndex((a) => a.id === artist.id);
  if (index === -1) {
    state.artists.push(artist);
  } else {
    state.artists[index] = artist;
  }
}

/** @param {object} group */
export function upsertGroupInCache(group) {
  const index = state.groups.findIndex((g) => g.id === group.id);
  if (index === -1) {
    state.groups.push(group);
  } else {
    state.groups[index] = group;
  }
}

/** @param {string} groupId */
export function removeGroupFromCache(groupId) {
  state.groups = state.groups.filter((g) => g.id !== groupId);
}
