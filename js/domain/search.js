/*
  domain/search.js
  ------------------------------------------------------------
  DOM/DBに依存しない検索ロジックの純粋関数。
  曲名・アーティスト名・アルバム名・歌詞(英語)・和訳(日本語)・
  部分メモ・曲全体メモをすべて対象にした本格的な検索を行う。

  「どこにヒットしたか」を後で画面に表示できるよう、
  ヒットした箇所ごとに短い抜粋(excerpt)も一緒に返す。
*/

import { getPrimaryArtistName } from "./song-helpers.js";
import { compareJa } from "./text-normalize.js";

// 抜粋を作るときに、マッチした部分の前後何文字を含めるか。
const EXCERPT_CONTEXT_LENGTH = 20;

// 「どこにヒットしたか」の並び順に使う重み。
// 曲名・アーティスト・アルバムのようなヒットしやすく分かりやすい項目を
// 歌詞本文やメモ本文よりも上位に表示するための単純なスコアリング。
const FIELD_WEIGHT = {
  title: 100,
  artist: 100,
  album: 100,
  lyricsEn: 10,
  lyricsJa: 10,
  songNote: 5,
  noteEn: 5,
  noteJa: 5,
};

/**
 * 文字列に検索語が含まれているか(大文字小文字を区別しない)。
 * @param {string} text
 * @param {string} queryLower あらかじめtoLowerCase()した検索語
 * @returns {boolean}
 */
function includesQuery(text, queryLower) {
  if (!text) return false;
  return text.toLowerCase().includes(queryLower);
}

/**
 * マッチした部分の前後を切り出して、短い抜粋を作る。
 * 前後が切れている場合は「…」を付ける。
 * 見やすさのため改行はスペースに置き換える。
 *
 * @param {string} fullText
 * @param {string} queryLower
 * @returns {string} 抜粋文字列(見つからない場合は空文字)
 */
export function buildSearchExcerpt(fullText, queryLower) {
  if (!fullText) return "";
  const lowered = fullText.toLowerCase();
  const idx = lowered.indexOf(queryLower);
  if (idx === -1) return "";

  const start = Math.max(0, idx - EXCERPT_CONTEXT_LENGTH);
  const end = Math.min(fullText.length, idx + queryLower.length + EXCERPT_CONTEXT_LENGTH);

  const prefix = start > 0 ? "…" : "";
  const suffix = end < fullText.length ? "…" : "";
  const middle = fullText.slice(start, end).replace(/\s+/g, " ").trim();

  return prefix + middle + suffix;
}

/**
 * 曲一覧から、検索語にヒットする曲を探す。
 *
 * @param {Array<object>} songs
 * @param {Array<object>} artistsCache
 * @param {string} queryText ユーザーが入力した検索語
 * @returns {Array<{song: object, artistName: string, matches: Array<object>}>}
 *   スコアの高い順(曲名/アーティスト/アルバムのヒットを優先)→曲名の五十音順
 */
export function searchSongs(songs, artistsCache, queryText) {
  const queryLower = (queryText || "").trim().toLowerCase();
  if (!queryLower) return [];

  const results = [];

  for (const song of songs) {
    const artistName = getPrimaryArtistName(song, artistsCache);
    const matches = [];

    if (includesQuery(song.title, queryLower)) {
      matches.push({ field: "title", excerpt: song.title });
    }
    if (includesQuery(artistName, queryLower)) {
      matches.push({ field: "artist", excerpt: artistName });
    }
    if (includesQuery(song.album, queryLower)) {
      matches.push({ field: "album", excerpt: song.album });
    }
    if (includesQuery(song.songNote, queryLower)) {
      matches.push({ field: "songNote", excerpt: buildSearchExcerpt(song.songNote, queryLower) });
    }

    for (const block of song.blocks || []) {
      if (includesQuery(block.en, queryLower)) {
        matches.push({
          field: "lyricsEn",
          blockId: block.id,
          excerpt: buildSearchExcerpt(block.en, queryLower),
        });
      }
      if (includesQuery(block.ja, queryLower)) {
        matches.push({
          field: "lyricsJa",
          blockId: block.id,
          excerpt: buildSearchExcerpt(block.ja, queryLower),
        });
      }
      for (const note of block.notes || []) {
        if (includesQuery(note.text, queryLower)) {
          matches.push({
            field: note.target === "ja" ? "noteJa" : "noteEn",
            blockId: block.id,
            noteId: note.id,
            excerpt: buildSearchExcerpt(note.text, queryLower),
          });
        }
      }
    }

    if (matches.length > 0) {
      const score = matches.reduce((sum, m) => sum + (FIELD_WEIGHT[m.field] || 0), 0);
      results.push({ song, artistName, matches, score });
    }
  }

  results.sort((a, b) => b.score - a.score || compareJa(a.song.title, b.song.title));
  return results;
}

/** 検索結果の1つのマッチについて、画面表示用のラベルを返す。 */
export function getFieldLabel(field) {
  switch (field) {
    case "title":
      return "曲名";
    case "artist":
      return "アーティスト";
    case "album":
      return "アルバム";
    case "lyricsEn":
      return "歌詞(英語)";
    case "lyricsJa":
      return "和訳";
    case "songNote":
      return "曲全体メモ";
    case "noteEn":
      return "メモ(英語)";
    case "noteJa":
      return "メモ(日本語)";
    default:
      return field;
  }
}
