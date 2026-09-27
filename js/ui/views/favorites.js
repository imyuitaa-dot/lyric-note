/*
  favorites.js
  ------------------------------------------------------------
  お気に入り一覧画面。お気に入り登録された曲だけを表示する。
  一覧の描画自体はsong-list.jsのrenderSongListBodyを再利用する。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import { getSongsCache } from "../../app-state.js";
import { renderSongListBody } from "./song-list.js";

export function renderFavoritesView() {
  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/"),
    }),
    el("h1", { text: "お気に入り" })
  );

  const favoriteSongs = getSongsCache().filter((s) => s.isFavorite);

  const main = el("main", { className: "view-main" });
  main.append(
    renderSongListBody(favoriteSongs, {
      emptyText: "お気に入りに登録された曲はまだありません。",
    })
  );

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}
