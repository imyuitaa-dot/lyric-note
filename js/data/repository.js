/*
  repository.js
  ------------------------------------------------------------
  UI(js/ui/以下)やdomain層から呼ばれる、データアクセスの「窓口」。

  重要な設計方針(仕様書より):
  ・UIはこのファイルの関数だけを呼ぶ。db.js やIndexedDBを直接触らない。
  ・そうしておくことで、将来「IndexedDB版のrepository.js」を
    「Supabase版のrepository.js」に丸ごと差し替えるだけで、
    UI側のコードは変更せずに済む。
  ・すべての関数はPromiseを返す(SupabaseのAPIも非同期のため、形を合わせておく)。

  Phase 0では、Phase 1以降で使う関数の「土台」までを用意する。
*/

import { openDatabase } from "./db.js";
import { generateId } from "../utils/id.js";
import { toArtistNameKey, normalizeArtistDisplayName } from "../domain/text-normalize.js";

/**
 * 1つのオブジェクトストアに対して、Promiseベースでトランザクションを実行する
 * 共通ヘルパー。IndexedDBの生API(onsuccess/onerrorのコールバック形式)を
 * ここに閉じ込めることで、他の関数はasync/awaitで素直に書ける。
 *
 * @param {string|string[]} storeNames 対象のストア名(複数可)
 * @param {IDBTransactionMode} mode "readonly" | "readwrite"
 * @param {(stores: Record<string, IDBObjectStore>) => Promise<any>} callback
 * @returns {Promise<any>}
 */
async function runTransaction(storeNames, mode, callback) {
  const db = await openDatabase();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    /** @type {Record<string, IDBObjectStore>} */
    const stores = {};
    for (const name of names) {
      stores[name] = tx.objectStore(name);
    }

    let callbackResult;
    let callbackError;

    // callback内の処理(複数のIDBRequest)が完了するのを待つ必要はなく、
    // トランザクション自体のcompleteを待てばよい。ただしcallbackの戻り値
    // (呼び出し側に返したい結果)は先に評価しておく。
    Promise.resolve()
      .then(() => callback(stores))
      .then((result) => {
        callbackResult = result;
      })
      .catch((err) => {
        callbackError = err;
        try {
          tx.abort();
        } catch (_e) {
          // すでにabort/complete済みなら無視してよい
        }
      });

    tx.oncomplete = () => {
      if (callbackError) {
        reject(callbackError);
      } else {
        resolve(callbackResult);
      }
    };
    tx.onerror = () => reject(tx.error || callbackError);
    tx.onabort = () => reject(callbackError || tx.error || new Error("transaction aborted"));
  });
}

/** IDBRequestをPromiseに変換する小さなヘルパー */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ================================================================
   settings: 単純なkey-valueストア
   ================================================================ */

/**
 * 設定値を1つ取得する。
 * @param {string} key
 * @param {*} [defaultValue]
 */
export async function getSetting(key, defaultValue = undefined) {
  return runTransaction("settings", "readonly", async (stores) => {
    const record = await requestToPromise(stores.settings.get(key));
    return record ? record.value : defaultValue;
  });
}

/**
 * 設定値を1つ保存する。
 * @param {string} key
 * @param {*} value
 */
export async function setSetting(key, value) {
  return runTransaction("settings", "readwrite", async (stores) => {
    stores.settings.put({ key, value });
  });
}

/* ================================================================
   drafts: 曲追加・編集の下書き自動保存
   ================================================================ */

/**
 * 下書きを保存する。keyは新規曲なら"new"、既存曲の編集なら曲IDを使う想定。
 * @param {string} key
 * @param {object} draftData
 */
export async function saveDraft(key, draftData) {
  return runTransaction("drafts", "readwrite", async (stores) => {
    stores.drafts.put({ key, data: draftData, savedAt: Date.now() });
  });
}

/**
 * 下書きを取得する。無ければnullを返す。
 * @param {string} key
 */
export async function getDraft(key) {
  return runTransaction("drafts", "readonly", async (stores) => {
    const record = await requestToPromise(stores.drafts.get(key));
    return record ? record.data : null;
  });
}

/**
 * 下書きを削除する(保存が完了した後などに呼ぶ)。
 * @param {string} key
 */
export async function deleteDraft(key) {
  return runTransaction("drafts", "readwrite", async (stores) => {
    stores.drafts.delete(key);
  });
}

/* ================================================================
   artists: アーティスト
   ================================================================ */

/**
 * 全アーティストを取得する。
 * @returns {Promise<Array<object>>}
 */
export async function getAllArtists() {
  return runTransaction("artists", "readonly", async (stores) => {
    return requestToPromise(stores.artists.getAll());
  });
}

/**
 * アーティストを1件取得する。
 * @param {string} id
 */
export async function getArtist(id) {
  return runTransaction("artists", "readonly", async (stores) => {
    return requestToPromise(stores.artists.get(id));
  });
}

/**
 * アーティスト名から既存アーティストを探し、無ければ新規作成して、
 * どちらにせよそのアーティストのIDを返す。
 *
 * 「大文字小文字や余分な空白によって同じアーティストが別扱いされにくい」
 * という仕様を、nameKeyの一致で実現している。
 *
 * @param {string} rawName ユーザーが入力した名前
 * @returns {Promise<string>} artistId
 */
export async function findOrCreateArtistByName(rawName) {
  const displayName = normalizeArtistDisplayName(rawName);
  const nameKey = toArtistNameKey(rawName);
  if (!nameKey) {
    throw new Error("アーティスト名が空です");
  }

  return runTransaction("artists", "readwrite", async (stores) => {
    const existing = await requestToPromise(stores.artists.index("nameKey").get(nameKey));
    if (existing) {
      return existing.id;
    }
    const artist = {
      id: generateId(),
      name: displayName,
      nameKey,
    };
    stores.artists.add(artist);
    return artist.id;
  });
}

/* ================================================================
   songs: 曲(歌詞ブロック・部分メモ・曲全体メモを内包する)
   ================================================================ */

/**
 * 曲を1件取得する。
 * @param {string} id
 */
export async function getSong(id) {
  return runTransaction("songs", "readonly", async (stores) => {
    return requestToPromise(stores.songs.get(id));
  });
}

/**
 * 全曲を取得する。曲数は個人用途では多くて数百〜千程度を想定しているため、
 * 一覧・検索・アーティスト別などはこれをメモリ上でフィルタ/ソートして作る。
 * @returns {Promise<Array<object>>}
 */
export async function getAllSongs() {
  return runTransaction("songs", "readonly", async (stores) => {
    return requestToPromise(stores.songs.getAll());
  });
}

/**
 * 曲を新規保存または上書き保存する。
 * @param {object} song
 */
export async function saveSong(song) {
  return runTransaction("songs", "readwrite", async (stores) => {
    stores.songs.put(song);
  });
}

/**
 * 曲を削除する。関連する groupSongs (所属グループ情報)と、
 * 設定されていたジャケット画像も同時に削除する
 * (「曲を削除したときは、その曲に紐づくデータも一緒に片付ける」という方針)。
 *
 * 部分メモ・曲全体メモは songs ストアの中に内包されているため、
 * 曲自体の削除と同時に自動的に消える(別途削除する必要はない)。
 *
 * @param {string} songId
 */
export async function deleteSong(songId) {
  return runTransaction(["songs", "groupSongs", "images"], "readwrite", async (stores) => {
    const song = await requestToPromise(stores.songs.get(songId));

    stores.songs.delete(songId);

    const related = await requestToPromise(stores.groupSongs.index("songId").getAll(songId));
    for (const row of related) {
      stores.groupSongs.delete([row.groupId, row.songId]);
    }

    if (song && song.coverImageId) {
      stores.images.delete(song.coverImageId);
    }
  });
}

/* ================================================================
   groups / groupSongs: グループとグループ内の並び順
   ================================================================ */

/**
 * 全グループを取得する。
 */
export async function getAllGroups() {
  return runTransaction("groups", "readonly", async (stores) => {
    return requestToPromise(stores.groups.getAll());
  });
}

/**
 * グループを1件取得する。
 * @param {string} id
 */
export async function getGroup(id) {
  return runTransaction("groups", "readonly", async (stores) => {
    return requestToPromise(stores.groups.get(id));
  });
}

/**
 * グループを新規作成する。
 * @param {string} name
 * @returns {Promise<object>} 作成したグループ
 */
export async function createGroup(name) {
  const now = Date.now();
  const group = { id: generateId(), name: name.trim(), createdAt: now, updatedAt: now };
  return runTransaction("groups", "readwrite", async (stores) => {
    stores.groups.add(group);
    return group;
  });
}

/**
 * グループ名を変更する。
 * @param {string} groupId
 * @param {string} newName
 */
export async function renameGroup(groupId, newName) {
  return runTransaction("groups", "readwrite", async (stores) => {
    const group = await requestToPromise(stores.groups.get(groupId));
    if (!group) return;
    group.name = newName.trim();
    group.updatedAt = Date.now();
    stores.groups.put(group);
  });
}

/**
 * グループを削除する。仕様どおり、曲自体は削除せず、
 * このグループへの所属情報(groupSongs)だけを削除する。
 * @param {string} groupId
 */
export async function deleteGroup(groupId) {
  return runTransaction(["groups", "groupSongs"], "readwrite", async (stores) => {
    stores.groups.delete(groupId);
    const related = await requestToPromise(stores.groupSongs.index("groupId").getAll(groupId));
    for (const row of related) {
      stores.groupSongs.delete([row.groupId, row.songId]);
    }
  });
}

/**
 * 指定グループの所属曲一覧を、position順(表示順)で取得する。
 * @param {string} groupId
 * @returns {Promise<Array<{groupId:string, songId:string, position:number, addedAt:number}>>}
 */
export async function getGroupSongRows(groupId) {
  return runTransaction("groupSongs", "readonly", async (stores) => {
    const rows = await requestToPromise(stores.groupSongs.index("groupId").getAll(groupId));
    rows.sort((a, b) => a.position - b.position);
    return rows;
  });
}

/**
 * 曲が所属している全グループの所属行を取得する。
 * @param {string} songId
 */
export async function getGroupSongRowsBySong(songId) {
  return runTransaction("groupSongs", "readonly", async (stores) => {
    return requestToPromise(stores.groupSongs.index("songId").getAll(songId));
  });
}

/**
 * 曲をグループの末尾に追加する。すでに所属していれば何もしない。
 * @param {string} groupId
 * @param {string} songId
 */
export async function addSongToGroup(groupId, songId) {
  return runTransaction("groupSongs", "readwrite", async (stores) => {
    const existing = await requestToPromise(stores.groupSongs.get([groupId, songId]));
    if (existing) return;

    const rows = await requestToPromise(stores.groupSongs.index("groupId").getAll(groupId));
    const nextPosition = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.position)) + 1;

    stores.groupSongs.add({
      groupId,
      songId,
      position: nextPosition,
      addedAt: Date.now(),
    });
  });
}

/**
 * 曲をグループから外す(曲自体は消さない)。
 * @param {string} groupId
 * @param {string} songId
 */
export async function removeSongFromGroup(groupId, songId) {
  return runTransaction("groupSongs", "readwrite", async (stores) => {
    stores.groupSongs.delete([groupId, songId]);
  });
}

/**
 * グループ内の並び順を入れ替える(1つ上/下に移動する場合など)。
 * 呼び出し側は「並び替え後のsongId配列」を渡す。
 * この配列の並びどおりに position を 0,1,2... と振り直す。
 *
 * 同じグループ内のposition書き換えだけを行うため、
 * 他のグループの並び順には一切影響しない
 * (「グループごとに独立した並び順」という仕様はこの関数の設計で担保している)。
 *
 * @param {string} groupId
 * @param {string[]} orderedSongIds
 */
export async function reorderGroupSongs(groupId, orderedSongIds) {
  return runTransaction("groupSongs", "readwrite", async (stores) => {
    for (let i = 0; i < orderedSongIds.length; i++) {
      const songId = orderedSongIds[i];
      const row = await requestToPromise(stores.groupSongs.get([groupId, songId]));
      if (row) {
        row.position = i;
        stores.groupSongs.put(row);
      }
    }
  });
}

/* ================================================================
   images: ジャケット画像(dataURL文字列で保存)
   ================================================================ */

/**
 * 画像を保存する。
 * @param {{id: string, dataUrl: string, width: number, height: number}} image
 */
export async function saveImage(image) {
  return runTransaction("images", "readwrite", async (stores) => {
    stores.images.put({ ...image, createdAt: Date.now() });
  });
}

/**
 * 画像を1件取得する。
 * @param {string} id
 */
export async function getImage(id) {
  return runTransaction("images", "readonly", async (stores) => {
    return requestToPromise(stores.images.get(id));
  });
}

/**
 * 画像を削除する。
 * @param {string} id
 */
export async function deleteImage(id) {
  return runTransaction("images", "readwrite", async (stores) => {
    stores.images.delete(id);
  });
}

/* ================================================================
   バックアップ書き出し・読み込み(Phase 7)
   ------------------------------------------------------------
   ここではDB操作(トランザクション)だけを扱う。
   JSONの形式チェックやバージョン確認などの「データそのものを見て
   良し悪しを判断するロジック」は domain/backup.js に分離している
   (repository.jsはあくまで「窓口」で、判断はしない方針のため)。
   ================================================================ */

/** 全groupSongsを取得する(書き出し用)。 */
export async function getAllGroupSongs() {
  return runTransaction("groupSongs", "readonly", async (stores) => {
    return requestToPromise(stores.groupSongs.getAll());
  });
}

/** 全画像を取得する(画像込みバックアップ書き出し用)。 */
export async function getAllImages() {
  return runTransaction("images", "readonly", async (stores) => {
    return requestToPromise(stores.images.getAll());
  });
}

/** 全設定値を取得する(書き出し用)。 */
export async function getAllSettings() {
  return runTransaction("settings", "readonly", async (stores) => {
    return requestToPromise(stores.settings.getAll());
  });
}

const BACKUP_STORE_NAMES = ["songs", "artists", "groups", "groupSongs", "images", "settings"];

/**
 * バックアップに必要な全データを、1つの読み取りトランザクションで
 * まとめて取得する。(実行中に他の書き込みが割り込んで、
 * データ同士の整合性が崩れることを防ぐため)
 *
 * 画像を含めるかどうかはUI側(domain/backup.js経由)で決める。
 * ここでは常に全部取得し、除外は呼び出し側に任せる。
 *
 * @returns {Promise<{songs:Array, artists:Array, groups:Array, groupSongs:Array, images:Array, settings:Array}>}
 */
export async function exportAllData() {
  return runTransaction(BACKUP_STORE_NAMES, "readonly", async (stores) => {
    const [songs, artists, groups, groupSongs, images, settings] = await Promise.all([
      requestToPromise(stores.songs.getAll()),
      requestToPromise(stores.artists.getAll()),
      requestToPromise(stores.groups.getAll()),
      requestToPromise(stores.groupSongs.getAll()),
      requestToPromise(stores.images.getAll()),
      requestToPromise(stores.settings.getAll()),
    ]);
    return { songs, artists, groups, groupSongs, images, settings };
  });
}

/**
 * バックアップデータを読み込み、DBに反映する。
 * 6ストア全てを1つの読み書きトランザクションで扱うため、
 * 途中で失敗した場合はIndexedDBが自動的に全体をロールバックする
 * (「一部だけ書き込まれた中途半端な状態」にならない)。
 *
 * @param {{songs:Array, artists:Array, groups:Array, groupSongs:Array, images:Array, settings:Array}} data
 * @param {"replace"|"merge"} mode
 *   "replace": 既存の6ストアを全部空にしてから書き込む(完全上書き)
 *   "merge":   既存データは残したまま、同じidのものは上書き、無いidは追加する
 */
export async function importBackupData(data, mode) {
  return runTransaction(BACKUP_STORE_NAMES, "readwrite", async (stores) => {
    if (mode === "replace") {
      for (const name of BACKUP_STORE_NAMES) {
        await requestToPromise(stores[name].clear());
      }
    }

    const putAll = (storeName, records) => {
      if (!Array.isArray(records)) return;
      for (const record of records) {
        stores[storeName].put(record);
      }
    };

    // 依存関係の都合上、順序自体に意味はない(put()はidで上書き/追加するだけのため)。
    putAll("artists", data.artists);
    putAll("groups", data.groups);
    putAll("images", data.images);
    putAll("songs", data.songs);
    putAll("groupSongs", data.groupSongs);
    putAll("settings", data.settings);
  });
}

/**
 * songs.coverImageId が指す画像が実際には存在しない(=宙に浮いている)場合、
 * そのcoverImageIdをnullに直す自己修復処理。
 *
 * 「画像なしバックアップ」から復元した直後は、画像を持たない曲が
 * 古いcoverImageIdを持ったままになるため、この関数で後始末する。
 *
 * @returns {Promise<number>} 修復した曲数
 */
export async function cleanupOrphanedCoverImageIds() {
  return runTransaction(["songs", "images"], "readwrite", async (stores) => {
    const songs = await requestToPromise(stores.songs.getAll());
    let fixedCount = 0;
    for (const song of songs) {
      if (!song.coverImageId) continue;
      const image = await requestToPromise(stores.images.get(song.coverImageId));
      if (!image) {
        song.coverImageId = null;
        stores.songs.put(song);
        fixedCount += 1;
      }
    }
    return fixedCount;
  });
}
