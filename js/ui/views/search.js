/*
  search.js
  ------------------------------------------------------------
  検索画面(Phase 8で本実装)。
  曲名・アーティスト・アルバム・歌詞(英語)・和訳(日本語)・
  部分メモ・曲全体メモをすべて対象に検索する。
  検索そのもの(どこにヒットしたか、抜粋づくり)はdomain/search.jsの
  純粋関数に任せ、この画面はその結果をDOMに並べるだけにしている。
*/

import { el, clearChildren } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import { getSongsCache, getArtistsCache } from "../../app-state.js";
import { searchSongs, getFieldLabel } from "../../domain/search.js";
import { applyJacketImage } from "../components/jacket-image.js";

// 検索欄に入力するたびに毎回再検索すると、日本語のIME変換中などに
// ちらつきやすいため、少しだけ待ってから検索する。
const SEARCH_DEBOUNCE_MS = 150;

// 1曲あたり、結果一覧に表示するマッチの最大数
// (部分メモが大量にヒットする曲があっても、一覧が縦に伸びすぎないようにする)
const MAX_MATCHES_PER_SONG = 4;

/**
 * @returns {HTMLElement}
 */
export function renderSearchView() {
  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/"),
    }),
    el("h1", { text: "検索" })
  );

  const main = el("main", { className: "view-main stack" });

  const searchField = el("div", { className: "field" });
  const input = el("input", {
    attrs: {
      type: "search",
      placeholder: "曲名・アーティスト・歌詞・メモから探す",
      "aria-label": "検索キーワード",
    },
  });
  searchField.append(input);
  main.append(searchField);

  const resultRoot = el("div", { className: "stack search-result-list" });
  main.append(resultRoot);

  renderResults(resultRoot, ""); // 初期表示(未入力)

  let debounceTimer = null;
  input.addEventListener("input", () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      renderResults(resultRoot, input.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  const root = el("div", { className: "view" });
  root.append(header, main);

  // 画面を開いたらすぐに入力できるよう、フォーカスしておく
  // (iOS Safariでは自動でキーボードが開かない場合もあるが、タップ自体は不要になる)
  window.setTimeout(() => input.focus(), 0);

  return root;
}

/**
 * 検索結果を描画する。
 * @param {HTMLElement} resultRoot
 * @param {string} queryText
 */
function renderResults(resultRoot, queryText) {
  clearChildren(resultRoot);

  const trimmed = queryText.trim();
  if (!trimmed) {
    resultRoot.append(
      el("div", {
        className: "empty-state",
        text: "曲名・アーティスト・歌詞・和訳・メモの中から探せます。",
      })
    );
    return;
  }

  const results = searchSongs(getSongsCache(), getArtistsCache(), trimmed);

  if (results.length === 0) {
    resultRoot.append(el("div", { className: "empty-state", text: "見つかりませんでした。" }));
    return;
  }

  resultRoot.append(
    el("p", { className: "menu-button__hint", text: `${results.length}件ヒットしました` })
  );

  for (const result of results) {
    resultRoot.append(renderSearchResultCard(result));
  }
}

/**
 * 検索結果1件分(曲1つ)のカードを作る。
 * @param {{song: object, artistName: string, matches: Array<object>}} result
 * @returns {HTMLElement}
 */
function renderSearchResultCard(result) {
  const { song, artistName, matches } = result;

  const card = el("div", { className: "card search-result-card" });

  const songButton = el("button", {
    className: "search-result-card__song",
    onClick: () => navigateTo(`/songs/${song.id}`),
  });
  const jacket = el("div", { className: "song-card__jacket" });
  jacket.append(el("span", { text: "♪" }));
  applyJacketImage(jacket, song.coverImageId);

  const info = el("div", { className: "song-card__info" });
  info.append(
    el("span", { className: "song-card__title", text: song.title }),
    el("span", { className: "song-card__artist", text: artistName })
  );
  songButton.append(jacket, info);
  card.append(songButton);

  const matchesToShow = matches.slice(0, MAX_MATCHES_PER_SONG);
  const matchList = el("div", { className: "search-result-card__matches" });
  for (const match of matchesToShow) {
    const row = el("div", { className: "search-result-match" });
    row.append(
      el("span", { className: "search-result-match__field", text: getFieldLabel(match.field) }),
      el("span", { className: "search-result-match__excerpt", text: match.excerpt })
    );
    matchList.append(row);
  }
  if (matches.length > matchesToShow.length) {
    matchList.append(
      el("div", {
        className: "search-result-match search-result-match--more",
        text: `他に${matches.length - matchesToShow.length}件ヒットしています`,
      })
    );
  }
  card.append(matchList);

  return card;
}
