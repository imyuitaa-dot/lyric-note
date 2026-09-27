/*
  placeholder.js
  ------------------------------------------------------------
  まだ実装していない画面のための「準備中」表示。
  Phase 1以降で、この関数の呼び出し箇所を本物のviewに1つずつ
  置き換えていく(main.jsのルート登録を参照)。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";

/**
 * @param {string} title 画面タイトル
 * @param {string} [note] 補足メッセージ
 * @returns {HTMLElement}
 */
export function renderPlaceholderView(title, note = "この画面は次のPhaseで実装します。") {
  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/"),
    }),
    el("h1", { text: title })
  );

  const main = el("main", { className: "view-main" });
  main.append(el("div", { className: "empty-state", text: note }));

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}
