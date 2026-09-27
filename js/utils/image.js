/*
  image.js
  ------------------------------------------------------------
  ジャケット画像を、保存前にブラウザ側でリサイズ・圧縮するユーティリティ。
  Canvas/Imageなどブラウザ専用のAPIを使うため、domain/ではなくutils/に置く
  (domain/はDOMに依存しない純粋関数だけを置く場所にしているため)。
*/

/**
 * 画像ファイルを、長辺が maxSize を超えないようリサイズし、
 * JPEGとして圧縮した上でdataURL文字列を返す。
 * 元画像が既にmaxSize以下の場合は拡大しない。
 *
 * @param {File} file
 * @param {{maxSize?: number, quality?: number}} [options]
 * @returns {Promise<{dataUrl: string, width: number, height: number}>}
 */
export function resizeAndCompressImage(file, options = {}) {
  const { maxSize = 320, quality = 0.8 } = options;

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { naturalWidth: width, naturalHeight: height } = img;
      const longSide = Math.max(width, height);
      if (longSide > maxSize) {
        const scale = maxSize / longSide;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve({ dataUrl, width, height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像の読み込みに失敗しました。ファイル形式を確認してください。"));
    };

    img.src = objectUrl;
  });
}
