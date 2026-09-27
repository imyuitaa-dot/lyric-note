/*
  lyrics-parser.js
  ------------------------------------------------------------
  「歌詞をまとめて貼り付け」たときに、歌詞ブロックの配列へ変換する処理。
  DOM/DBに依存しない純粋関数のみを置く。

  設計の考え方:
  ・[Verse 1] のようなセクション見出しが1行でもあれば「見出しモード」とし、
    見出しから次の見出し(またはテキストの終わり)までを1つのブロックにする。
  ・見出しが1つも無ければ「空行モード」とし、空行(1行以上の空白行)で
    区切られたまとまりをそれぞれ1つのブロックにする。
    (仕様書の例のように、見出しなしで英語2行:日本語2行のような
    まとまりを1ブロックとして扱いたいケースに対応するため)
  ・英語用テキストと日本語用テキストは別々に解析し、できあがった
    まとまりを先頭から順に対応させる(1番目のまとまり同士、2番目同士…)。
    セクション名は英語側の見出しを優先して使う。
*/

import { normalizeNewlines } from "./text-normalize.js";
import { createEmptyBlock } from "./song-helpers.js";

// [Verse 1] のような、角括弧1行だけの見出し行にマッチする
const HEADER_LINE_PATTERN = /^\s*\[([^\]]+)\]\s*$/;

/**
 * テキストを「まとまり(section, text)」の配列に分割する。
 * @param {string} rawText
 * @returns {Array<{section: string, text: string}>}
 */
export function parseLyricsText(rawText) {
  const text = normalizeNewlines(rawText || "").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const hasHeader = lines.some((line) => HEADER_LINE_PATTERN.test(line));

  if (hasHeader) {
    return parseByHeaders(lines);
  }
  return parseByBlankLines(text);
}

/**
 * 見出し([Verse 1]等)を区切りとして、まとまりに分割する。
 * @param {string[]} lines
 * @returns {Array<{section: string, text: string}>}
 */
function parseByHeaders(lines) {
  const chunks = [];
  let currentSection = "";
  let currentLines = [];
  let started = false;

  const flush = () => {
    const text = trimBlankLines(currentLines).join("\n");
    if (text || currentSection) {
      chunks.push({ section: currentSection, text });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const match = line.match(HEADER_LINE_PATTERN);
    if (match) {
      // 最初の見出しに出会うまでは何も溜まっていないので、flushしない
      if (started) flush();
      currentSection = match[1].trim();
      started = true;
    } else {
      currentLines.push(line);
      started = true;
    }
  }
  flush();

  return chunks;
}

/**
 * 空行(1行以上の空白行)を区切りとして、まとまりに分割する。
 * @param {string} text
 * @returns {Array<{section: string, text: string}>}
 */
function parseByBlankLines(text) {
  return text
    .split(/\n\s*\n+/)
    .map((paragraph) => trimBlankLines(paragraph.split("\n")).join("\n"))
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => ({ section: "", text: paragraph }));
}

/** 配列の先頭と末尾にある空行(空白のみの行)を取り除く */
function trimBlankLines(lines) {
  const result = [...lines];
  while (result.length > 0 && result[0].trim() === "") result.shift();
  while (result.length > 0 && result[result.length - 1].trim() === "") result.pop();
  return result;
}

/**
 * 英語・日本語それぞれのまとめ貼り付けテキストから、歌詞ブロックの配列を作る。
 * @param {string} enText
 * @param {string} jaText
 * @returns {{blocks: Array<object>, enCount: number, jaCount: number, mismatched: boolean}}
 */
export function buildBlocksFromBulkPaste(enText, jaText) {
  const enChunks = parseLyricsText(enText);
  const jaChunks = parseLyricsText(jaText);
  const count = Math.max(enChunks.length, jaChunks.length);

  const blocks = [];
  for (let i = 0; i < count; i++) {
    const enChunk = enChunks[i];
    const jaChunk = jaChunks[i];
    const block = createEmptyBlock((enChunk && enChunk.section) || (jaChunk && jaChunk.section) || "");
    block.en = enChunk ? enChunk.text : "";
    block.ja = jaChunk ? jaChunk.text : "";
    blocks.push(block);
  }

  return {
    blocks,
    enCount: enChunks.length,
    jaCount: jaChunks.length,
    // 両方に1つ以上あるのに数が違う場合だけ「ズレ」として警告する
    mismatched: enChunks.length > 0 && jaChunks.length > 0 && enChunks.length !== jaChunks.length,
  };
}
