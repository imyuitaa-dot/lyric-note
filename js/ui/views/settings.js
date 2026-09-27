/*
  settings.js
  ------------------------------------------------------------
  設定画面。Phase 0では「DBが正常に開けているか」を確認できることを
  最優先にする(iPhoneでの動作確認で最初に見る画面になるため)。

  Phase 7でバックアップの書き出し・読み込みUIを実装した。
*/

import { el } from "../../utils/dom.js";
import { navigateTo } from "../../router.js";
import { getDatabaseInfo } from "../../data/db.js";
import { showToast } from "../components/toast.js";
import { openModal } from "../components/modal.js";
import {
  getSetting,
  setSetting,
  exportAllData,
  importBackupData,
  cleanupOrphanedCoverImageIds,
} from "../../data/repository.js";
import { buildBackupPayload, validateBackupPayload } from "../../domain/backup.js";

/**
 * @returns {Promise<HTMLElement>}
 */
export async function renderSettingsView() {
  const header = el("header", { className: "view-header" });
  header.append(
    el("button", {
      className: "icon-button",
      text: "←",
      attrs: { "aria-label": "戻る" },
      onClick: () => navigateTo("/"),
    }),
    el("h1", { text: "設定" })
  );

  const main = el("main", { className: "view-main stack" });

  const statusCard = el("div", { className: "card status-panel" });
  statusCard.append(el("h2", { text: "動作状況" }));

  try {
    const info = await getDatabaseInfo();
    statusCard.append(
      buildStatusRow("IndexedDB", "接続OK", true),
      buildStatusRow("DB名", info.name, true),
      buildStatusRow("スキーマバージョン", String(info.version), true),
      buildStatusRow("ストア数", `${info.storeNames.length}個 (${info.storeNames.join(", ")})`, true)
    );
  } catch (err) {
    console.error(err);
    statusCard.append(buildStatusRow("IndexedDB", "接続に失敗しました: " + err.message, false));
  }

  // このアプリがホーム画面に追加された状態(スタンドアロン)で開かれているかどうか。
  // Safariのタブで開いているだけだと、7日間操作がないとIndexedDBが削除される
  // 可能性があるため、この表示で気づけるようにしておく。
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  statusCard.append(
    buildStatusRow(
      "起動方法",
      isStandalone ? "ホーム画面から起動 (推奨)" : "ブラウザのタブから起動",
      isStandalone
    )
  );

  if (!isStandalone) {
    const hint = el("p", {
      className: "empty-state",
      text: "iPhoneでは「共有」→「ホーム画面に追加」してから使うと、データが消えにくくなります。",
    });
    statusCard.append(hint);
  }

  main.append(statusCard);

  // navigator.storage.persist() のリクエストボタン。
  // 対応ブラウザでは、これを許可してもらうことでデータが自動削除されにくくなる。
  const persistButton = el("button", {
    className: "btn btn--ghost",
    text: "データを保護する(永続化をリクエスト)",
    onClick: async () => {
      if (!navigator.storage || !navigator.storage.persist) {
        showToast("このブラウザは永続化リクエストに対応していません");
        return;
      }
      const granted = await navigator.storage.persist();
      showToast(granted ? "永続化が許可されました" : "許可されませんでした(ホーム画面追加後に再試行してください)");
    },
  });
  main.append(persistButton);

  const backupCard = await buildBackupCard();
  main.append(backupCard);

  const root = el("div", { className: "view" });
  root.append(header, main);
  return root;
}

/**
 * 「バックアップ」カード全体を組み立てる。
 * 書き出し(画像込み/なし)・読み込み(置き換え/追加)・最終書き出し日時表示を行う。
 */
async function buildBackupCard() {
  const card = el("div", { className: "card stack" });
  card.append(el("h2", { text: "バックアップ" }));

  const lastExportedAt = await getSetting("lastBackupExportedAt", null);
  const lastExportedRow = el("p", {
    className: "empty-state",
    text: lastExportedAt
      ? `最終書き出し日時: ${formatDateTime(lastExportedAt)}`
      : "まだ書き出しを行っていません。",
  });
  card.append(lastExportedRow);

  card.append(
    el("p", {
      text: "曲・歌詞・メモなどのデータをJSONファイルとして書き出します。画像を含めるとファイルが大きくなります。",
    })
  );

  const exportRow = el("div", { className: "row" });
  const exportWithImagesBtn = el("button", {
    className: "btn btn--primary",
    text: "画像を含めて書き出す",
  });
  const exportWithoutImagesBtn = el("button", {
    className: "btn btn--ghost",
    text: "画像を含めずに書き出す",
  });
  exportRow.append(exportWithImagesBtn, exportWithoutImagesBtn);
  card.append(exportRow);

  async function runExport(includeImages, triggerButton) {
    triggerButton.disabled = true;
    try {
      const rawData = await exportAllData();
      const payload = buildBackupPayload(rawData, { includeImages });
      const json = JSON.stringify(payload, null, 2);
      const filename = `lyric-note-backup-${includeImages ? "with-images" : "no-images"}-${formatDateForFilename(
        new Date()
      )}.json`;
      await downloadJsonFile(json, filename);
      await setSetting("lastBackupExportedAt", Date.now());
      lastExportedRow.textContent = `最終書き出し日時: ${formatDateTime(Date.now())}`;
      showToast("書き出しました");
    } catch (err) {
      console.error(err);
      showToast("書き出しに失敗しました: " + err.message);
    } finally {
      triggerButton.disabled = false;
    }
  }

  exportWithImagesBtn.addEventListener("click", () => runExport(true, exportWithImagesBtn));
  exportWithoutImagesBtn.addEventListener("click", () => runExport(false, exportWithoutImagesBtn));

  card.append(el("hr", {}));

  card.append(
    el("p", {
      text: "書き出したJSONファイルから復元します。復元前に内容を確認するモーダルが出ます。",
    })
  );

  const fileInput = el("input", {
    attrs: { type: "file", accept: "application/json,.json" },
  });
  fileInput.style.display = "none";

  const importBtn = el("button", {
    className: "btn btn--ghost",
    text: "バックアップから復元する",
    onClick: () => fileInput.click(),
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ""; // 同じファイルを連続で選んでもchangeが発火するようにする
    if (!file) return;

    let payload;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch (err) {
      showToast("JSONファイルとして読み込めませんでした。");
      return;
    }

    const { valid, errors } = validateBackupPayload(payload);
    if (!valid) {
      openValidationErrorModal(errors);
      return;
    }

    openImportConfirmModal(payload);
  });

  card.append(importBtn, fileInput);

  return card;
}

/** 形式チェックで引っかかった場合のエラー一覧モーダル。 */
function openValidationErrorModal(errors) {
  openModal((close) => {
    const wrapper = el("div", { className: "stack" });
    const header = el("div", { className: "row row--between" });
    header.append(
      el("h2", { text: "読み込めませんでした" }),
      el("button", {
        className: "icon-button",
        text: "×",
        attrs: { "aria-label": "閉じる" },
        onClick: () => close(),
      })
    );
    wrapper.append(header);
    const list = el("ul");
    for (const message of errors) {
      list.append(el("li", { text: message }));
    }
    wrapper.append(list);
    wrapper.append(
      el("button", { className: "btn btn--primary", text: "閉じる", onClick: () => close() })
    );
    return wrapper;
  });
}

/**
 * 復元の確認モーダル。件数を表示し、「置き換え」か「追加」かを選んでもらう。
 * 「置き換え」は既存データを全部消すため、特に強い警告文を出す。
 */
function openImportConfirmModal(payload) {
  openModal((close) => {
    const wrapper = el("div", { className: "stack" });
    const header = el("div", { className: "row row--between" });
    header.append(
      el("h2", { text: "バックアップの復元" }),
      el("button", {
        className: "icon-button",
        text: "×",
        attrs: { "aria-label": "閉じる" },
        onClick: () => close(),
      })
    );
    wrapper.append(header);

    const counts = payload.counts || {};
    wrapper.append(
      el("p", {
        text:
          `曲: ${counts.songs ?? "?"}件 / アーティスト: ${counts.artists ?? "?"}件 / ` +
          `グループ: ${counts.groups ?? "?"}件 / 画像: ${counts.images ?? "?"}件`,
      }),
      el("p", {
        text: payload.includesImages
          ? "このバックアップには画像が含まれています。"
          : "このバックアップには画像は含まれていません(復元後、ジャケット画像はデフォルト表示に戻ります)。",
      })
    );

    let mode = "merge";
    const modeField = el("div", { className: "stack" });
    modeField.append(el("p", { text: "復元方法を選んでください:" }));

    const mergeRow = buildRadioRow("importMode", "merge", true, "追加・上書き(既存データは残したまま、同じIDのものだけ上書き)");
    const replaceRow = buildRadioRow(
      "importMode",
      "replace",
      false,
      "完全に置き換え(今の曲・アーティスト・グループ・画像などを全部消してから復元)"
    );
    modeField.append(mergeRow.row, replaceRow.row);
    wrapper.append(modeField);

    const warning = el("p", { className: "field__error" });
    wrapper.append(warning);

    mergeRow.input.addEventListener("change", () => {
      mode = "merge";
      warning.textContent = "";
    });
    replaceRow.input.addEventListener("change", () => {
      mode = "replace";
      warning.textContent = "「完全に置き換え」を選ぶと、今のデータは元に戻せません。";
    });

    const actionRow = el("div", { className: "row" });
    const confirmBtn = el("button", {
      className: "btn btn--primary",
      text: "復元を実行する",
    });
    actionRow.append(confirmBtn);
    wrapper.append(actionRow);

    confirmBtn.addEventListener("click", async () => {
      if (mode === "replace") {
        const ok = window.confirm(
          "本当に今のデータを全て消して置き換えますか?この操作は元に戻せません。"
        );
        if (!ok) return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = "復元中...";
      try {
        await importBackupData(payload.data, mode);
        let fixedCount = 0;
        if (!payload.includesImages) {
          fixedCount = await cleanupOrphanedCoverImageIds();
        }
        close();
        showToast(
          fixedCount > 0
            ? `復元しました(ジャケット画像なしの曲を${fixedCount}件、デフォルト表示に修正しました)`
            : "復元しました"
        );
        // DBの中身が丸ごと変わったため、メモリキャッシュや各画面の状態を
        // 中途半端に更新するより、ページ全体を再読み込みしたほうが安全確実。
        window.setTimeout(() => window.location.reload(), 600);
      } catch (err) {
        console.error(err);
        confirmBtn.disabled = false;
        confirmBtn.textContent = "復元を実行する";
        showToast("復元に失敗しました: " + err.message);
      }
    });

    return wrapper;
  });
}

/** ラジオボタン1行を作る小さなヘルパー。 */
function buildRadioRow(name, value, checked, labelText) {
  const row = el("label", { className: "checkbox-row" });
  const input = el("input", { attrs: { type: "radio", name, value } });
  input.checked = checked;
  row.append(input, el("span", { text: labelText }));
  return { row, input };
}

/**
 * JSON文字列をファイルとしてダウンロードさせる。
 * iOS Safariでも動くよう、Blob + <a download> の組み合わせを使う。
 * (navigator.share が使える環境ではファイル共有シートも試すが、
 *  失敗しても静かにダウンロード方式にフォールバックする)
 */
async function downloadJsonFile(jsonText, filename) {
  const blob = new Blob([jsonText], { type: "application/json" });

  if (navigator.canShare && navigator.share) {
    try {
      const file = new File([blob], filename, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (err) {
      // ユーザーが共有をキャンセルした場合などもここに来るため、
      // 静かにダウンロード方式へフォールバックする。
      console.warn("[settings] navigator.shareに失敗、ダウンロード方式にフォールバックします", err);
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = el("a", { attrs: { href: url, download: filename } });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("ja-JP");
}

function formatDateForFilename(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

function buildStatusRow(label, value, isOk) {
  const row = el("div", { className: "status-panel__row" });
  row.append(
    el("span", { text: label }),
    el("span", { className: isOk ? "status-ok" : "status-ng", text: value })
  );
  return row;
}
