/*
  annotations.js
  ------------------------------------------------------------
  部分選択メモ(Note)に関する、DOM/DBに依存しない純粋関数。

  設計の要点(実装前に合意した内容):
  ・メモは quote(対象文字列) と、その前後20文字の prefix/suffix も保存する。
  ・歌詞テキストが編集されて位置がずれても、
    1) まず現在のstart/endでquoteが取り出せるか確認
    2) ダメなら prefix+quote+suffix で本文を検索
    3) それでもダメなら quote 単独で検索(複数候補があれば元のstartに一番近いものを採用)
    4) それでも見つからなければ orphaned(位置不明)として保持する
    という順で位置を立て直す。メモを勝手に消すことはしない。
  ・同じブロック・同じ対象(en/ja)内でのメモの重なりは禁止する
    (端が接しているだけ、つまり a.end === b.start は重なりとして扱わない)。
*/

import { generateId } from "../utils/id.js";

// prefix/suffixとして保存する前後の文字数
export const NOTE_CONTEXT_LENGTH = 20;

/**
 * 選択範囲から、保存に必要な quote/prefix/suffix を作る。
 * @param {string} fullText ブロック内の対象テキスト(en または ja)
 * @param {number} start
 * @param {number} end
 * @returns {{quote: string, prefix: string, suffix: string}}
 */
export function buildNoteContext(fullText, start, end) {
  return {
    quote: fullText.slice(start, end),
    prefix: fullText.slice(Math.max(0, start - NOTE_CONTEXT_LENGTH), start),
    suffix: fullText.slice(end, end + NOTE_CONTEXT_LENGTH),
  };
}

/**
 * 新しいメモオブジェクトを作る。
 * @param {{target: "en"|"ja", start: number, end: number, quote: string, prefix: string, suffix: string, text: string}} params
 * @returns {object}
 */
export function createNote(params) {
  const now = Date.now();
  return {
    id: generateId(),
    target: params.target,
    start: params.start,
    end: params.end,
    quote: params.quote,
    prefix: params.prefix,
    suffix: params.suffix,
    text: params.text,
    status: "ok",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 2つの範囲が重なっているか判定する。端が接しているだけ(a.end === b.start)は
 * 重なりとして扱わない。
 */
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * 指定した対象(en/ja)・範囲が、既存の有効なメモと重なっていないか調べる。
 * @param {Array<object>} notes ブロックのメモ配列
 * @param {"en"|"ja"} target
 * @param {number} start
 * @param {number} end
 * @param {string} [excludeNoteId] 自分自身(編集中のメモ)は除外する場合に指定
 * @returns {object|null} 重なっている既存メモ(無ければnull)
 */
export function findOverlappingNote(notes, target, start, end, excludeNoteId = null) {
  return (
    notes.find(
      (note) =>
        note.target === target &&
        note.status === "ok" &&
        note.id !== excludeNoteId &&
        rangesOverlap(start, end, note.start, note.end)
    ) || null
  );
}

/**
 * 文字列内で、needleが出現する位置のうち、anchor(基準位置)に最も近いものを返す。
 * @param {string} haystack
 * @param {string} needle
 * @param {number} anchor
 * @returns {number} 見つからなければ -1
 */
function findNearestIndex(haystack, needle, anchor) {
  if (!needle) return -1;
  const indices = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    indices.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  if (indices.length === 0) return -1;
  indices.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor));
  return indices[0];
}

/**
 * 1件のメモを、現在のテキストに対して検証し、必要なら位置を立て直す。
 * @param {string} fullText 現在のテキスト(en または ja)
 * @param {object} note
 * @returns {{note: object, changed: boolean}}
 */
export function relocateNote(fullText, note) {
  // 1) 今の位置でそのまま取り出せるなら、位置は正しい
  if (fullText.slice(note.start, note.end) === note.quote) {
    if (note.status !== "ok") {
      return { note: { ...note, status: "ok", updatedAt: Date.now() }, changed: true };
    }
    return { note, changed: false };
  }

  // 2) prefix + quote + suffix で検索(前後の文脈が一致する候補を探す)
  const withContext = note.prefix + note.quote + note.suffix;
  const anchor = note.start - note.prefix.length;
  let idx = findNearestIndex(fullText, withContext, anchor);
  if (idx !== -1) {
    const newStart = idx + note.prefix.length;
    const newEnd = newStart + note.quote.length;
    return {
      note: { ...note, start: newStart, end: newEnd, status: "ok", updatedAt: Date.now() },
      changed: true,
    };
  }

  // 3) quote単独で検索(候補が複数あれば元の位置に一番近いものを採用)
  idx = findNearestIndex(fullText, note.quote, note.start);
  if (idx !== -1) {
    return {
      note: { ...note, start: idx, end: idx + note.quote.length, status: "ok", updatedAt: Date.now() },
      changed: true,
    };
  }

  // 4) どうしても見つからない場合は orphaned にする(メモ自体は消さない)
  if (note.status !== "orphaned") {
    return { note: { ...note, status: "orphaned", updatedAt: Date.now() }, changed: true };
  }
  return { note, changed: false };
}

/**
 * ブロック内のすべてのメモ(en/ja両方)を、現在のブロックのテキストに対して
 * 検証・位置補正する。
 * @param {object} block { en, ja, notes }
 * @returns {{notes: Array<object>, changed: boolean}}
 */
export function relocateBlockNotes(block) {
  let anyChanged = false;
  const notes = (block.notes || []).map((note) => {
    const fullText = note.target === "en" ? block.en || "" : block.ja || "";
    const { note: updated, changed } = relocateNote(fullText, note);
    if (changed) anyChanged = true;
    return updated;
  });
  return { notes, changed: anyChanged };
}
