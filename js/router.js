/*
  router.js
  ------------------------------------------------------------
  URLのハッシュ(#以降)を見て、表示する画面(view)を切り替える
  簡易ルーター。SPA用のライブラリは使わず、Vanilla JSで実装している。

  ハッシュを使う理由:
  ・GitHub Pagesはサブディレクトリ配信(/リポジトリ名/)になるため、
    History APIで細かくパスを操作すると、リロード時に404になりやすい。
  ・ハッシュ(#/songs 等)は常にindex.htmlを指したままなので、
    iPhoneでホーム画面に追加したアプリとしても安定して動く。
*/

/** @type {Array<{pattern: RegExp, paramNames: string[], handler: (params: Object) => void}>} */
const routes = [];

/**
 * ルートを登録する。
 * 例: registerRoute("/songs/:id", (params) => { ... })
 * @param {string} pathPattern ":id" のようなプレースホルダを含められる
 * @param {(params: Record<string,string>) => void} handler
 */
export function registerRoute(pathPattern, handler) {
  const paramNames = [];
  const regexSource = pathPattern
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  routes.push({
    pattern: new RegExp(`^${regexSource}$`),
    paramNames,
    handler,
  });
}

/** 現在のハッシュから、先頭の "#" を除いたパス部分を取り出す */
function getCurrentPath() {
  const hash = window.location.hash || "#/";
  const path = hash.slice(1); // "#" を除く
  return path === "" ? "/" : path;
}

/** 現在のパスに一致するルートを探して実行する */
function resolveRoute() {
  const path = getCurrentPath();

  for (const route of routes) {
    const match = path.match(route.pattern);
    if (match) {
      /** @type {Record<string,string>} */
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      route.handler(params);
      return;
    }
  }

  console.warn(`[router] 一致するルートが見つかりません: ${path}`);
  notFoundHandler?.(path);
}

/** @type {((path: string) => void) | null} */
let notFoundHandler = null;

/**
 * どのルートにも一致しなかった場合の処理を登録する。
 * @param {(path: string) => void} handler
 */
export function setNotFoundHandler(handler) {
  notFoundHandler = handler;
}

/**
 * ルーターを開始する。ハッシュ変更を監視し、初回表示も行う。
 */
export function startRouter() {
  window.addEventListener("hashchange", resolveRoute);
  resolveRoute();
}

/**
 * 指定したパスへ画面遷移する。
 * @param {string} path 例: "/songs/abc123"
 */
export function navigateTo(path) {
  window.location.hash = `#${path}`;
}
