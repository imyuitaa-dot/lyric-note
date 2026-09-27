/*
  group-list.js
  ------------------------------------------------------------
  グループ別画面。作成したグループを一覧表示し、「＋」で新規作成する。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import { createGroup, getGroupSongRows } from "../../data/repository.js";
import { getGroupsCache, upsertGroupInCache } from "../../app-state.js";
import { compareJa } from "../../domain/text-normalize.js";
import { openTextPromptModal } from "../components/text-prompt-modal.js";

export async function renderGroupListView() {
  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/"),
    }),
    el("h1", { text: "グループ別" }),
    el("button", {
      className: "icon-button",
      text: "＋",
      attrs: { "aria-label": "グループを作成" },
      onClick: () => openCreateGroupModal(),
    })
  );

  const main = el("main", { className: "view-main" });

  const groups = [...getGroupsCache()].sort((a, b) => compareJa(a.name, b.name));

  if (groups.length === 0) {
    main.append(
      el("div", {
        className: "empty-state",
        text: "グループがまだありません。右上の＋から作成できます。",
      })
    );
  } else {
    const list = el("div", { className: "song-list" });
    // 各グループの曲数をまとめて数える
    const counts = await Promise.all(groups.map((g) => getGroupSongRows(g.id)));
    groups.forEach((group, i) => {
      const row = el("button", {
        className: "artist-row",
        onClick: () => navigateTo(`/groups/${group.id}`),
      });
      row.append(
        el("span", { className: "artist-row__name", text: group.name }),
        el("span", { className: "artist-row__count", text: `${counts[i].length}曲` })
      );
      list.append(row);
    });
    main.append(list);
  }

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}

function openCreateGroupModal() {
  openTextPromptModal({
    title: "グループを作成",
    label: "グループ名",
    placeholder: "例: Louisライブまでに覚える",
    confirmLabel: "作成",
    onSubmit: async (name) => {
      const group = await createGroup(name);
      upsertGroupInCache(group);
      navigateTo(`/groups/${group.id}`);
    },
  });
}
