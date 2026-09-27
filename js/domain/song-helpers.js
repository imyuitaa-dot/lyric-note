/*
  song-helpers.js
  ------------------------------------------------------------
  DOM/DBに依存しない、曲データに関する純粋関数。
  UIとキャッシュ(app-state)の間で使う小さなロジックをここに集約する。
*/

import { generateId } from "../utils/id.js";
import { compareJa, toSortKey, toArtistNameKey } from "./text-normalize.js";

/**
 * 新しい空の歌詞ブロックを作る。
 * @param {string} [section] セクション名(空文字なら未指定扱い)
 * @returns {object}
 */
export function createEmptyBlock(section = "") {
  return {
    id: generateId(),
    section,
    en: "",
    ja: "",
    notes: [],
  };
}

/**
 * 新しい空の曲データを作る(編集フォームの初期値用)。
 * @returns {object}
 */
export function createEmptySongDraft() {
  return {
    title: "",
    artistName: "",
    album: "",
    blocks: [createEmptyBlock()],
    songNote: "",
  };
}

/**
 * 曲のメイン(1人目)アーティスト名を、アーティストキャッシュから引く。
 * 第一版は1曲1アーティストだが、将来のfeat.拡張に備えて
 * artistCreditsは配列として扱う。
 * @param {object} song
 * @param {Array<object>} artistsCache
 * @returns {string}
 */
export function getPrimaryArtistName(song, artistsCache) {
  const credit = song.artistCredits && song.artistCredits[0];
  if (!credit) return "(アーティスト未設定)";
  const artist = artistsCache.find((a) => a.id === credit.artistId);
  return artist ? artist.name : "(不明なアーティスト)";
}

/**
 * 曲を並び替える。
 * @param {Array<object>} songs
 * @param {"title"|"createdAt"} key
 * @param {"asc"|"desc"} direction
 * @returns {Array<object>} 新しい配列(元の配列は変更しない)
 */
export function sortSongs(songs, key, direction) {
  const sorted = [...songs].sort((a, b) => {
    let result;
    if (key === "title") {
      result = compareJa(a.title, b.title);
    } else {
      // createdAt(追加順)。同時刻の場合はtitleで安定させる。
      result = a.createdAt - b.createdAt || compareJa(a.title, b.title);
    }
    return direction === "desc" ? -result : result;
  });
  return sorted;
}

/**
 * アーティスト名のオートコンプリート候補を作る。
 * 「前方一致」を「部分一致」より優先して並べる。
 * 大文字小文字・前後の空白の違いはtoArtistNameKeyで吸収されるため、
 * 入力途中の表記ゆれでも候補にヒットする。
 * @param {Array<object>} artists
 * @param {string} query
 * @param {number} [limit]
 * @returns {string[]} 表示用アーティスト名の配列(重複なし)
 */
export function suggestArtistNames(artists, query, limit = 6) {
  const key = toArtistNameKey(query);
  if (!key) return [];

  const startsWith = [];
  const includes = [];
  for (const artist of artists) {
    if (artist.nameKey.startsWith(key)) {
      startsWith.push(artist);
    } else if (artist.nameKey.includes(key)) {
      includes.push(artist);
    }
  }
  return [...startsWith, ...includes].slice(0, limit).map((a) => a.name);
}

/**
 * 検索・一覧などで曲を軽くフィルタするための小さなヘルパー。
 * 曲名・アーティスト名・アルバム名のいずれかに部分一致すればtrue。
 * (歌詞・メモ本文を対象にした本格的な検索はPhase 8で実装する)
 * @param {object} song
 * @param {Array<object>} artistsCache
 * @param {string} queryText
 * @returns {boolean}
 */
export function matchesBasicQuery(song, artistsCache, queryText) {
  const key = toSortKey(queryText).toLowerCase();
  if (!key) return true;
  const artistName = getPrimaryArtistName(song, artistsCache);
  return (
    toSortKey(song.title).toLowerCase().includes(key) ||
    toSortKey(artistName).toLowerCase().includes(key) ||
    toSortKey(song.album || "").toLowerCase().includes(key)
  );
}
