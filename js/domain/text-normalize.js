/*
  text-normalize.js
  ------------------------------------------------------------
  DOMにもDBにも依存しない「純粋関数」だけを置くファイル。
  ここでの関数は入力から出力を計算するだけで、副作用(保存・描画)を持たない。
  そのため単体で動作確認しやすく、将来の英語学習機能などにも再利用しやすい。
*/

/**
 * アーティスト名の「照合用キー」を作る。
 *
 * 目的: "Louis Tomlinson" と " louis  tomlinson " のような表記ゆれを
 * 同一アーティストとして扱えるようにすること。
 *
 * 手順:
 *  1. 全角英数・全角スペースを半角に統一する(normalize NFKC)
 *  2. 前後の空白を取り除く
 *  3. 連続する空白を1つにまとめる
 *  4. 小文字化する
 *
 * @param {string} rawName
 * @returns {string} 照合用キー(表示には使わない)
 */
export function toArtistNameKey(rawName) {
  if (!rawName) return "";
  return rawName
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * 表示用にアーティスト名の前後の空白・連続空白だけを整えたものを返す。
 * (大文字小文字はユーザーの入力どおり残す。キー化はtoArtistNameKeyの役割)
 * @param {string} rawName
 * @returns {string}
 */
export function normalizeArtistDisplayName(rawName) {
  if (!rawName) return "";
  return rawName.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * 改行コードをLFに統一する。
 * 貼り付け時にWindows由来の\r\nが混じることがあるため、
 * 歌詞やメモを保存する前には必ずこれを通す。
 * @param {string} text
 * @returns {string}
 */
export function normalizeNewlines(text) {
  if (!text) return "";
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * 曲名・アーティスト名のソート用キーを作る。
 * Intl.Collator("ja") を使うことで、ひらがな・カタカナ・英数字が
 * 混在していてもある程度自然な順序になる。
 *
 * 実際の比較は Intl.Collator のインスタンスで行うため、
 * ここでは「比較に使う文字列」を軽く正規化するだけに留める。
 * @param {string} text
 * @returns {string}
 */
export function toSortKey(text) {
  if (!text) return "";
  return text.normalize("NFKC").trim();
}

// ソート処理全体で使い回す、日本語対応のCollatorインスタンス。
// 生成コストがあるため、モジュール読み込み時に1回だけ作る。
const collator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });

/**
 * 日本語・英数字混在でも自然な順序になる比較関数。
 * Array.prototype.sort にそのまま渡せる。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareJa(a, b) {
  return collator.compare(toSortKey(a), toSortKey(b));
}
