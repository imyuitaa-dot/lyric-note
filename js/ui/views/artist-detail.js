/*
  artist-detail.js
  ------------------------------------------------------------
  特定のアーティストの登録曲一覧。曲一覧の描画自体はsong-list.jsの
  renderSongListBodyを再利用する。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import { getArtist } from "../../data/repository.js";
import { getSongsCache } from "../../app-state.js";
import { renderSongListBody } from "./song-list.js";

/**
 * @param {{id: string}} params
 * @returns {Promise<HTMLElement>}
 */
export async function renderArtistDetailView(params) {
  const artist = await getArtist(params.id);

  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/artists"),
    }),
    el("h1", { text: artist ? artist.name : "アーティストが見つかりません" })
  );

  const main = el("main", { className: "view-main" });

  if (!artist) {
    main.append(el("div", { className: "empty-state", text: "このアーティストは削除されたか、存在しません。" }));
  } else {
    const songs = getSongsCache().filter((song) =>
      (song.artistCredits || []).some((credit) => credit.artistId === artist.id)
    );
    main.append(
      renderSongListBody(songs, {
        emptyText: "このアーティストの曲はまだ登録されていません。",
      })
    );
  }

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}
