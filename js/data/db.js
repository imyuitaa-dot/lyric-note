/*
  db.js
  ------------------------------------------------------------
  IndexedDBそのものを扱う、最も低レイヤーのファイル。
  ここでは「DBを開く」「バージョンアップ時にストアを作る」ことだけを行う。

  重要な設計方針:
  ・このファイルの外(repository.js より上の層)は、IndexedDBの存在を意識しない。
    将来Supabase等に差し替えるときは、このファイルとrepository.jsの中身だけを
    書き換えれば済むようにしている。
*/

// DB名はアプリ固有にする。GitHub Pagesでは同じ "ユーザー名.github.io" 配下の
// 他のアプリとオリジンを共有するため、ありがちな名前(例: "db")にすると
// 他アプリと衝突する可能性があるための対策。
const DB_NAME = "lyricNoteDB";

// DBのスキーマ(ストア構成)を変更したら、このバージョン番号を上げる。
// 上げるたびに、下のupgradeneededで「旧→新」の移行処理を追加していく。
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/**
 * DB接続を取得する(まだなければ開いて、以後は使い回す)。
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // DBが存在しない、またはDB_VERSIONを上げたときに一度だけ呼ばれる。
    // ここでストア(テーブルに相当)とインデックスを作る。
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        createV1Schema(db);
      }
      // 将来 DB_VERSION を2にしたら、ここに
      // if (oldVersion < 2) { ... } を追記していく(過去のデータを壊さないため)。
    };

    request.onsuccess = () => {
      const db = request.result;
      // 他のタブでDBのバージョンが上がった場合、開きっぱなしの接続が
      // 新しいアップグレードをブロックしてしまう。ここでは単純に閉じて、
      // 次回アクセス時に開き直させることで対応する(個人用アプリなので簡易対応で十分)。
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };

    request.onblocked = () => {
      // 別タブでこのDBを開いたままバージョンアップしようとすると発生しうる。
      // 個人用アプリでは頻度は低いが、原因が分かるようにログを残す。
      console.warn("[db] IndexedDBのアップグレードが他のタブによりブロックされています。他のタブを閉じてください。");
    };
  });

  return dbPromise;
}

/**
 * バージョン1(第一版)のストア構成を作る。
 * @param {IDBDatabase} db
 */
function createV1Schema(db) {
  // 曲。歌詞ブロック・部分メモ・曲全体メモはSong内に入れ子で持つ。
  const songs = db.createObjectStore("songs", { keyPath: "id" });
  songs.createIndex("createdAt", "createdAt");

  // アーティスト。nameKeyで重複(表記ゆれ含む)を防ぐ。
  const artists = db.createObjectStore("artists", { keyPath: "id" });
  artists.createIndex("nameKey", "nameKey", { unique: true });

  // グループ本体(名前など)。曲との所属関係は持たない。
  db.createObjectStore("groups", { keyPath: "id" });

  // グループと曲の所属・並び順。複合キーにより同じ組み合わせの重複登録を防ぐ。
  const groupSongs = db.createObjectStore("groupSongs", {
    keyPath: ["groupId", "songId"],
  });
  groupSongs.createIndex("groupId", "groupId");
  groupSongs.createIndex("songId", "songId");

  // ジャケット画像。曲本体から分離し、一覧表示を軽くする。
  db.createObjectStore("images", { keyPath: "id" });

  // 曲追加・編集の下書き(自動保存用)。keyは新規なら"new"、編集なら曲ID。
  db.createObjectStore("drafts", { keyPath: "key" });

  // アプリ設定(ソート順、和訳ON/OFFの既定値、最終バックアップ日時など)。
  db.createObjectStore("settings", { keyPath: "key" });
}

/**
 * 動作確認用: 現在のDB名・バージョン・ストア一覧を返す。
 * 設定画面などから「DBは正常に開けているか」を確認するために使う。
 * @returns {Promise<{name: string, version: number, storeNames: string[]}>}
 */
export async function getDatabaseInfo() {
  const db = await openDatabase();
  return {
    name: db.name,
    version: db.version,
    storeNames: Array.from(db.objectStoreNames),
  };
}
