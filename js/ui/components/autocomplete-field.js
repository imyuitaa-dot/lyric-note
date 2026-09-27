/*
  autocomplete-field.js
  ------------------------------------------------------------
  候補を出せるテキスト入力。

  ブラウザ標準の<datalist>はiPhoneのSafariで候補ポップアップが表示されない
  (対応していない)ため、自前でドロップダウンの候補リストを実装している。
*/

import { el } from "../../utils/dom.js";

/**
 * @param {object} options
 * @param {string} options.label
 * @param {boolean} [options.required]
 * @param {string} [options.value]
 * @param {string} [options.placeholder]
 * @param {string} [options.hint]
 * @param {(value: string) => void} options.onInput
 * @param {(query: string) => string[]} options.getSuggestions 入力中の文字列から候補配列を返す
 * @returns {{wrapper: HTMLElement, input: HTMLInputElement}}
 */
export function buildAutocompleteTextField({
  label,
  required = false,
  value = "",
  placeholder = "",
  hint,
  onInput,
  getSuggestions,
}) {
  const wrapper = el("div", { className: "field" });
  wrapper.append(
    el("label", {
      className: "field__label" + (required ? " field__label--required" : ""),
      text: label,
    })
  );

  const inputWrapper = el("div", { className: "autocomplete-wrapper" });
  const input = el("input", {
    attrs: { type: "text", placeholder, autocomplete: "off", autocapitalize: "off" },
  });
  input.value = value;

  const list = el("ul", { className: "autocomplete-list" });
  list.style.display = "none";

  inputWrapper.append(input, list);
  wrapper.append(inputWrapper);
  if (hint) {
    wrapper.append(el("span", { className: "menu-button__hint", text: hint }));
  }

  function updateList() {
    const suggestions = getSuggestions(input.value);
    list.replaceChildren();
    if (suggestions.length === 0) {
      list.style.display = "none";
      return;
    }
    for (const suggestion of suggestions) {
      const item = el("li", { text: suggestion });
      // クリックより先に発生するpointerdownでpreventDefault()することで、
      // input側のblur(候補リストを閉じる処理)より先にタップを確定させる。
      item.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        input.value = suggestion;
        onInput(suggestion);
        list.style.display = "none";
      });
      list.append(item);
    }
    list.style.display = "block";
  }

  input.addEventListener("input", () => {
    onInput(input.value);
    updateList();
  });
  input.addEventListener("focus", () => updateList());
  input.addEventListener("blur", () => {
    // pointerdownでのタップ処理を先に完了させるための遅延
    setTimeout(() => {
      list.style.display = "none";
    }, 150);
  });

  return { wrapper, input };
}
