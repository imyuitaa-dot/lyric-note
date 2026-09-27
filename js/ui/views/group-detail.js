/*
  group-detail.js
  ------------------------------------------------------------
  グループ詳細画面。

  ・グループ名の変更・削除(削除しても曲自体は消えない)
  ・グループ内の曲の手動並び替え(↑↓。このグループだけのposition)
  ・グループから外す(曲自体は削除しない)
  ・「＋ 曲を追加」で、まだ入っていない曲を選んで追加する
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import {
  getGroup,
  getGroupSongRows,
  reorderGroupSongs,
  removeSongFromGroup,
  addSongToGroup,
  renameGroup,
  deleteGroup,
} from "../../data/repository.js";
import { getSongsCache, getArtistsCache, upsertGroupInCache, removeGroupFromCache } from "../../app-state.js";
import { getPrimaryArtistName, matchesBasicQuery } from "../../domain/song-helpers.js";
import { applyJacketImage } from "../components/jacket-image.js";
import { openTextPromptModal } from "../components/text-prompt-modal.js";
import { openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { attachDragHandle } from "../../utils/drag-reorder.js";

/**
 * @param {{id: string}} params
 * @returns {Promise<HTMLElement>}
 */
export async function renderGroupDetailView(params) {
  const group = await getGroup(params.id);

  if (!group) {
    const header = el("header", { className: "view-header" });
    header.append(
      el("button", { className: "icon-button", text: "←", onClick: () => navigateTo("/groups") }),
      el("h1", { text: "グループが見つかりません" })
    );
    const main = el("main", { className: "view-main" });
    main.append(el("div", { className: "empty-state", text: "このグループは削除されたか、存在しません。" }));
    const root = el("div", { className: "view" });
    root.append(header, main);
    return root;
  }

  const titleEl = el("h1", { text: group.name });
  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/groups"),
    }),
    titleEl,
    el("button", {
      className: "icon-button",
      text: "編集",
      onClick: () =>
        openTextPromptModal({
          title: "グループ名を編集",
          label: "グループ名",
          initialValue: group.name,
          onSubmit: async (name) => {
            await renameGroup(group.id, name);
            group.name = name;
            upsertGroupInCache({ ...group });
            titleEl.textContent = name;
          },
        }),
    }),
    el("button", {
      className: "icon-button",
      text: "削除",
      onClick: async () => {
        if (!window.confirm(`グループ「${group.name}」を削除しますか?(中の曲は削除されません)`)) return;
        await deleteGroup(group.id);
        removeGroupFromCache(group.id);
        navigateTo("/groups");
      },
    })
  );

  const main = el("main", { className: "view-main stack" });
  const listRoot = el("div", { className: "song-list" });
  main.append(listRoot);

  async function renderList() {
    listRoot.replaceChildren();
    const rows = await getGroupSongRows(group.id);
    const songs = rows.map((r) => getSongsCache().find((s) => s.id === r.songId)).filter(Boolean);

    if (songs.length === 0) {
      listRoot.append(el("div", { className: "empty-state", text: "このグループにはまだ曲がありません。" }));
      return;
    }

    const artistsCache = getArtistsCache();
    songs.forEach((song, index) => {
      listRoot.append(buildGroupSongRow(song, artistsCache, index, songs.length));
    });
  }

  function buildGroupSongRow(song, artistsCache, index, total) {
    const jacket = el("div", { className: "song-card__jacket" });
    jacket.append(el("span", { text: "♪" }));
    applyJacketImage(jacket, song.coverImageId);

    const info = el("div", { className: "song-card__info" });
    info.append(
      el("span", { className: "song-card__title", text: song.title }),
      el("span", { className: "song-card__artist", text: getPrimaryArtistName(song, artistsCache) })
    );

    const infoButton = el("button", {
      className: "song-card",
      onClick: () => navigateTo(`/songs/${song.id}`),
    });
    infoButton.append(jacket, info);
    infoButton.style.flex = "1";

    // ドラッグで並び替えるためのつまみ。↑↓ボタンは従来どおり残す。
    const dragHandle = el("button", {
      className: "icon-button drag-handle",
      text: "⠿",
      attrs: { "aria-label": "ドラッグして並び替え" },
    });

    const upButton = el("button", {
      className: "icon-button",
      text: "↑",
      attrs: { "aria-label": "上に移動" },
      onClick: () => moveSong(index, index - 1),
    });
    upButton.disabled = index === 0;

    const downButton = el("button", {
      className: "icon-button",
      text: "↓",
      attrs: { "aria-label": "下に移動" },
      onClick: () => moveSong(index, index + 1),
    });
    downButton.disabled = index === total - 1;

    const removeButton = el("button", {
      className: "icon-button",
      text: "外す",
      attrs: { "aria-label": "グループから外す" },
      onClick: async () => {
        await removeSongFromGroup(group.id, song.id);
        showToast("グループから外しました");
        renderList();
      },
    });

    const row = el("div", { className: "row group-song-row" });
    row.append(infoButton, dragHandle, upButton, downButton, removeButton);

    attachDragHandle({
      handle: dragHandle,
      row,
      getRows: () => Array.from(listRoot.children),
      onReorder: (fromIndex, toIndex) => reorderByDrag(fromIndex, toIndex),
    });

    return row;
  }

  async function moveSong(fromIndex, toIndex) {
    const rows = await getGroupSongRows(group.id);
    const orderedIds = rows.map((r) => r.songId);
    if (toIndex < 0 || toIndex >= orderedIds.length) return;
    [orderedIds[fromIndex], orderedIds[toIndex]] = [orderedIds[toIndex], orderedIds[fromIndex]];
    await reorderGroupSongs(group.id, orderedIds);
    renderList();
  }

  /**
   * ドラッグ&ドロップによる並び替え。↑↓の入れ替え(swap)と違い、
   * 「つかんだ曲を、ドロップ先の位置まで移動させる」挿入操作になる。
   */
  async function reorderByDrag(fromIndex, toIndex) {
    const rows = await getGroupSongRows(group.id);
    const orderedIds = rows.map((r) => r.songId);
    const [movedId] = orderedIds.splice(fromIndex, 1);
    orderedIds.splice(toIndex, 0, movedId);
    await reorderGroupSongs(group.id, orderedIds);
    renderList();
  }

  await renderList();

  const addButton = el("button", {
    className: "btn btn--ghost",
    text: "＋ 曲を追加",
    onClick: () => openAddSongsModal(),
  });
  main.append(addButton);

  function openAddSongsModal() {
    openModal((close) => {
      const wrapper = el("div", { className: "stack" });
      const header2 = el("div", { className: "row row--between" });
      header2.append(
        el("h2", { text: "曲を追加" }),
        el("button", { className: "icon-button", text: "×", onClick: () => close() })
      );
      wrapper.append(header2);

      const filterInput = el("input", {
        attrs: { type: "text", placeholder: "曲名・アーティストで絞り込み" },
      });
      wrapper.append(filterInput);

      const resultList = el("div", { className: "song-list" });
      wrapper.append(resultList);

      async function renderCandidates() {
        resultList.replaceChildren();
        const existingRows = await getGroupSongRows(group.id);
        const existingIds = new Set(existingRows.map((r) => r.songId));
        const artistsCache = getArtistsCache();
        const query = filterInput.value.trim();

        const candidates = getSongsCache().filter(
          (s) => !existingIds.has(s.id) && matchesBasicQuery(s, artistsCache, query)
        );

        if (candidates.length === 0) {
          resultList.append(
            el("div", { className: "empty-state", text: "追加できる曲がありません。" })
          );
          return;
        }

        for (const song of candidates) {
          const row = el("div", { className: "row row--between" });
          row.append(
            el("span", { text: `${song.title} / ${getPrimaryArtistName(song, artistsCache)}` }),
            el("button", {
              className: "btn btn--ghost",
              text: "追加",
              onClick: async () => {
                await addSongToGroup(group.id, song.id);
                showToast("追加しました");
                await renderCandidates();
                await renderList();
              },
            })
          );
          resultList.append(row);
        }
      }

      filterInput.addEventListener("input", () => renderCandidates());
      renderCandidates();

      return wrapper;
    });
  }

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}
