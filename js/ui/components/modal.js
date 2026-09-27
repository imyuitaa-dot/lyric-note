/*
  modal.js
  ------------------------------------------------------------
  小さなモーダル(背景を暗くして中央にカードを表示する)の共通部品。
  部分メモの追加/編集ポップアップ(note-popup.js)から使う。
*/

import { el } from "../../utils/dom.js";

/**
 * モーダルを開く。
 * @param {(close: () => void) => HTMLElement} buildContent
 *   モーダルの中身を作る関数。引数のclose()を呼べば、その場で閉じられる。
 * @returns {{ close: () => void }}
 */
export function openModal(buildContent) {
  const backdrop = el("div", { className: "modal-backdrop" });
  const dialog = el("div", { className: "modal-dialog" });

  function close() {
    document.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") close();
  }

  // 背景(枠外)をタップしたら閉じる
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKeyDown);

  const content = buildContent(close);
  dialog.append(content);
  backdrop.append(dialog);
  document.body.append(backdrop);

  return { close };
}
