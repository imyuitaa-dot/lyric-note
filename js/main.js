/*
  main.js
  ------------------------------------------------------------
  アプリのエントリーポイント。
  ・DBを開いてメモリキャッシュを読み込む
  ・ルートを登録する
  ・ルーターを開始する
  という初期化だけを行う。個々の画面の中身はjs/ui/views以下に分離している。
*/

import { mount } from "./utils/dom.js";
import { registerRoute, setNotFoundHandler, startRouter, navigateTo } from "./router.js";
import { loadAppState } from "./app-state.js";
import { openDatabase } from "./data/db.js";

import { renderHomeView } from "./ui/views/home.js";
import { renderSettingsView } from "./ui/views/settings.js";
import { renderSearchView } from "./ui/views/search.js";
import { renderSongListView } from "./ui/views/song-list.js";
import { renderSongDetailView } from "./ui/views/song-detail.js";
import { renderSongEditView } from "./ui/views/song-edit.js";
import { renderFavoritesView } from "./ui/views/favorites.js";
import { renderArtistListView } from "./ui/views/artist-list.js";
import { renderArtistDetailView } from "./ui/views/artist-detail.js";
import { renderGroupListView } from "./ui/views/group-list.js";
import { renderGroupDetailView } from "./ui/views/group-detail.js";

const appRoot = document.getElementById("app");

/**
 * ルートハンドラの戻り値(要素、またはPromise<要素>)を受け取り、
 * #app の中身をそれに差し替える。
 * @param {HTMLElement|Promise<HTMLElement>} viewOrPromise
 */
async function mountView(viewOrPromise) {
  const view = await viewOrPromise;
  mount(appRoot, view);
  // 画面が変わるたびに一番上にスクロールし直す(前の画面のスクロール位置が残らないように)
  window.scrollTo(0, 0);
}

function registerRoutes() {
  registerRoute("/", () => mountView(renderHomeView()));

  // Phase 1で本実装した画面。
  registerRoute("/songs/new", () => mountView(renderSongEditView({})));
  registerRoute("/songs/:id/edit", (p) => mountView(renderSongEditView({ id: p.id })));
  registerRoute("/songs/:id", (p) => mountView(renderSongDetailView(p)));
  registerRoute("/songs", () => mountView(renderSongListView()));
  registerRoute("/favorites", () => mountView(renderFavoritesView()));
  registerRoute("/artists/:id", (p) => mountView(renderArtistDetailView(p)));
  registerRoute("/artists", () => mountView(renderArtistListView()));
  registerRoute("/groups/:id", (p) => mountView(renderGroupDetailView(p)));
  registerRoute("/groups", () => mountView(renderGroupListView()));

  registerRoute("/search", () => mountView(renderSearchView()));

  // 設定画面はPhase 0の動作確認に使うため、先に本実装している。
  registerRoute("/settings", () => mountView(renderSettingsView()));

  setNotFoundHandler(() => navigateTo("/"));
}

async function init() {
  try {
    // 起動時にDBを開いておく(失敗する場合はここで気づけるようにする)
    await openDatabase();
    await loadAppState();
  } catch (err) {
    // DBが開けない状態でも、エラー内容が分かるようにだけはしておく。
    // (プライベートブラウズモード等、IndexedDBが使えない環境を想定)
    console.error("[main] 初期化に失敗しました", err);
    appRoot.textContent =
      "データベースの初期化に失敗しました。プライベートブラウズモードではないか確認してください。";
    return;
  }

  registerRoutes();
  startRouter();
}

init();
