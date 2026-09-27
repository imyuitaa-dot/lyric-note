/*
  drag-reorder.js
  ------------------------------------------------------------
  タッチ操作(iPhone Safari)でも動く、シンプルなドラッグ並び替えの部品。

  HTML5の draggable 属性・dragstart イベントは、iOS Safariでは
  指によるドラッグでは発火しないため使えない。
  そのため、マウスでもタッチでも同じように扱える Pointer Events
  (pointerdown / pointermove / pointerup) を使って自前実装している。

  設計方針(シンプルさ優先):
  ・ドラッグ中は「浮かせた分身(ゴースト)」を指に追従させて表示するだけで、
    他の行の並びはドラッグ中リアルタイムには動かさない
    (動かすと「他の行がガタガタ動く」実装が複雑になり、バグの元になりやすいため)。
  ・指を離した時点で、ゴーストの中心に一番近い行を「ドロップ先」として判定し、
    そこで初めて呼び出し側に並び替えを依頼する。
  ・呼び出し側は onReorder(fromIndex, toIndex) を受けて、自分が持っている
    データ配列(formStateの歌詞ブロック配列など)を並び替えて再描画すればよい。
*/

/**
 * 1つの「ドラッグハンドル」に、ドラッグ並び替えの挙動を取り付ける。
 * 呼び出し側は、並び替え対象の行を描画するたびに(再描画のたびに)
 * この関数を呼び直す想定(行の要素は再描画で作り直されるため)。
 *
 * @param {object} options
 * @param {HTMLElement} options.handle 指でつかむ部分(小さいアイコンボタン等)
 * @param {HTMLElement} options.row そのハンドルが属する行全体(ドラッグで動かす単位)
 * @param {() => HTMLElement[]} options.getRows
 *   現在、画面に並んでいる行要素を並び順どおりに返す関数。
 *   ドラッグ開始時・移動中のたびに呼び出すことで、常に最新のDOM状態を見る。
 * @param {(fromIndex: number, toIndex: number) => void} options.onReorder
 *   ドロップ位置が変わった場合にだけ呼ばれる。
 */
export function attachDragHandle({ handle, row, getRows, onReorder }) {
  // タッチ操作でつかんだときに、ブラウザ標準のスクロールが割り込まないようにする。
  handle.style.touchAction = "none";

  handle.addEventListener("pointerdown", (downEvent) => {
    // 左クリック/タッチ以外(右クリック等)は無視する。
    if (downEvent.button !== undefined && downEvent.button !== 0) return;
    downEvent.preventDefault();

    const rows = getRows();
    const fromIndex = rows.indexOf(row);
    if (fromIndex === -1) return;

    const rect = row.getBoundingClientRect();

    // 見た目だけの「分身」を作り、指に追従させる。
    // 元の行(row)自体は動かさず、半透明にして「これをつかんでいる」ことだけ示す。
    const ghost = row.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.position = "fixed";
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = "0";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "1000";

    // cloneNode は input/textarea の「現在の入力値」までは複製してくれないため、
    // 見た目のズレを防ぐために手動でコピーする(歌詞ブロックのテキストエリア等)。
    const originalFields = row.querySelectorAll("input, textarea, select");
    const ghostFields = ghost.querySelectorAll("input, textarea, select");
    originalFields.forEach((field, i) => {
      if (ghostFields[i]) ghostFields[i].value = field.value;
    });

    document.body.append(ghost);
    row.classList.add("drag-source");

    const startY = downEvent.clientY;
    let targetIndex = fromIndex;

    function onPointerMove(moveEvent) {
      const deltaY = moveEvent.clientY - startY;
      ghost.style.transform = `translateY(${deltaY}px)`;

      // ゴースト(指に追従する分身)の中心に、一番近い行を「今のドロップ先」とする。
      const ghostCenterY = rect.top + rect.height / 2 + deltaY;
      const currentRows = getRows();
      let closestIndex = fromIndex;
      let closestDistance = Infinity;
      currentRows.forEach((candidateRow, i) => {
        const candidateRect = candidateRow.getBoundingClientRect();
        const center = candidateRect.top + candidateRect.height / 2;
        const distance = Math.abs(center - ghostCenterY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = i;
        }
      });
      targetIndex = closestIndex;
    }

    function finish() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      ghost.remove();
      row.classList.remove("drag-source");
      if (targetIndex !== fromIndex) {
        onReorder(fromIndex, targetIndex);
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  });
}
