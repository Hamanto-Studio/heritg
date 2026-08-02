import { Download, FileImage, Globe2, HardDrive, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { exportHeritgArchive } from "./heritgArchive";
import { downloadBlob, downloadText, exportGedcom, safeFilename } from "./portability";
import type { Translator } from "./i18n";
import type { AppActions } from "./store";
import type { AppData, FamilyTree } from "./types";
import { SidePanel } from "./ui";

interface SettingsDialogProps {
  data: AppData;
  tree: FamilyTree;
  actions: AppActions;
  t: Translator;
  onClose: () => void;
  onError: (message: string) => void;
  onExported: () => void;
  exportPng: () => Promise<void>;
  exportSvg: () => Promise<void>;
}

export function SettingsDialog({
  data,
  tree,
  actions,
  t,
  onClose,
  onError,
  onExported,
  exportPng,
  exportSvg
}: SettingsDialogProps) {
  const [archivePassword, setArchivePassword] = useState("");
  const [archivePasswordConfirmation, setArchivePasswordConfirmation] = useState("");
  const passwordIsReady = [...archivePassword.normalize("NFC")].length >= 15 &&
    archivePassword === archivePasswordConfirmation;
  const perform = (operation: () => void | Promise<void>) => {
    void Promise.resolve()
      .then(operation)
      .then(onExported)
      .catch((reason: unknown) =>
        onError(reason instanceof Error ? reason.message : t("errorTitle"))
      );
  };

  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("settings")}>
      <div className="settings-intro">
        <h3>{t("privateSimple")}</h3>
        <p>{t("privateDescription")}</p>
      </div>

      <div className="settings-group">
        <h3>{t("backupExport")}</h3>
        <section className="settings-card">
          <div className="settings-card-header">
            <HardDrive aria-hidden="true" size={23} />
            <div>
              <strong>{t("backupExport")}</strong>
              <p className="settings-detail">{t("backupDetail")}</p>
            </div>
          </div>
          <label className="field">
            {t("archivePassword")}
            <input
              autoComplete="new-password"
              maxLength={1024}
              onChange={(event) => setArchivePassword(event.target.value)}
              type="password"
              value={archivePassword}
            />
          </label>
          <label className="field">
            {t("confirmArchivePassword")}
            <input
              autoComplete="new-password"
              maxLength={1024}
              onChange={(event) => setArchivePasswordConfirmation(event.target.value)}
              type="password"
              value={archivePasswordConfirmation}
            />
          </label>
          <p className="settings-detail">{t("archivePasswordHelp")}</p>
          <div className="settings-actions">
            <button className="button secondary" disabled={!passwordIsReady} onClick={() => perform(async () => {
              const archive = await exportHeritgArchive(data, tree.id, archivePassword);
              downloadBlob(
                new Blob([archive.slice().buffer as ArrayBuffer], { type: "application/vnd.heritg.family-archive" }),
                safeFilename(tree.title, "heritg")
              );
              setArchivePassword("");
              setArchivePasswordConfirmation("");
            })} type="button">
              <Download aria-hidden="true" size={16} /> {t("downloadEncryptedBackup")}
            </button>
            <button className="button secondary" onClick={() => perform(() => {
              downloadText(
                exportGedcom(data, tree.id),
                safeFilename(tree.title, "ged"),
                "text/plain;charset=utf-8"
              );
            })} type="button">
              <Download aria-hidden="true" size={16} /> {t("downloadGedcom")}
            </button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-header">
            <FileImage aria-hidden="true" size={23} />
            <div>
              <strong>{t("exportChart")}</strong>
              <p className="settings-detail">{t("chartDetail")}</p>
            </div>
          </div>
          <div className="settings-actions">
            <button className="button secondary" onClick={() => perform(exportPng)} type="button">
              <Download aria-hidden="true" size={16} /> {t("exportPng")}
            </button>
            <button className="button secondary" onClick={() => perform(exportSvg)} type="button">
              <Download aria-hidden="true" size={16} /> {t("exportSvg")}
            </button>
          </div>
        </section>
      </div>

      <div className="settings-group">
        <h3>{t("language")}</h3>
        <section className="settings-card">
          <div className="settings-card-header">
            <Globe2 aria-hidden="true" size={23} />
            <div>
              <strong>{t("language")}</strong>
              <p className="settings-detail">{t("languageDetail")}</p>
            </div>
          </div>
          <div className="language-options">
            <button
              aria-pressed={data.language === "en"}
              className={data.language === "en" ? "selected" : ""}
              onClick={() => actions.setLanguage("en")}
              type="button"
            >
              {t("english")}
            </button>
            <button
              aria-pressed={data.language === "id"}
              className={data.language === "id" ? "selected" : ""}
              onClick={() => actions.setLanguage("id")}
              type="button"
            >
              {t("indonesian")}
            </button>
          </div>
        </section>
      </div>

      <div className="privacy-note">
        <ShieldCheck aria-hidden="true" size={17} />
        <span><strong>{t("offlineReady")}</strong><br />{t("savedAutomatically")}</span>
      </div>
    </SidePanel>
  );
}
