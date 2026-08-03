import { Copy, Download, FileImage, Globe2, HardDrive, Link2, Send, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

import { createEncryptedShare, revokeEncryptedShare, type CreatedShare, type SharePhase } from "./encryptedSharing";
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

export const archivePasswordMeetsRequirements = (password: string) => {
  if (password.length === 0) return true;
  const normalized = password.normalize("NFC");
  return [...normalized].length >= 8 &&
    /\p{Lu}/u.test(normalized) &&
    /\p{Ll}/u.test(normalized) &&
    /\p{Nd}/u.test(normalized);
};

export const archivePasswordIsReady = (password: string, confirmation: string) =>
  password === confirmation && archivePasswordMeetsRequirements(password);

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
  const [shareExpiryDays, setShareExpiryDays] = useState(30);
  const [sharePhase, setSharePhase] = useState<SharePhase>();
  const [createdShare, setCreatedShare] = useState<CreatedShare>();
  const [shareRevoked, setShareRevoked] = useState(false);
  const passwordIsReady = archivePasswordIsReady(archivePassword, archivePasswordConfirmation);
  const passwordDoesNotMeetRequirements = !archivePasswordMeetsRequirements(archivePassword);
  const passwordsDoNotMatch = archivePasswordConfirmation.length > 0 &&
    archivePassword !== archivePasswordConfirmation;
  const archivePasswordError = passwordsDoNotMatch
    ? t("archivePasswordsMismatch")
    : passwordDoesNotMeetRequirements
      ? t("archivePasswordRequirements")
      : undefined;
  const perform = (operation: () => void | Promise<void>) => {
    void Promise.resolve()
      .then(operation)
      .then(onExported)
      .catch((reason: unknown) =>
        onError(reason instanceof Error ? reason.message : t("errorTitle"))
      );
  };
  const shareProgress = sharePhase ? t(`sharePhase${sharePhase[0].toUpperCase()}${sharePhase.slice(1)}` as
    "sharePhaseExporting" | "sharePhaseAllocating" | "sharePhaseEncrypting" | "sharePhaseUploading" | "sharePhaseActivating") : undefined;
  const createShare = () => {
    setShareRevoked(false);
    setCreatedShare(undefined);
    void createEncryptedShare(data, tree.id, {
      expiryDays: shareExpiryDays,
      onProgress: setSharePhase
    }).then((result) => {
      setCreatedShare(result);
      setSharePhase(undefined);
    }).catch((reason: unknown) => {
      setSharePhase(undefined);
      onError(reason instanceof Error ? reason.message : t("errorTitle"));
    });
  };
  const copyShare = () => {
    if (!createdShare) return;
    void navigator.clipboard.writeText(createdShare.url)
      .then(() => onExported())
      .catch(() => onError(t("shareCopyFailed")));
  };
  const revokeShare = () => {
    if (!createdShare) return;
    setSharePhase("activating");
    void revokeEncryptedShare(createdShare.shareId, createdShare.deletionToken)
      .then(() => {
        setSharePhase(undefined);
        setShareRevoked(true);
        setCreatedShare(undefined);
      })
      .catch((reason: unknown) => {
        setSharePhase(undefined);
        onError(reason instanceof Error ? reason.message : t("errorTitle"));
      });
  };

  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("settings")}>
      <div className="settings-intro">
        <h3>{t("privateSimple")}</h3>
        <p>{t("privateDescription")}</p>
      </div>

      <div className="settings-group">
        <h3>{t("encryptedSharing")}</h3>
        <section className="settings-card sharing-card">
          <div className="settings-card-header">
            <Link2 aria-hidden="true" size={23} />
            <div>
              <strong>{t("shareReadOnlyCopy")}</strong>
              <p className="settings-detail">{t("shareDetail")}</p>
            </div>
          </div>
          <p className="share-warning"><ShieldCheck aria-hidden="true" size={17} /> <span>{t("shareWarning")}</span></p>
          <label className="field share-expiry">
            {t("shareExpiry")}
            <select disabled={Boolean(sharePhase)} onChange={(event) => setShareExpiryDays(Number(event.target.value))} value={shareExpiryDays}>
              <option value={7}>{t("shareSevenDays")}</option>
              <option value={30}>{t("shareThirtyDays")}</option>
              <option value={90}>{t("shareNinetyDays")}</option>
            </select>
          </label>
          {createdShare ? (
            <div className="share-result" role="status">
              <strong>{t("shareReady")}</strong>
              <p className="settings-detail">{t("shareExpires", {
                date: new Intl.DateTimeFormat(data.language === "id" ? "id-ID" : "en-US", { dateStyle: "medium" })
                  .format(new Date(createdShare.expiresAt))
              })}</p>
              <label className="sr-only" htmlFor="encrypted-share-url">{t("shareLink")}</label>
              <input id="encrypted-share-url" readOnly value={createdShare.url} />
              <div className="settings-actions">
                <button className="button primary" onClick={copyShare} type="button"><Copy aria-hidden="true" size={16} /> {t("copyShareLink")}</button>
                {typeof navigator.share === "function" ? (
                  <button className="button secondary" onClick={() => void navigator.share({ title: tree.title, url: createdShare.url })} type="button">
                    <Send aria-hidden="true" size={16} /> {t("shareLink")}
                  </button>
                ) : null}
                <button className="button ghost danger-text" onClick={revokeShare} type="button"><Trash2 aria-hidden="true" size={16} /> {t("revokeShare")}</button>
              </div>
              <p className="settings-detail">{t("shareRevocationNotice")}</p>
            </div>
          ) : (
            <button className="button primary full" disabled={Boolean(sharePhase)} onClick={createShare} type="button">
              <Link2 aria-hidden="true" size={17} /> {shareProgress ?? t("createShareLink")}
            </button>
          )}
          {sharePhase ? <p className="share-progress" role="status">{shareProgress}</p> : null}
          {shareRevoked ? <p className="share-revoked" role="status">{t("shareRevoked")}</p> : null}
        </section>
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
          <p className="settings-detail"><strong>{t("everyBackupEncrypted")}</strong></p>
          <label className="field">
            {t("archivePasswordOptional")}
            <input
              aria-describedby={archivePasswordError ? "archive-password-help archive-password-error" : "archive-password-help"}
              aria-invalid={Boolean(archivePasswordError)}
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
              aria-describedby={archivePasswordError ? "archive-password-help archive-password-error" : "archive-password-help"}
              aria-invalid={Boolean(archivePasswordError)}
              autoComplete="new-password"
              maxLength={1024}
              onChange={(event) => setArchivePasswordConfirmation(event.target.value)}
              type="password"
              value={archivePasswordConfirmation}
            />
          </label>
          <p className="settings-detail" id="archive-password-help">{t("archivePasswordHelp")}</p>
          {archivePasswordError ? <p className="danger-text" id="archive-password-error" role="alert">{archivePasswordError}</p> : null}
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
