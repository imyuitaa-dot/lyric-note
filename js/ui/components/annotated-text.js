/*
  annotated-text.js
  ------------------------------------------------------------
  歌詞テキストを、部分メモの位置に応じて「点線下線つきのspan」と
  「普通のテキスト」に分けて描画する部品。

  containerには、この関数が生成したノードだけを入れること
  (textOffsetInContainerでの文字数計算が、containerの中身=fullTextと
  一致している前提のため)。
*/

/**
 * @param {HTMLElement} container 描画先(中身は置き換えられる)
 * @param {string} fullText 対象の全文(block.en または block.ja)
 * @param {Array<object>} notes ブロックの全メモ(en/ja混在してもよい。ここでtargetで絞り込む)
 * @param {"en"|"ja"} target
 * @param {(noteId: string) => void} onNoteClick 下線をタップしたときに呼ばれる
 */
export function renderAnnotatedText(container, fullText, notes, target, onNoteClick) {
  container.replaceChildren();

  const relevantNotes = notes
    .filter((n) => n.target === target && n.status === "ok")
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const note of relevantNotes) {
    // データ不整合(重なり)があっても描画が壊れないよう、念のため防御しておく
    const start = Math.max(note.start, cursor);
    const end = Math.max(note.end, start);
    if (start > cursor) {
      container.append(document.createTextNode(fullText.slice(cursor, start)));
    }
    const span = document.createElement("span");
    span.className = "note-underline";
    span.dataset.noteId = note.id;
    span.textContent = fullText.slice(start, end);
    span.addEventListener("click", (event) => {
      event.stopPropagation();
      onNoteClick(note.id);
    });
    container.append(span);
    cursor = end;
  }
  if (cursor < fullText.length) {
    container.append(document.createTextNode(fullText.slice(cursor)));
  }
}
