/*
  song-card.js
  ------------------------------------------------------------
  曲一覧・お気に入り一覧・アーティスト別/グループ別で共通して使う
  「曲カード」を1つ作る部品。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import { getPrimaryArtistName } from "../../domain/song-helpers.js";
import { saveSong } from "../../data/repository.js";
import { upsertSongInCache } from "../../app-state.js";
import { applyJacketImage } from "./jacket-image.js";

/**
 * @param {object} song
 * @param {Array<object>} artistsCache
 * @param {object} [options]
 * @param {() => void} [options.onChange] お気に入り切替後に呼ばれる(再描画したい場合)
 * @returns {HTMLElement}
 */
export function renderSongCard(song, artistsCache, options = {}) {
  const jacket = el("div", { className: "song-card__jacket" });
  // まずデフォルト表示(音符アイコン)にしておき、画像があれば後から差し替える。
  jacket.append(el("span", { text: "♪" }));
  applyJacketImage(jacket, song.coverImageId);

  const info = el("div", { className: "song-card__info" });
  info.append(
    el("span", { className: "song-card__title", text: song.title }),
    el("span", { className: "song-card__artist", text: getPrimaryArtistName(song, artistsCache) })
  );

  const favoriteButton = el("button", {
    className: "favorite-toggle",
    text: song.isFavorite ? "♥" : "♡",
    attrs: {
      "data-active": song.isFavorite ? "true" : "false",
      "aria-label": song.isFavorite ? "お気に入りを解除" : "お気に入りに追加",
    },
    onClick: async (event) => {
      // カード全体のクリック(詳細への遷移)を発火させないようにする
      event.stopPropagation();
      const updated = { ...song, isFavorite: !song.isFavorite, updatedAt: Date.now() };
      await saveSong(updated);
      upsertSongInCache(updated);
      favoriteButton.textContent = updated.isFavorite ? "♥" : "♡";
      favoriteButton.dataset.active = updated.isFavorite ? "true" : "false";
      options.onChange?.(updated);
    },
  });

  const card = el("button", {
    className: "song-card",
    onClick: () => navigateTo(`/songs/${song.id}`),
  });
  card.append(jacket, info, favoriteButton);
  return card;
}
