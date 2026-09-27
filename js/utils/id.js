/*
  id.js
  ------------------------------------------------------------
  ID生成用のユーティリティ。

  crypto.randomUUID() はHTTPS環境(と localhost)でしか使えない。
  GitHub Pagesは常にHTTPSなので本来は問題ないが、
  ・将来ローカルの file:// で試したくなる場合がある
  ・古いSafariでは未実装の場合がある
  という理由から、使えない場合は自前の簡易UUID生成にフォールバックする。
*/

/**
 * ランダムなID文字列を1つ生成する。
 * 見た目はUUID v4に似せているが、暗号学的な強度は求めていない
 * (あくまでDBのキーとして重複しなければよい用途)。
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch (_err) {
      // HTTPSでない等で失敗した場合は下のフォールバックに進む
    }
  }

  // crypto.getRandomValues が使えるならそちらを使い、乱数の質を上げる
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // UUID v4のフォーマットに寄せる(バージョン/バリアントのビットを設定)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return (
      hex.slice(0, 4).join("") +
      "-" +
      hex.slice(4, 6).join("") +
      "-" +
      hex.slice(6, 8).join("") +
      "-" +
      hex.slice(8, 10).join("") +
      "-" +
      hex.slice(10, 16).join("")
    );
  }

  // 最終手段: Math.randomベース(衝突の可能性はゼロではないが、個人用途では十分)
  return (
    "id-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}
