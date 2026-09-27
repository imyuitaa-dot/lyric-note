/*
  song-edit.js
  ------------------------------------------------------------
  曲の追加・編集フォーム。/songs/new と /songs/:id/edit の両方をこの1画面で扱う。

  Phase 1でできること:
  ・曲名/アーティスト(1曲1アーティスト)/アルバムの入力
  ・歌詞ブロックの手動追加・削除(＋ボタン/削除ボタン)
  ・保存

  Phase 2で追加したこと:
  ・歌詞をまとめて貼り付けてブロックを自動生成([Verse 1]等の見出し検出、
    見出しが無ければ空行区切りで1ブロックとして扱う)
  ・ブロックの↑↓による並び替え
  ・下書きの自動保存(入力後、少し経つとdraftsストアに保存。次回開いたときに復元可能)

  Phase 4で追加したこと:
  ・アーティスト名のオートコンプリート(自前のドロップダウン候補)

  Phase 5で追加したこと:
  ・ジャケット画像の選択・プレビュー・削除
    (選択時にブラウザ側でリサイズ・圧縮し、保存を押すまでは images ストアに書き込まない)

  Phase 6で追加したこと:
  ・所属グループの選択(複数可)。保存時にgroupSongsを追加/削除で同期する。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import {
  getSong,
  saveSong,
  deleteSong,
  findOrCreateArtistByName,
  getArtist,
  getImage,
  saveImage,
  deleteImage,
  saveDraft,
  getDraft,
  deleteDraft,
  getGroupSongRowsBySong,
  addSongToGroup,
  removeSongFromGroup,
} from "../../data/repository.js";
import {
  upsertSongInCache,
  removeSongFromCache,
  upsertArtistInCache,
  getArtistsCache,
  getGroupsCache,
} from "../../app-state.js";
import { generateId } from "../../utils/id.js";
import { buildAutocompleteTextField } from "../components/autocomplete-field.js";
import { createEmptyBlock, getPrimaryArtistName, suggestArtistNames } from "../../domain/song-helpers.js";
import { normalizeNewlines } from "../../domain/text-normalize.js";
import { buildBlocksFromBulkPaste } from "../../domain/lyrics-parser.js";
import { resizeAndCompressImage } from "../../utils/image.js";
import { showToast } from "../components/toast.js";
import { attachDragHandle } from "../../utils/drag-reorder.js";

// 下書きの自動保存は、入力のたびに毎回書き込むと無駄が多いため、
// 最後の入力から少し待ってから保存する(デバウンス)。
const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * @param {{id?: string}} params id があれば編集、無ければ新規追加
 * @returns {Promise<HTMLElement>}
 */
export async function renderSongEditView(params) {
  const isEditing = Boolean(params && params.id);
  const existingSong = isEditing ? await getSong(params.id) : null;

  if (isEditing && !existingSong) {
    return renderNotFound();
  }

  // 下書きのキー: 新規曲は"new"、編集は曲IDで固定(仕様どおり)。
  const draftKey = isEditing ? existingSong.id : "new";
  const savedDraft = await getDraft(draftKey);

  // 編集対象に既存のジャケット画像があれば、プレビュー用に先に読み込んでおく。
  const originalCoverImageId = existingSong ? existingSong.coverImageId || null : null;
  const originalImage = originalCoverImageId ? await getImage(originalCoverImageId) : null;

  // 編集対象が既に所属しているグループを先に読み込んでおく(保存時の差分計算にも使う)。
  const originalGroupIds = existingSong
    ? (await getGroupSongRowsBySong(existingSong.id)).map((r) => r.groupId)
    : [];

  // フォームの内部状態。保存ボタンを押すまではここだけを書き換える。
  const formState = {
    title: existingSong ? existingSong.title : "",
    artistName: existingSong ? getPrimaryArtistName(existingSong, getArtistsCache()) : "",
    album: existingSong ? existingSong.album || "" : "",
    blocks:
      existingSong && existingSong.blocks.length > 0
        ? existingSong.blocks.map((b) => ({ ...b }))
        : [createEmptyBlock()],
    // 画像の状態: "none"(画像なし) / "existing"(既存のまま) / "new"(新しく選択) / "removed"(削除された)
    imageStatus: originalCoverImageId ? "existing" : "none",
    imagePreviewUrl: originalImage ? originalImage.dataUrl : null,
    imageDataUrl: null,
    imageWidth: null,
    imageHeight: null,
    groupIds: [...originalGroupIds],
  };

  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo(isEditing ? `/songs/${existingSong.id}` : "/songs"),
    }),
    el("h1", { text: isEditing ? "曲を編集" : "曲を追加" })
  );

  const main = el("main", { className: "view-main stack" });

  // 下書き自動保存のデバウンス用タイマー。
  // 注意: この宣言は必ず「使う場所より前」かつ「関数の実行が必ず通る場所」に
  // 置くこと(前バージョンではreturn文の後に書いてしまい、TDZ(未初期化)の
  // 状態のまま参照されて自動保存が機能しないバグがあった)。
  let autosaveTimer = null;

  // --- 下書き復元バナー(下書きがある場合のみ表示) ---
  if (savedDraft) {
    main.append(buildDraftBanner());
  }

  // --- 基本情報 ---
  const titleField = buildTextField({
    label: "曲名",
    required: true,
    value: formState.title,
    onInput: (v) => {
      formState.title = v;
      scheduleAutosave();
    },
  });
  const artistField = buildAutocompleteTextField({
    label: "アーティスト",
    required: true,
    value: formState.artistName,
    onInput: (v) => {
      formState.artistName = v;
      scheduleAutosave();
    },
    getSuggestions: (query) => suggestArtistNames(getArtistsCache(), query),
  });
  const albumField = buildTextField({
    label: "アルバム(任意)",
    required: false,
    value: formState.album,
    onInput: (v) => {
      formState.album = v;
      scheduleAutosave();
    },
  });

  const errorText = el("div", { className: "field__error" });

  // --- ジャケット画像 ---
  const imageField = buildImageField();

  const basicInfoCard = el("div", { className: "card stack" });
  basicInfoCard.append(
    imageField.wrapper,
    titleField.wrapper,
    artistField.wrapper,
    albumField.wrapper,
    errorText
  );
  main.append(basicInfoCard);

  // --- 所属グループ ---
  main.append(buildGroupField());

  // --- まとめて貼り付け ---
  main.append(buildBulkPastePanel());

  // --- 歌詞ブロック編集 ---
  main.append(el("h2", { text: "歌詞ブロック" }));
  const blockEditorRoot = el("div", { className: "block-editor" });
  main.append(blockEditorRoot);

  function renderBlocks() {
    blockEditorRoot.replaceChildren();
    formState.blocks.forEach((block, index) => {
      blockEditorRoot.append(buildBlockItem(block, index));
    });
  }

  function buildBlockItem(block, index) {
    const item = el("div", { className: "block-editor__item" });
    const isFirst = index === 0;
    const isLast = index === formState.blocks.length - 1;

    const itemHeader = el("div", { className: "block-editor__item-header" });
    const sectionField = buildTextField({
      label: `ブロック${index + 1}のセクション名(任意)`,
      required: false,
      value: block.section,
      onInput: (v) => {
        block.section = v;
        scheduleAutosave();
      },
      placeholder: "例: Verse 1, Chorus",
    });
    itemHeader.append(sectionField.wrapper);

    // ドラッグで並び替えるためのつまみ。↑↓ボタンは従来どおり残しておき、
    // 「掴んで動かす」操作が苦手な場合や、細かい位置調整をしたい場合の
    // 代わりの手段として使えるようにする。
    const dragHandle = el("button", {
      className: "icon-button drag-handle",
      text: "⠿",
      attrs: { "aria-label": `ブロック${index + 1}をドラッグして並び替え` },
    });
    itemHeader.append(dragHandle);

    const upButton = el("button", {
      className: "icon-button",
      text: "↑",
      attrs: { "aria-label": `ブロック${index + 1}を上に移動` },
      onClick: () => {
        if (isFirst) return;
        [formState.blocks[index - 1], formState.blocks[index]] = [
          formState.blocks[index],
          formState.blocks[index - 1],
        ];
        renderBlocks();
        scheduleAutosave();
      },
    });
    upButton.disabled = isFirst;

    const downButton = el("button", {
      className: "icon-button",
      text: "↓",
      attrs: { "aria-label": `ブロック${index + 1}を下に移動` },
      onClick: () => {
        if (isLast) return;
        [formState.blocks[index], formState.blocks[index + 1]] = [
          formState.blocks[index + 1],
          formState.blocks[index],
        ];
        renderBlocks();
        scheduleAutosave();
      },
    });
    downButton.disabled = isLast;

    itemHeader.append(upButton, downButton);

    // 「最低1ブロックは残す」制約は設けず、必要ならすべて削除してもよいことにしている
    // (歌詞を後からまとめて貼り付けたい場合などを想定)。
    itemHeader.append(
      el("button", {
        className: "block-editor__remove",
        text: "削除",
        attrs: { "aria-label": `ブロック${index + 1}を削除` },
        onClick: () => {
          formState.blocks.splice(index, 1);
          renderBlocks();
          scheduleAutosave();
        },
      })
    );
    item.append(itemHeader);

    const enField = buildTextAreaField({
      label: "英語歌詞",
      value: block.en,
      onInput: (v) => {
        block.en = v;
        scheduleAutosave();
      },
      rows: 3,
    });
    const jaField = buildTextAreaField({
      label: "日本語訳",
      value: block.ja,
      onInput: (v) => {
        block.ja = v;
        scheduleAutosave();
      },
      rows: 3,
    });
    item.append(enField.wrapper, jaField.wrapper);

    attachDragHandle({
      handle: dragHandle,
      row: item,
      getRows: () => Array.from(blockEditorRoot.children),
      onReorder: (fromIndex, toIndex) => {
        const [moved] = formState.blocks.splice(fromIndex, 1);
        formState.blocks.splice(toIndex, 0, moved);
        renderBlocks();
        scheduleAutosave();
      },
    });

    return item;
  }

  renderBlocks();

  const addBlockButton = el("button", {
    className: "btn btn--ghost",
    text: "＋ ブロックを追加",
    onClick: () => {
      formState.blocks.push(createEmptyBlock());
      renderBlocks();
      scheduleAutosave();
    },
  });
  main.append(addBlockButton);

  // --- 保存/キャンセル ---
  const actionRow = el("div", { className: "row" });
  const saveButton = el("button", {
    className: "btn btn--primary",
    text: isEditing ? "更新する" : "保存する",
    onClick: async () => {
      errorText.textContent = "";

      const title = formState.title.trim();
      const artistName = formState.artistName.trim();

      if (!title) {
        errorText.textContent = "曲名を入力してください。";
        return;
      }
      if (!artistName) {
        errorText.textContent = "アーティストを入力してください。";
        return;
      }

      saveButton.disabled = true;
      try {
        const artistId = await findOrCreateArtistByName(artistName);
        const artist = await getArtist(artistId);
        if (artist) upsertArtistInCache(artist);

        const now = Date.now();
        const cleanedBlocks = formState.blocks.map((b) => ({
          id: b.id || generateId(),
          section: (b.section || "").trim(),
          en: normalizeNewlines(b.en || ""),
          ja: normalizeNewlines(b.ja || ""),
          notes: b.notes || [],
        }));

        // ジャケット画像の確定処理。
        // ・"new"    : リサイズ済みのdataURLをimagesストアに新規保存
        // ・"removed": 画像を外す(元の画像があれば削除)
        // ・"existing"/"none": 何もしない(coverImageIdは維持/nullのまま)
        let coverImageId = originalCoverImageId;
        if (formState.imageStatus === "new") {
          coverImageId = generateId();
          await saveImage({
            id: coverImageId,
            dataUrl: formState.imageDataUrl,
            width: formState.imageWidth,
            height: formState.imageHeight,
          });
          if (originalCoverImageId) {
            await deleteImage(originalCoverImageId).catch((err) =>
              console.error("[song-edit] 古い画像の削除に失敗しました", err)
            );
          }
        } else if (formState.imageStatus === "removed") {
          coverImageId = null;
          if (originalCoverImageId) {
            await deleteImage(originalCoverImageId).catch((err) =>
              console.error("[song-edit] 古い画像の削除に失敗しました", err)
            );
          }
        }

        const song = existingSong
          ? {
              ...existingSong,
              title,
              album: formState.album.trim(),
              artistCredits: [{ artistId, role: "main" }],
              coverImageId,
              blocks: cleanedBlocks,
              updatedAt: now,
            }
          : {
              id: generateId(),
              title,
              album: formState.album.trim(),
              artistCredits: [{ artistId, role: "main" }],
              coverImageId,
              isFavorite: false,
              songNote: "",
              blocks: cleanedBlocks,
              createdAt: now,
              updatedAt: now,
            };

        await saveSong(song);
        upsertSongInCache(song);

        // 所属グループの差分をgroupSongsに反映する。
        // (グループごとの並び順=positionは、addSongToGroup側で
        //  「そのグループの末尾に追加」として自動的に割り振られる)
        const toAdd = formState.groupIds.filter((id) => !originalGroupIds.includes(id));
        const toRemove = originalGroupIds.filter((id) => !formState.groupIds.includes(id));
        for (const groupId of toAdd) {
          await addSongToGroup(groupId, song.id);
        }
        for (const groupId of toRemove) {
          await removeSongFromGroup(groupId, song.id);
        }

        // 保存が成功したので、この曲の下書きはもう不要になる
        await deleteDraft(draftKey);
        showToast(isEditing ? "更新しました" : "曲を保存しました");
        navigateTo(`/songs/${song.id}`);
      } catch (err) {
        console.error(err);
        errorText.textContent = "保存に失敗しました: " + err.message;
      } finally {
        saveButton.disabled = false;
      }
    },
  });
  const cancelButton = el("button", {
    className: "btn btn--ghost",
    text: "キャンセル",
    onClick: () => navigateTo(isEditing ? `/songs/${existingSong.id}` : "/songs"),
  });
  actionRow.append(saveButton, cancelButton);
  main.append(actionRow);

  // --- 曲の削除(既存曲の編集画面のみ表示) ---
  if (isEditing) {
    main.append(buildDeleteSongSection());
  }

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;

  /* ---------------- 内部関数(クロージャでformStateを参照する) ---------------- */

  /** 下書き自動保存をデバウンス付きで予約する */
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      saveDraft(draftKey, {
        title: formState.title,
        artistName: formState.artistName,
        album: formState.album,
        blocks: formState.blocks,
      }).catch((err) => console.error("[song-edit] 下書きの保存に失敗しました", err));
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  /** 所属グループのチェックボックス一覧を作る */
  function buildGroupField() {
    const wrapper = el("div", { className: "card stack" });
    wrapper.append(el("h2", { text: "所属グループ(任意)" }));

    const groups = getGroupsCache();
    if (groups.length === 0) {
      wrapper.append(
        el("p", {
          className: "menu-button__hint",
          text: "グループがまだありません。先に「グループ別」画面で作成すると、ここで選べるようになります。",
        })
      );
      return wrapper;
    }

    const list = el("div", { className: "stack" });
    for (const group of groups) {
      const row = el("label", { className: "checkbox-row" });
      const checkbox = el("input", { attrs: { type: "checkbox" } });
      checkbox.checked = formState.groupIds.includes(group.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          if (!formState.groupIds.includes(group.id)) formState.groupIds.push(group.id);
        } else {
          formState.groupIds = formState.groupIds.filter((id) => id !== group.id);
        }
      });
      row.append(checkbox, el("span", { text: group.name }));
      list.append(row);
    }
    wrapper.append(list);
    return wrapper;
  }

  /** ジャケット画像の選択・プレビュー・削除フィールドを作る */
  function buildImageField() {
    const wrapper = el("div", { className: "field" });
    wrapper.append(el("label", { className: "field__label", text: "ジャケット画像(任意)" }));

    const row = el("div", { className: "image-field__row" });
    const preview = el("div", { className: "image-field__preview" });
    row.append(preview);

    function renderPreview() {
      preview.replaceChildren();
      if (formState.imagePreviewUrl) {
        const img = el("img", { attrs: { alt: "" } });
        img.src = formState.imagePreviewUrl;
        preview.append(img);
      } else {
        preview.append(el("span", { text: "♪" }));
      }
      removeButton.style.display =
        formState.imageStatus === "existing" || formState.imageStatus === "new" ? "inline-flex" : "none";
    }

    const fileInput = el("input", {
      attrs: { type: "file", accept: "image/*" },
    });
    fileInput.style.display = "none";
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = ""; // 同じファイルを選び直せるようにリセット
      if (!file) return;

      try {
        const { dataUrl, width, height } = await resizeAndCompressImage(file);
        formState.imageStatus = "new";
        formState.imageDataUrl = dataUrl;
        formState.imageWidth = width;
        formState.imageHeight = height;
        formState.imagePreviewUrl = dataUrl;
        renderPreview();
        scheduleAutosave();
      } catch (err) {
        console.error(err);
        showToast("画像の読み込みに失敗しました");
      }
    });

    const selectButton = el("button", {
      className: "btn btn--ghost",
      text: "画像を選択",
      onClick: () => fileInput.click(),
    });

    const removeButton = el("button", {
      className: "btn btn--ghost",
      text: "削除",
      onClick: () => {
        formState.imageStatus = "removed";
        formState.imageDataUrl = null;
        formState.imagePreviewUrl = null;
        renderPreview();
        scheduleAutosave();
      },
    });

    const buttonColumn = el("div", { className: "image-field__buttons" });
    buttonColumn.append(selectButton, removeButton, fileInput);
    row.append(buttonColumn);
    wrapper.append(row);

    renderPreview();
    return { wrapper };
  }

  /** 下書き復元バナーを作る */
  function buildDraftBanner() {
    const banner = el("div", { className: "card stack draft-banner" });
    banner.append(
      el("p", { text: "前回の続きの下書きがあります。復元しますか?" })
    );
    const buttonRow = el("div", { className: "row" });
    const restoreButton = el("button", {
      className: "btn btn--primary",
      text: "復元する",
      onClick: () => {
        formState.title = savedDraft.title || "";
        formState.artistName = savedDraft.artistName || "";
        formState.album = savedDraft.album || "";
        formState.blocks =
          savedDraft.blocks && savedDraft.blocks.length > 0
            ? savedDraft.blocks.map((b) => ({ ...b, id: b.id || generateId(), notes: b.notes || [] }))
            : [createEmptyBlock()];

        titleField.input.value = formState.title;
        artistField.input.value = formState.artistName;
        albumField.input.value = formState.album;
        renderBlocks();

        banner.remove();
        showToast("下書きを復元しました");
      },
    });
    const discardButton = el("button", {
      className: "btn btn--ghost",
      text: "破棄する",
      onClick: async () => {
        await deleteDraft(draftKey);
        banner.remove();
      },
    });
    buttonRow.append(restoreButton, discardButton);
    banner.append(buttonRow);
    return banner;
  }

  /** 「歌詞をまとめて貼り付け」パネルを作る */
  function buildBulkPastePanel() {
    const details = el("details", { className: "card" });
    details.append(el("summary", { text: "歌詞をまとめて貼り付けて自動生成" }));

    const description = el("p", {
      className: "menu-button__hint",
      text:
        "[Verse 1] [Chorus] のような見出し行があれば、見出しごとにブロックを分けます。" +
        "見出しが無い場合は、空行で区切られたまとまりを1ブロックとして扱います。",
    });

    const enField = buildTextAreaField({ label: "英語歌詞(まとめて貼り付け)", value: "", onInput: () => {}, rows: 6 });
    const jaField = buildTextAreaField({ label: "日本語訳(まとめて貼り付け)", value: "", onInput: () => {}, rows: 6 });

    const generateButton = el("button", {
      className: "btn btn--primary",
      text: "ブロックを生成",
      onClick: () => {
        const result = buildBlocksFromBulkPaste(enField.textarea.value, jaField.textarea.value);

        if (result.blocks.length === 0) {
          showToast("貼り付けられた歌詞がありません");
          return;
        }

        const hasExistingContent =
          formState.blocks.length > 1 ||
          formState.blocks.some((b) => (b.en || "").trim() || (b.ja || "").trim() || (b.section || "").trim());

        // ブロックを丸ごと置き換えると、既存ブロックに付いていた部分メモも
        // 一緒に消えてしまう。件数が分かるよう警告に含める。
        const existingNoteCount = formState.blocks.reduce((sum, b) => sum + (b.notes ? b.notes.length : 0), 0);

        if (hasExistingContent) {
          let message = `既存の${formState.blocks.length}個のブロックを、生成した${result.blocks.length}個のブロックで置き換えます。`;
          if (existingNoteCount > 0) {
            message += `\n既存ブロックに付いている部分メモ${existingNoteCount}件も削除されます。`;
          }
          message += "\nよろしいですか?";
          const confirmed = window.confirm(message);
          if (!confirmed) return;
        }

        formState.blocks = result.blocks;
        renderBlocks();
        scheduleAutosave();

        let message = `${result.blocks.length}個のブロックを生成しました。`;
        if (result.mismatched) {
          message += ` (英語${result.enCount}個 / 日本語${result.jaCount}個。ズレがないか確認してください)`;
        }
        showToast(message);
      },
    });

    details.append(description, enField.wrapper, jaField.wrapper, generateButton);
    return details;
  }

  /**
   * 「この曲を削除」セクションを作る(既存曲の編集画面のみ)。
   * 誤タップで消えてしまわないよう、他の操作から離して一番下に置き、
   * 実行前にconfirmで念押しする。
   */
  function buildDeleteSongSection() {
    const section = el("div", { className: "card stack danger-zone" });
    section.append(
      el("h2", { text: "この曲を削除" }),
      el("p", {
        className: "menu-button__hint",
        text:
          "曲名・歌詞・和訳・部分メモ・曲全体メモ・ジャケット画像がすべて削除されます。" +
          "所属していたグループからも外れます。この操作は元に戻せません。",
      })
    );

    const deleteButton = el("button", {
      className: "btn btn--danger",
      text: "この曲を削除する",
      onClick: async () => {
        const confirmed = window.confirm(
          `「${existingSong.title}」を削除します。元に戻せませんが、よろしいですか?`
        );
        if (!confirmed) return;

        deleteButton.disabled = true;
        try {
          await deleteSong(existingSong.id);
          removeSongFromCache(existingSong.id);
          // この曲用の下書きが残っていても意味がなくなるので、合わせて削除しておく。
          await deleteDraft(draftKey);
          showToast("曲を削除しました");
          navigateTo("/songs");
        } catch (err) {
          console.error(err);
          showToast("削除に失敗しました: " + err.message);
          deleteButton.disabled = false;
        }
      },
    });
    section.append(deleteButton);
    return section;
  }
}

function renderNotFound() {
  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      onClick: () => navigateTo("/songs"),
    }),
    el("h1", { text: "曲が見つかりません" })
  );
  const main = el("main", { className: "view-main" });
  main.append(el("div", { className: "empty-state", text: "編集対象の曲が見つかりませんでした。" }));
  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}

/**
 * ラベル付きテキスト入力を1つ作る。
 * @returns {{wrapper: HTMLElement, input: HTMLInputElement}}
 */
function buildTextField({ label, required, value, onInput, hint, placeholder }) {
  const wrapper = el("div", { className: "field" });
  wrapper.append(
    el("label", {
      className: "field__label" + (required ? " field__label--required" : ""),
      text: label,
    })
  );
  const input = el("input", {
    attrs: { type: "text", placeholder: placeholder || "" },
  });
  input.value = value || "";
  input.addEventListener("input", () => onInput(input.value));
  wrapper.append(input);
  if (hint) {
    wrapper.append(el("span", { className: "menu-button__hint", text: hint }));
  }
  return { wrapper, input };
}

/**
 * ラベル付きテキストエリアを1つ作る。
 * @returns {{wrapper: HTMLElement, textarea: HTMLTextAreaElement}}
 */
function buildTextAreaField({ label, value, onInput, rows = 3 }) {
  const wrapper = el("div", { className: "field" });
  wrapper.append(el("label", { className: "field__label", text: label }));
  const textarea = el("textarea", { attrs: { rows: String(rows) } });
  textarea.value = value || "";
  textarea.addEventListener("input", () => onInput(textarea.value));
  wrapper.append(textarea);
  return { wrapper, textarea };
}
