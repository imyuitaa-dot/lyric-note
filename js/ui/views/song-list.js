/*
  song-list.js
  ------------------------------------------------------------
  曲一覧画面。曲名/追加順 × 昇順/降順で並び替えられる。

  favorites.js からも「事前にフィルタした配列」を渡して再利用できるように、
  一覧描画部分は renderSongListBody として切り出している。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import { getSongsCache, getArtistsCache } from "../../app-state.js";
import { sortSongs } from "../../domain/song-helpers.js";
import { renderSongCard } from "../components/song-card.js";

// 並び替え設定はページ遷移すると忘れてよい(仕様上、保存は求められていない)ため、
// モジュール内の変数として保持するだけにする。
let currentSortKey = "createdAt";
let currentSortDirection = "desc"; // 新しく追加した曲が上に来るのを既定にする

/**
 * 曲一覧のbody部分(ソートバー＋リスト)を作る。
 * @param {Array<object>} songs 表示対象の曲(呼び出し側で絞り込み済みのものを渡す)
 * @param {{emptyText?: string, showSortBar?: boolean}} [options]
 * @returns {HTMLElement}
 */
export function renderSongListBody(songs, options = {}) {
  const { emptyText = "登録されている曲がありません。", showSortBar = true } = options;
  const artistsCache = getArtistsCache();
  const container = el("div", { className: "stack" });

  if (showSortBar) {
    container.append(renderSortBar(() => rerenderList()));
  }

  const listRoot = el("div", { className: "song-list" });
  container.append(listRoot);

  function rerenderList() {
    listRoot.replaceChildren();
    const sorted = sortSongs(songs, currentSortKey, currentSortDirection);
    if (sorted.length === 0) {
      listRoot.append(el("div", { className: "empty-state", text: emptyText }));
      return;
    }
    for (const song of sorted) {
      listRoot.append(renderSongCard(song, artistsCache));
    }
  }

  rerenderList();
  return container;
}

function renderSortBar(onChange) {
  const bar = el("div", { className: "sort-bar" });

  const keySelect = el("select", { attrs: { "aria-label": "並び替え項目" } });
  keySelect.append(
    new Option("追加順", "createdAt", currentSortKey === "createdAt", currentSortKey === "createdAt"),
    new Option("曲名", "title", currentSortKey === "title", currentSortKey === "title")
  );
  keySelect.addEventListener("change", () => {
    currentSortKey = keySelect.value;
    onChange();
  });

  const directionSelect = el("select", { attrs: { "aria-label": "並び順" } });
  directionSelect.append(
    new Option("降順", "desc", currentSortDirection === "desc", currentSortDirection === "desc"),
    new Option("昇順", "asc", currentSortDirection === "asc", currentSortDirection === "asc")
  );
  directionSelect.addEventListener("change", () => {
    currentSortDirection = directionSelect.value;
    onChange();
  });

  bar.append(keySelect, directionSelect);
  return bar;
}

/**
 * 曲一覧画面全体(ヘッダー付き)を作る。
 * @returns {HTMLElement}
 */
export function renderSongListView() {
  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/"),
    }),
    el("h1", { text: "曲一覧" }),
    el("button", {
      className: "icon-button",
      text: "＋",
      attrs: { "aria-label": "曲を追加" },
      onClick: () => navigateTo("/songs/new"),
    })
  );

  const main = el("main", { className: "view-main" });
  main.append(renderSongListBody(getSongsCache()));

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}
