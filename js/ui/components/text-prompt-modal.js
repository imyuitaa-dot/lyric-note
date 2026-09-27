/*
  text-prompt-modal.js
  ------------------------------------------------------------
  「名前を1つ入力してもらう」だけの汎用モーダル。
  グループの作成・名前変更で使う。
*/

import { el } from "../../utils/dom.js";
import { openModal } from "./modal.js";

/**
 * @param {object} options
 * @param {string} options.title モーダルの見出し
 * @param {string} [options.label] 入力欄のラベル
 * @param {string} [options.initialValue]
 * @param {string} [options.placeholder]
 * @param {string} [options.confirmLabel] 確定ボタンの文言(既定: "保存")
 * @param {(value: string) => void} options.onSubmit
 */
export function openTextPromptModal({
  title,
  label,
  initialValue = "",
  placeholder = "",
  confirmLabel = "保存",
  onSubmit,
}) {
  return openModal((close) => {
    const wrapper = el("div", { className: "stack" });

    const header = el("div", { className: "row row--between" });
    header.append(
      el("h2", { text: title }),
      el("button", {
        className: "icon-button",
        text: "×",
        attrs: { "aria-label": "閉じる" },
        onClick: () => close(),
      })
    );
    wrapper.append(header);

    const field = el("div", { className: "field" });
    if (label) {
      field.append(el("label", { className: "field__label", text: label }));
    }
    const input = el("input", { attrs: { type: "text", placeholder } });
    input.value = initialValue;
    field.append(input);
    wrapper.append(field);

    const errorText = el("div", { className: "field__error" });
    wrapper.append(errorText);

    const actionRow = el("div", { className: "row" });
    actionRow.append(
      el("button", {
        className: "btn btn--primary",
        text: confirmLabel,
        onClick: () => {
          const value = input.value.trim();
          if (!value) {
            errorText.textContent = "入力してください。";
            return;
          }
          onSubmit(value);
          close();
        },
      })
    );
    wrapper.append(actionRow);

    setTimeout(() => input.focus(), 0);

    return wrapper;
  });
}
