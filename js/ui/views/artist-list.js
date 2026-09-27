/*
  artist-list.js
  ------------------------------------------------------------
  アーティスト別画面。登録されているアーティストを一覧表示する。
  タップすると、そのアーティストの曲一覧(artist-detail.js)に遷移する。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import { getArtistsCache, getSongsCache } from "../../app-state.js";
import { compareJa } from "../../domain/text-normalize.js";

export function renderArtistListView() {
  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/"),
    }),
    el("h1", { text: "アーティスト別" })
  );

  const main = el("main", { className: "view-main" });

  const artists = getArtistsCache();
  const songs = getSongsCache();

  if (artists.length === 0) {
    main.append(el("div", { className: "empty-state", text: "登録されているアーティストがいません。" }));
  } else {
    // アーティストごとの曲数を数える(1曲1アーティストなので単純にカウントできる)
    const countByArtistId = new Map();
    for (const song of songs) {
      const credit = song.artistCredits && song.artistCredits[0];
      if (!credit) continue;
      countByArtistId.set(credit.artistId, (countByArtistId.get(credit.artistId) || 0) + 1);
    }

    const sortedArtists = [...artists].sort((a, b) => compareJa(a.name, b.name));

    const list = el("div", { className: "song-list" });
    for (const artist of sortedArtists) {
      const count = countByArtistId.get(artist.id) || 0;
      const row = el("button", {
        className: "artist-row",
        onClick: () => navigateTo(`/artists/${artist.id}`),
      });
      row.append(
        el("span", { className: "artist-row__name", text: artist.name }),
        el("span", { className: "artist-row__count", text: `${count}曲` })
      );
      list.append(row);
    }
    main.append(list);
  }

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}
