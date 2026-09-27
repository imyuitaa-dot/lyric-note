/*
  toast.js
  ------------------------------------------------------------
  「保存しました」のような軽い通知を画面下部に一瞬表示する部品。
*/

import { el } from "../../utils/dom.js";

/**
 * トーストを1つ表示する。数秒後に自動で消える。
 * @param {string} message
 */
export function showToast(message) {
  const root = document.getElementById("toast-root");
  if (!root) return;

  const toast = el("div", { className: "toast", text: message });
  root.append(toast);

  setTimeout(() => {
    toast.remove();
  }, 2600);
}
