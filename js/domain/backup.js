/*
  domain/backup.js
  ------------------------------------------------------------
  バックアップ(書き出し・読み込み)に関する「純粋関数」だけを集めたファイル。
  DOMにもIndexedDB(repository.js)にも依存しない。
  ・バックアップJSONの組み立て(buildBackupPayload)
  ・読み込んだJSONが正しい形式かどうかのチェック(validateBackupPayload)
  ・画像なしバックアップを復元した後の後始末が必要かどうかの判定は
    repository.js側(cleanupOrphanedCoverImageIds)で行うため、ここには含めない。

  こうして「判断だけ」を切り出しておくことで、Node上で単体テストしやすくし、
  UI(settings.js)側は「validateしてダメならエラー表示、OKなら repository に渡す」
  という薄い呼び出しだけで済むようにしている。
*/

// このアプリが作るバックアップファイルの目印。
// 他のアプリのJSONを誤って読み込んでしまうのを防ぐためのチェックに使う。
export const BACKUP_APP_ID = "lyric-note";

// バックアップファイル自体の「形式」のバージョン。
// 将来フィールドの意味を変えるような破壊的変更をした場合はここを上げる。
// (IndexedDBのスキーマバージョンとは別物。スキーマは今のところv1のまま
//  互換性が保てているため、dbSchemaVersionは参考情報として保存するだけ。)
export const CURRENT_BACKUP_VERSION = 1;

// 現在のIndexedDBスキーマバージョン(js/data/db.jsのDB_VERSIONと合わせる)。
export const CURRENT_DB_SCHEMA_VERSION = 1;

const REQUIRED_DATA_KEYS = ["songs", "artists", "groups", "groupSongs", "images", "settings"];

/**
 * repository.exportAllData() が返した生データから、
 * 書き出し用のバックアップJSON全体(メタ情報つき)を組み立てる。
 *
 * @param {{songs:Array, artists:Array, groups:Array, groupSongs:Array, images:Array, settings:Array}} rawData
 * @param {{includeImages: boolean}} options
 * @returns {object} バックアップとして保存するJSONオブジェクト
 */
export function buildBackupPayload(rawData, options) {
  const includeImages = Boolean(options && options.includeImages);

  const data = {
    songs: rawData.songs || [],
    artists: rawData.artists || [],
    groups: rawData.groups || [],
    groupSongs: rawData.groupSongs || [],
    // 「画像なしバックアップ」の場合、imagesストア自体を空配列にする。
    // (songs側のcoverImageIdはあえてそのままにしておき、
    //  復元後にrepository.cleanupOrphanedCoverImageIdsで後始末する)
    images: includeImages ? rawData.images || [] : [],
    settings: rawData.settings || [],
  };

  return {
    app: BACKUP_APP_ID,
    backupVersion: CURRENT_BACKUP_VERSION,
    dbSchemaVersion: CURRENT_DB_SCHEMA_VERSION,
    exportedAt: Date.now(),
    includesImages: includeImages,
    counts: {
      songs: data.songs.length,
      artists: data.artists.length,
      groups: data.groups.length,
      groupSongs: data.groupSongs.length,
      images: data.images.length,
      settings: data.settings.length,
    },
    data,
  };
}

/**
 * 読み込んだJSON(payload)が、このアプリのバックアップとして
 * 扱ってよい形式かどうかをチェックする。
 *
 * 「壊れたJSON」「他アプリのJSON」「未来の形式で今のアプリでは読めないもの」
 * を早期に見分け、復元処理(importBackupData)に渡す前に弾くためのもの。
 *
 * @param {*} payload JSON.parseした結果(何が来るか分からない前提で扱う)
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateBackupPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["ファイルの中身がバックアップの形式ではありません。"] };
  }

  if (payload.app !== BACKUP_APP_ID) {
    errors.push("このアプリで作成されたバックアップファイルではないようです。");
  }

  if (typeof payload.backupVersion !== "number" || !Number.isInteger(payload.backupVersion)) {
    errors.push("backupVersion(バックアップの形式バージョン)が見つかりません。");
  } else if (payload.backupVersion > CURRENT_BACKUP_VERSION) {
    errors.push(
      `このバックアップは新しいバージョン(v${payload.backupVersion})で作られています。` +
        `アプリを更新してから読み込んでください(現在対応しているのはv${CURRENT_BACKUP_VERSION}までです)。`
    );
  }

  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    errors.push("データ本体(data)が見つかりません。");
  } else {
    for (const key of REQUIRED_DATA_KEYS) {
      if (!Array.isArray(payload.data[key])) {
        errors.push(`データ本体の "${key}" が配列ではありません。`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
