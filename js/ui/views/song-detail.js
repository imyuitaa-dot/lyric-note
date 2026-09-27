/*
  song-detail.js
  ------------------------------------------------------------
  曲詳細画面。

  ・ジャケット(Phase 5までは常にデフォルト表示)
  ・曲名/アーティスト/アルバム
  ・お気に入りハート(即時切替)
  ・和訳ON/OFF(英語のみ⇄英語+日本語)
  ・歌詞ブロックの表示 + 部分選択メモ(Phase 3で追加)
    - 英語または日本語の一部を選択すると、画面下部に「メモを追加」バーが出る
    - メモがある部分には点線の下線が表示され、タップすると内容を表示/編集/削除できる
    - 歌詞編集で位置がずれたメモは自動的に立て直しを試み、
      見つからない場合は「位置が見つからないメモ」として一覧表示する
  ・曲全体メモ(自由記述、フォーカスが外れたタイミングで自動保存)
  ・編集ボタン
*/

import { el, onDocumentEventWhileMounted, textOffsetInContainer } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import { getSong, saveSong } from "../../data/repository.js";
import { getArtistsCache, upsertSongInCache } from "../../app-state.js";
import { getPrimaryArtistName } from "../../domain/song-helpers.js";
import {
  buildNoteContext,
  createNote,
  findOverlappingNote,
  relocateBlockNotes,
} from "../../domain/annotations.js";
import { renderAnnotatedText } from "../components/annotated-text.js";
import { openNoteEditor } from "../components/note-popup.js";
import { showToast } from "../components/toast.js";
import { applyJacketImage } from "../components/jacket-image.js";

// 和訳ON/OFFは画面を離れると忘れてよい設定なので、モジュール変数で十分。
// (曲ごとに覚えておきたくなったら settings ストアに保存する形へ拡張できる)
let showJapanese = true;

/**
 * @param {{id: string}} params
 * @returns {Promise<HTMLElement>}
 */
export async function renderSongDetailView(params) {
  const song = await getSong(params.id);

  if (!song) {
    const header = el("header", { className: "view-header" });
    header.append(
      el("button", {
        className: "icon-button",
        text: "←",
        attrs: { "aria-label": "戻る" },
        onClick: () => navigateTo("/songs"),
      }),
      el("h1", { text: "曲が見つかりません" })
    );
    const main = el("main", { className: "view-main" });
    main.append(el("div", { className: "empty-state", text: "この曲は削除されたか、存在しません。" }));
    const root = el("div", { className: "view" });
    root.append(header, main);
    return root;
  }

  // 表示前に、各ブロックのメモの位置を検証・立て直しする。
  // (歌詞編集後、初めてこの曲を開いたときに位置ずれを解消するタイミング)
  let needsPersist = false;
  for (const block of song.blocks) {
    const { notes, changed } = relocateBlockNotes(block);
    if (changed) {
      block.notes = notes;
      needsPersist = true;
    }
  }
  if (needsPersist) {
    try {
      await saveSong(song);
      upsertSongInCache(song);
    } catch (err) {
      console.error("[song-detail] メモの位置補正の保存に失敗しました", err);
    }
  }

  const artistsCache = getArtistsCache();

  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/songs"),
    }),
    el("h1", { text: song.title }),
    el("button", {
      className: "icon-button",
      text: "編集",
      onClick: () => navigateTo(`/songs/${song.id}/edit`),
    })
  );

  const main = el("main", { className: "view-main stack" });

  // ジャケット
  const jacket = el("div", { className: "song-detail__jacket" });
  jacket.append(el("span", { text: "♪" }));
  applyJacketImage(jacket, song.coverImageId);
  main.append(jacket);

  main.append(
    el("div", { className: "song-detail__title", text: song.title }),
    el("div", {
      className: "song-detail__artist",
      text: song.album
        ? `${getPrimaryArtistName(song, artistsCache)} / ${song.album}`
        : getPrimaryArtistName(song, artistsCache),
    })
  );

  // お気に入り + 和訳ON/OFF
  const metaRow = el("div", { className: "song-detail__meta-row" });

  const favoriteButton = el("button", {
    className: "favorite-toggle",
    text: song.isFavorite ? "♥" : "♡",
    attrs: {
      "data-active": song.isFavorite ? "true" : "false",
      "aria-label": song.isFavorite ? "お気に入りを解除" : "お気に入りに追加",
    },
    onClick: async () => {
      song.isFavorite = !song.isFavorite;
      song.updatedAt = Date.now();
      await saveSong(song);
      upsertSongInCache(song);
      favoriteButton.textContent = song.isFavorite ? "♥" : "♡";
      favoriteButton.dataset.active = song.isFavorite ? "true" : "false";
    },
  });

  const togglePill = el("div", { className: "toggle-pill" });
  const onButton = el("button", {
    text: "和訳ON",
    attrs: { "aria-pressed": String(showJapanese) },
    onClick: () => {
      showJapanese = true;
      onButton.setAttribute("aria-pressed", "true");
      offButton.setAttribute("aria-pressed", "false");
      renderLyrics();
    },
  });
  const offButton = el("button", {
    text: "和訳OFF",
    attrs: { "aria-pressed": String(!showJapanese) },
    onClick: () => {
      showJapanese = false;
      onButton.setAttribute("aria-pressed", "false");
      offButton.setAttribute("aria-pressed", "true");
      renderLyrics();
    },
  });
  togglePill.append(onButton, offButton);

  metaRow.append(favoriteButton, togglePill);
  main.append(metaRow);

  // 歌詞ブロック
  const lyricsRoot = el("div", { className: "card" });
  main.append(lyricsRoot);

  function renderLyrics() {
    lyricsRoot.replaceChildren();
    hideSelectionBar();

    if (!song.blocks || song.blocks.length === 0) {
      lyricsRoot.append(el("div", { className: "empty-state", text: "歌詞が登録されていません。" }));
      return;
    }

    for (const block of song.blocks) {
      const blockEl = el("div", { className: "lyrics-block" });
      if (block.section) {
        blockEl.append(el("div", { className: "lyrics-block__section", text: block.section }));
      }

      const enContainer = el("div", { className: "lyrics-block__en" });
      enContainer.dataset.blockId = block.id;
      enContainer.dataset.lyricsTarget = "en";
      renderAnnotatedText(enContainer, block.en || "", block.notes, "en", (noteId) =>
        openNoteForEdit(block, noteId)
      );
      blockEl.append(enContainer);

      if (showJapanese && block.ja) {
        const jaContainer = el("div", { className: "lyrics-block__ja" });
        jaContainer.dataset.blockId = block.id;
        jaContainer.dataset.lyricsTarget = "ja";
        renderAnnotatedText(jaContainer, block.ja, block.notes, "ja", (noteId) =>
          openNoteForEdit(block, noteId)
        );
        blockEl.append(jaContainer);
      }

      // 位置が見つからなくなったメモ(orphaned)を一覧表示する。
      // 対象が日本語で、かつ和訳OFF中の場合は表示しない(その言語自体が見えていないため)。
      const orphanedNotes = block.notes.filter(
        (n) => n.status === "orphaned" && (n.target === "en" || showJapanese)
      );
      if (orphanedNotes.length > 0) {
        const orphanedBox = el("div", { className: "orphaned-notes" });
        orphanedBox.append(
          el("div", { className: "orphaned-notes__title", text: "位置が見つからないメモ" })
        );
        for (const note of orphanedNotes) {
          const row = el("div", { className: "orphaned-notes__row" });
          row.append(
            el("div", { className: "orphaned-notes__quote", text: `「${note.quote}」(${note.target === "en" ? "英語" : "日本語"})` }),
            el("div", { className: "orphaned-notes__text", text: note.text }),
            el("button", {
              className: "btn btn--ghost",
              text: "削除",
              onClick: () => deleteNote(block, note.id),
            })
          );
          orphanedBox.append(row);
        }
        blockEl.append(orphanedBox);
      }

      lyricsRoot.append(blockEl);
    }
  }

  /* ---------------- 部分選択メモ ---------------- */

  // 現在、画面下部の「メモを追加」バーが対象にしている選択範囲。
  // {blockId, target, start, end, quote} または null。
  let pendingSelection = null;

  const selectionQuotePreview = el("span", { className: "bottom-bar__quote" });
  const addNoteButton = el("button", {
    className: "btn btn--primary",
    text: "メモを追加",
    onClick: () => handleAddNoteFromSelection(),
  });
  const cancelSelectionButton = el("button", {
    className: "icon-button",
    text: "×",
    attrs: { "aria-label": "選択をやめる" },
    onClick: () => {
      hideSelectionBar();
      window.getSelection()?.removeAllRanges();
    },
  });
  const selectionBar = el("div", { className: "bottom-bar" });
  selectionBar.append(selectionQuotePreview, addNoteButton, cancelSelectionButton);
  selectionBar.style.display = "none";

  function showSelectionBar(quote) {
    selectionQuotePreview.textContent = quote.length > 24 ? quote.slice(0, 24) + "…" : quote;
    selectionBar.style.display = "flex";
  }

  function hideSelectionBar() {
    selectionBar.style.display = "none";
    pendingSelection = null;
  }

  function handleSelectionChange() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      hideSelectionBar();
      return;
    }

    const range = selection.getRangeAt(0);
    const startContainer = findLyricsContainer(range.startContainer);
    const endContainer = findLyricsContainer(range.endContainer);

    if (!startContainer || !endContainer || startContainer !== endContainer) {
      hideSelectionBar();
      return;
    }
    if (!lyricsRoot.contains(startContainer)) {
      hideSelectionBar();
      return;
    }

    const blockId = startContainer.dataset.blockId;
    const target = startContainer.dataset.lyricsTarget;
    const block = song.blocks.find((b) => b.id === blockId);
    if (!block) {
      hideSelectionBar();
      return;
    }
    const fullText = target === "en" ? block.en || "" : block.ja || "";

    let start = textOffsetInContainer(startContainer, range.startContainer, range.startOffset);
    let end = textOffsetInContainer(startContainer, range.endContainer, range.endOffset);
    if (start > end) [start, end] = [end, start];

    // 前後の空白・改行だけを選択に含めてしまうのを防ぐ
    while (start < end && /\s/.test(fullText[start])) start++;
    while (end > start && /\s/.test(fullText[end - 1])) end--;
    if (start >= end) {
      hideSelectionBar();
      return;
    }

    pendingSelection = { blockId, target, start, end, quote: fullText.slice(start, end) };
    showSelectionBar(pendingSelection.quote);
  }

  function findLyricsContainer(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element ? element.closest("[data-lyrics-target]") : null;
  }

  async function handleAddNoteFromSelection() {
    if (!pendingSelection) return;
    const { blockId, target, start, end, quote } = pendingSelection;
    const block = song.blocks.find((b) => b.id === blockId);
    hideSelectionBar();
    window.getSelection()?.removeAllRanges();
    if (!block) return;

    const overlapping = findOverlappingNote(block.notes, target, start, end);
    if (overlapping) {
      showToast("既存のメモと重なっています");
      openNoteForEdit(block, overlapping.id);
      return;
    }

    const fullText = target === "en" ? block.en || "" : block.ja || "";
    const context = buildNoteContext(fullText, start, end);

    openNoteEditor({
      mode: "add",
      quote,
      onSave: async (text) => {
        const note = createNote({
          target,
          start,
          end,
          quote: context.quote,
          prefix: context.prefix,
          suffix: context.suffix,
          text,
        });
        block.notes.push(note);
        song.updatedAt = Date.now();
        await saveSong(song);
        upsertSongInCache(song);
        renderLyrics();
        showToast("メモを保存しました");
      },
    });
  }

  function openNoteForEdit(block, noteId) {
    const note = block.notes.find((n) => n.id === noteId);
    if (!note) return;

    openNoteEditor({
      mode: "edit",
      quote: note.quote,
      initialText: note.text,
      onSave: async (text) => {
        note.text = text;
        note.updatedAt = Date.now();
        song.updatedAt = Date.now();
        await saveSong(song);
        upsertSongInCache(song);
        renderLyrics();
        showToast("メモを更新しました");
      },
      onDelete: () => deleteNote(block, noteId),
    });
  }

  async function deleteNote(block, noteId) {
    block.notes = block.notes.filter((n) => n.id !== noteId);
    song.updatedAt = Date.now();
    await saveSong(song);
    upsertSongInCache(song);
    renderLyrics();
    showToast("メモを削除しました");
  }

  // この画面が表示されている間だけ、選択状態の変化を監視する。
  // (画面が閉じられる=lyricsRootがDOMから外れると、自動的に監視をやめる)
  onDocumentEventWhileMounted("selectionchange", lyricsRoot, handleSelectionChange);

  renderLyrics();

  // 曲全体メモ
  const noteCard = el("div", { className: "card song-note stack" });
  noteCard.append(el("h2", { text: "曲についてのメモ" }));
  const noteTextarea = el("textarea", {
    attrs: {
      placeholder: "感想、解釈、覚えておきたいことなど自由に書けます。",
      rows: "5",
    },
  });
  noteTextarea.value = song.songNote || "";

  let lastSavedNote = song.songNote || "";
  noteTextarea.addEventListener("blur", async () => {
    if (noteTextarea.value === lastSavedNote) return;
    song.songNote = noteTextarea.value;
    song.updatedAt = Date.now();
    await saveSong(song);
    upsertSongInCache(song);
    lastSavedNote = noteTextarea.value;
    showToast("メモを保存しました");
  });

  const noteField = el("div", { className: "field" });
  noteField.append(noteTextarea);
  noteCard.append(noteField);
  main.append(noteCard);

  const root = el("div", { className: "view" });
  root.append(header, main, selectionBar);
  return root;
}
