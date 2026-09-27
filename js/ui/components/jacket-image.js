/*
  jacket-image.js
  ------------------------------------------------------------
  ジャケット画像の非同期読み込み・表示の共通処理。

  曲データ自体(songsストア)には画像本体を含めていない
  (一覧の読み込みを軽く保つため、画像はimagesストアに分離している)。
  そのため、ジャケットを表示する場所ではまず「音符アイコンのデフォルト表示」を
  同期的に描画し、coverImageIdがあれば非同期に画像を取ってきて差し替える。
*/

import { getImage } from "../../data/repository.js";

/**
 * @param {HTMLElement} jacketElement 中身を差し替える対象(.song-card__jacket 等)
 * @param {string|null|undefined} coverImageId
 */
export async function applyJacketImage(jacketElement, coverImageId) {
  if (!coverImageId) return;
  try {
    const image = await getImage(coverImageId);
    if (!image) return;
    jacketElement.replaceChildren();
    const img = document.createElement("img");
    img.src = image.dataUrl;
    img.alt = "";
    jacketElement.append(img);
  } catch (err) {
    console.error("[jacket-image] 画像の読み込みに失敗しました", err);
  }
}
