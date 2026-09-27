/*
  dom.js
  ------------------------------------------------------------
  DOM要素を作るための小さなヘルパー。
  Vanilla JSでは要素作成が冗長になりがちなので、ここでまとめて吸収する。
*/

/**
 * 要素を1つ作成する。
 * @param {string} tag 例: "div", "button"
 * @param {object} [options]
 * @param {string} [options.className]
 * @param {string} [options.text] textContentとして設定する文字列。
 *   innerHTMLではなくtextContentを使うことで、歌詞やメモに含まれる
 *   "<" などの記号がHTMLとして解釈されるのを防いでいる(XSS/表示崩れ対策)。
 * @param {Object<string,string>} [options.attrs] 追加のHTML属性
 * @param {Array<Node|string>} [options.children]
 * @returns {HTMLElement}
 */
export function el(tag, options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value !== undefined && value !== null) {
        node.setAttribute(key, value);
      }
    }
  }
  if (options.children) {
    for (const child of options.children) {
      if (child === null || child === undefined) continue;
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  if (options.onClick) {
    node.addEventListener("click", options.onClick);
  }
  return node;
}

/**
 * 指定した要素の中身を空にする。
 * innerHTML = "" よりremoveChildを使う方が、まれに残るイベントリスナー等の
 * 参照が残りにくいとされるが、実用上はどちらでも大差はない。読みやすさ優先。
 * @param {HTMLElement} node
 */
export function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

/**
 * root の中身を1つの要素で置き換える。画面切り替えの基本操作。
 * @param {HTMLElement} root
 * @param {Node} content
 */
export function mount(root, content) {
  clearChildren(root);
  root.append(content);
}

/**
 * documentに対するイベント購読を、containerがDOMから外れたら自動的に
 * 登録解除してくれる形で行う。
 *
 * このアプリはSPAだが「画面が閉じられるとき」を明示的に知らせる仕組み
 * (unmountフック)を持たない単純なルーターのため、selectionchangeのような
 * document全体のイベントを画面ごとに購読すると、画面を切り替えるたびに
 * 購読が増え続けてしまう(リスナーのリーク)。
 *
 * これを避けるため、イベントが発火した時点でcontainerがまだ画面内に
 * 存在するかを確認し、無くなっていれば自分自身を登録解除する。
 *
 * @param {string} eventName
 * @param {HTMLElement} container このイベントを使う画面の要素(画面が閉じられると共にDOMから外れる)
 * @param {(event: Event) => void} handler
 * @returns {() => void} 手動で解除したい場合に呼べる関数
 */
export function onDocumentEventWhileMounted(eventName, container, handler) {
  function wrapped(event) {
    if (!document.body.contains(container)) {
      document.removeEventListener(eventName, wrapped);
      return;
    }
    handler(event);
  }
  document.addEventListener(eventName, wrapped);
  return () => document.removeEventListener(eventName, wrapped);
}

/**
 * Range境界(node, offset)の、container先頭から数えた文字数オフセットを求める。
 * Range#toString()が、テキストノードやその他の要素をまたいでも正しく
 * 文字列化してくれることを利用した、標準的なテクニック。
 * @param {HTMLElement} container
 * @param {Node} node
 * @param {number} offset
 * @returns {number}
 */
export function textOffsetInContainer(container, node, offset) {
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(node, offset);
  return preRange.toString().length;
}
