/*
  note-popup.js
  ------------------------------------------------------------
  部分選択メモの「追加」「編集」で使う、共通のポップアップ(モーダル)。
  ×で閉じる。追加時はonDelete無し、編集時はonDelete有りにして呼び分ける。
*/

import { el } from "../../utils/dom.js";
import { openModal } from "./modal.js";

/**
 * @param {object} options
 * @param {"add"|"edit"} options.mode
 * @param {string} options.quote 対象文字列(読み取り専用表示)
 * @param {string} [options.initialText] 編集時の既存メモ本文
 * @param {(text: string) => void} options.onSave 保存ボタンが押されたときに呼ばれる
 * @param {() => void} [options.onDelete] 指定すると削除ボタンが表示される
 */
export function openNoteEditor({ mode, quote, initialText = "", onSave, onDelete }) {
  const modal = openModal((close) => {
    const wrapper = el("div", { className: "stack note-popup" });

    const header = el("div", { className: "row row--between" });
    header.append(
      el("h2", { text: mode === "add" ? "メモを追加" : "メモを編集" }),
      el("button", {
        className: "icon-button",
        text: "×",
        attrs: { "aria-label": "閉じる" },
        onClick: () => close(),
      })
    );
    wrapper.append(header);

    wrapper.append(el("div", { className: "note-popup__quote", text: quote }));

    const textarea = el("textarea", {
      attrs: { rows: "4", placeholder: "メモを入力してください" },
    });
    textarea.value = initialText;
    const textareaField = el("div", { className: "field" });
    textareaField.append(textarea);
    wrapper.append(textareaField);

    const errorText = el("div", { className: "field__error" });
    wrapper.append(errorText);

    const actionRow = el("div", { className: "row" });
    actionRow.append(
      el("button", {
        className: "btn btn--primary",
        text: "保存",
        onClick: () => {
          const value = textarea.value.trim();
          if (!value) {
            errorText.textContent = "メモを入力してください。";
            return;
          }
          onSave(value);
          close();
        },
      })
    );
    if (onDelete) {
      actionRow.append(
        el("button", {
          className: "btn btn--ghost",
          text: "削除",
          onClick: () => {
            if (window.confirm("このメモを削除しますか?")) {
              onDelete();
              close();
            }
          },
        })
      );
    }
    wrapper.append(actionRow);

    // モーダルを開いたら、すぐメモ本文を編集できるようにフォーカスする
    setTimeout(() => textarea.focus(), 0);

    return wrapper;
  });

  return modal;
}
