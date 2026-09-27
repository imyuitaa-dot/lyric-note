/*
  home.js
  ------------------------------------------------------------
  HOME画面。仕様書にある7つのメニュー
  (検索 / 曲を追加 / 曲一覧 / アーティスト別 / グループ別 / お気に入り / 設定)
  への入り口を表示する。

  Phase 0時点では、各メニューは「準備中」画面(placeholder.js)に
  遷移するだけ。Phase 1以降で、対応するviewを1つずつ実装していく。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";

const MENU_ITEMS = [
  { label: "検索", hint: "曲名・歌詞・メモから探す", path: "/search", wide: true },
  { label: "＋ 曲を追加", hint: "新しい曲を登録する", path: "/songs/new", wide: true },
  { label: "曲一覧", hint: "登録した曲をすべて見る", path: "/songs" },
  { label: "アーティスト別", hint: "アーティストから探す", path: "/artists" },
  { label: "グループ別", hint: "自分で作った分類から探す", path: "/groups" },
  { label: "お気に入り", hint: "♥をつけた曲だけ表示", path: "/favorites" },
  { label: "設定", hint: "バックアップ・DB状態など", path: "/settings" },
];

/**
 * HOME画面のDOMを作って返す。
 * @returns {HTMLElement}
 */
export function renderHomeView() {
  const header = el("header", { className: "view-header" });
  header.append(el("h1", { text: "Lyric Note" }));

  const menu = el("div", { className: "home-menu" });
  for (const item of MENU_ITEMS) {
    const button = el("button", {
      className: "menu-button" + (item.wide ? " menu-button--wide" : ""),
      onClick: () => navigateTo(item.path),
    });
    button.append(
      el("span", { className: "menu-button__label", text: item.label }),
      el("span", { className: "menu-button__hint", text: item.hint })
    );
    if (item.wide) {
      button.classList.add("home-menu__item--wide");
    }
    menu.append(button);
  }

  const main = el("main", { className: "view-main" });
  main.append(menu);

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}
