import { Copy, Download, FileImage, HardDrive, Link2, Send, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { loadManagedShares, saveManagedShares, type ManagedShare } from "./db";
import { exportHeritgArchive } from "./heritgArchive";
import { PasswordField } from "./PasswordField";
import { downloadBlob, downloadText, exportGedcom, safeFilename } from "./portability";
import { archivePasswordIsReady, archivePasswordMeetsRequirements } from "./SettingsDialog";
import {
  createEncryptedShare,
  DEFAULT_SHARE_DATA_SELECTION,
  revokeEncryptedShare,
  sharePasswordIsReady,
  sharePasswordMeetsRequirements,
  SHARE_PASSWORD_MIN_LENGTH,
  type CreatedShare,
  type ShareDataSelection,
  type SharePhase
} from "./encryptedSharing";
import type { Translator } from "./i18n";
import type { AppData, FamilyTree } from "./types";
import { SidePanel } from "./ui";

interface SharePanelProps {
  data: AppData;
  tree: FamilyTree;
  peopleCount: number;
  t: Translator;
  onClose: () => void;
  onError: (message: string) => void;
  onCopied: () => void;
  onExported: () => void;
  exportPng: () => Promise<void>;
  exportSvg: () => Promise<void>;
}

const phaseKey = (phase: SharePhase) => `sharePhase${phase[0].toUpperCase()}${phase.slice(1)}` as
  "sharePhaseExporting" | "sharePhaseAllocating" | "sharePhaseEncrypting" | "sharePhaseUploading" | "sharePhaseActivating";

export function SharePanel({
  data,
  tree,
  peopleCount,
  t,
  onClose,
  onError,
  onCopied,
  onExported,
  exportPng,
  exportSvg
}: SharePanelProps) {
  const [expiryDays, setExpiryDays] = useState(30);
  const [sharePassword, setSharePassword] = useState("");
  const [sharePasswordConfirmation, setSharePasswordConfirmation] = useState("");
  const [shareSelection, setShareSelection] = useState<ShareDataSelection>({
    ...DEFAULT_SHARE_DATA_SELECTION
  });
  const [phase, setPhase] = useState<SharePhase>();
  const [createdShare, setCreatedShare] = useState<CreatedShare>();
  const [managedShares, setManagedShares] = useState<ManagedShare[]>([]);
  const [revokingId, setRevokingId] = useState<string>();
  const [archivePassword, setArchivePassword] = useState("");
  const [archivePasswordConfirmation, setArchivePasswordConfirmation] = useState("");
  const operationRef = useRef<AbortController | undefined>(undefined);
  const treeShares = useMemo(
    () => managedShares.filter((share) => share.treeId === tree.id),
    [managedShares, tree.id]
  );

  useEffect(() => {
    let active = true;
    void loadManagedShares()
      .then((shares) => { if (active) setManagedShares(shares); })
      .catch((reason: unknown) => {
        if (active) onError(reason instanceof Error ? reason.message : "Share management could not be opened.");
      });
    return () => {
      active = false;
      operationRef.current?.abort();
    };
  }, [onError]);

  const formatDate = (value: string) => new Intl.DateTimeFormat(
    data.language === "id" ? "id-ID" : "en-US",
    { dateStyle: "medium" }
  ).format(new Date(value));

  const createShare = () => {
    operationRef.current?.abort();
    const controller = new AbortController();
    operationRef.current = controller;
    setCreatedShare(undefined);
    void createEncryptedShare(data, tree.id, {
      expiryDays,
      password: sharePassword,
      selection: shareSelection,
      onProgress: setPhase,
      signal: controller.signal
    }).then(async (result) => {
      const record: ManagedShare = {
        shareId: result.shareId,
        deletionToken: result.deletionToken,
        treeId: tree.id,
        treeTitle: tree.title,
        createdAt: new Date().toISOString(),
        expiresAt: result.expiresAt
      };
      const next = [record, ...managedShares.filter((item) => item.shareId !== record.shareId)];
      await saveManagedShares(next);
      setManagedShares(next);
      setCreatedShare(result);
      setSharePassword("");
      setSharePasswordConfirmation("");
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      onError(reason instanceof Error ? reason.message : t("errorTitle"));
    }).finally(() => {
      if (operationRef.current === controller) operationRef.current = undefined;
      setPhase(undefined);
    });
  };

  const copyLink = () => {
    if (!createdShare) return;
    void navigator.clipboard.writeText(createdShare.url)
      .then(onCopied)
      .catch(() => onError(t("shareCopyFailed")));
  };

  const shareLink = () => {
    if (!createdShare || typeof navigator.share !== "function") return;
    void navigator.share({ title: tree.title, url: createdShare.url }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      onError(t("shareCopyFailed"));
    });
  };

  const revoke = (share: ManagedShare) => {
    setRevokingId(share.shareId);
    void revokeEncryptedShare(share.shareId, share.deletionToken)
      .then(async () => {
        const next = managedShares.filter((item) => item.shareId !== share.shareId);
        await saveManagedShares(next);
        setManagedShares(next);
        if (createdShare?.shareId === share.shareId) setCreatedShare(undefined);
      })
      .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : t("errorTitle")))
      .finally(() => setRevokingId(undefined));
  };

  const copyManagedLink = (share: ManagedShare) => {
    const url = new URL(`/s/${encodeURIComponent(share.shareId)}`, window.location.origin).toString();
    void navigator.clipboard.writeText(url).then(onCopied).catch(() => onError(t("shareCopyFailed")));
  };

  const performExport = (operation: () => void | Promise<void>) => {
    void Promise.resolve().then(operation).then(onExported).catch((reason: unknown) =>
      onError(reason instanceof Error ? reason.message : t("errorTitle"))
    );
  };

  const progress = phase ? t(phaseKey(phase)) : undefined;
  const passwordRequirementsMet = sharePasswordMeetsRequirements(sharePassword);
  const passwordReady = sharePasswordIsReady(sharePassword, sharePasswordConfirmation);
  const passwordRequirementError = sharePassword.length > 0 && !passwordRequirementsMet
    ? t("sharePasswordRequirements", { count: SHARE_PASSWORD_MIN_LENGTH })
    : undefined;
  const passwordMismatchError = sharePasswordConfirmation.length > 0 && sharePassword !== sharePasswordConfirmation
    ? t("sharePasswordsMismatch")
    : undefined;
  const archivePasswordRequirementError = archivePassword.length > 0 && !archivePasswordMeetsRequirements(archivePassword)
    ? t("archivePasswordRequirements")
    : undefined;
  const archivePasswordMismatchError = archivePasswordConfirmation.length > 0 && archivePassword !== archivePasswordConfirmation
    ? t("archivePasswordsMismatch")
    : undefined;
  const archivePasswordReady = archivePasswordIsReady(archivePassword, archivePasswordConfirmation);

  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("shareAndExport")}>
      <div className="share-panel-intro">
        <span className="share-panel-icon"><Link2 aria-hidden="true" size={23} /></span>
        <div>
          <h3>{t("shareReadOnlyCopy")}</h3>
          <p>{t("shareDetail")}</p>
        </div>
      </div>

      <div className="share-scope">
        <UsersRound aria-hidden="true" size={19} />
        <span><strong>{tree.title}</strong><small>{t("shareScopeDetail", { count: peopleCount })}</small></span>
      </div>

      <fieldset className="share-included" disabled={Boolean(phase) || !peopleCount}>
        <legend>{t("shareIncludedTitle")}</legend>
        <p>{t("shareIncludedHelp")}</p>
        <div className="share-included-options">
          {([
            ["birthDates", t("shareIncludesBirthDates")],
            ["relationshipDates", t("shareIncludesRelationshipDates")],
            ["photos", t("shareIncludesPhotos")],
            ["ages", t("shareIncludesAges")]
          ] as const).map(([key, label]) => (
            <label key={key}>
              <input
                checked={shareSelection[key]}
                onChange={(event) => setShareSelection((current) => ({
                  ...current,
                  [key]: event.target.checked
                }))}
                type="checkbox"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="share-warning">
        <ShieldCheck aria-hidden="true" size={18} />
        <span>{t("shareWarning")}</span>
      </p>

      <PasswordField
        autoComplete="new-password"
        disabled={Boolean(phase) || !peopleCount}
        error={passwordRequirementError}
        help={t("sharePasswordHelp", { count: SHARE_PASSWORD_MIN_LENGTH })}
        hideLabel={t("hidePassword")}
        id="share-password"
        label={t("sharePassword")}
        onChange={setSharePassword}
        showLabel={t("showPassword")}
        value={sharePassword}
      />
      <PasswordField
        autoComplete="new-password"
        disabled={Boolean(phase) || !peopleCount}
        error={passwordMismatchError}
        hideLabel={t("hidePassword")}
        id="share-password-confirmation"
        label={t("confirmSharePassword")}
        onChange={setSharePasswordConfirmation}
        showLabel={t("showPassword")}
        value={sharePasswordConfirmation}
      />

      <label className="field share-expiry">
        {t("shareExpiry")}
        <select disabled={Boolean(phase) || !peopleCount} onChange={(event) => setExpiryDays(Number(event.target.value))} value={expiryDays}>
          <option value={7}>{t("shareSevenDays")}</option>
          <option value={30}>{t("shareThirtyDays")}</option>
          <option value={90}>{t("shareNinetyDays")}</option>
        </select>
      </label>

      {!peopleCount ? <p className="share-unavailable">{t("shareNeedsPerson")}</p> : null}
      <button className="button primary full share-create" disabled={Boolean(phase) || !peopleCount || !passwordReady} onClick={createShare} type="button">
        <Link2 aria-hidden="true" size={17} /> {progress ?? t("createShareLink")}
      </button>
      {progress ? <p className="share-progress" role="status">{progress}</p> : null}

      {createdShare ? (
        <section className="share-result" aria-labelledby="share-ready-title">
          <strong id="share-ready-title">{t("shareReady")}</strong>
          <p>{t("shareExpires", { date: formatDate(createdShare.expiresAt) })}</p>
          <input aria-label={t("shareLink")} readOnly value={createdShare.url} />
          <div className="share-result-actions">
            <button className="button primary" onClick={copyLink} type="button"><Copy aria-hidden="true" size={16} /> {t("copyShareLink")}</button>
            {typeof navigator.share === "function" ? (
              <button className="button secondary" onClick={shareLink} type="button"><Send aria-hidden="true" size={16} /> {t("shareLink")}</button>
            ) : null}
          </div>
          <small>{t("shareLinkNotSaved")}</small>
        </section>
      ) : null}

      {treeShares.length ? (
        <section className="managed-shares" aria-labelledby="managed-shares-title">
          <div className="managed-shares-heading">
            <h3 id="managed-shares-title">{t("activeShareLinks")}</h3>
            <span>{treeShares.length}</span>
          </div>
          <p>{t("managedSharesDetail")}</p>
          <div className="managed-share-list">
            {treeShares.map((share) => (
              <div className="managed-share-row" key={share.shareId}>
                <span><strong>{share.treeTitle || t("sharedSnapshot")}</strong><small>{t("shareExpires", { date: formatDate(share.expiresAt) })}</small></span>
                <input aria-label={t("shareLink")} readOnly value={new URL(`/s/${encodeURIComponent(share.shareId)}`, window.location.origin).toString()} />
                <div className="managed-share-actions">
                  <button aria-label={t("copyShareLink")} className="icon-button quiet small" onClick={() => copyManagedLink(share)} type="button">
                    <Copy aria-hidden="true" size={16} />
                  </button>
                  <button
                    aria-label={`${t("revokeShare")}: ${formatDate(share.expiresAt)}`}
                    className="icon-button quiet small danger-text"
                    disabled={revokingId === share.shareId}
                    onClick={() => revoke(share)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="share-export-section" aria-labelledby="backup-export-title">
        <div className="settings-card-header">
          <HardDrive aria-hidden="true" size={23} />
          <div>
            <h3 id="backup-export-title">{t("backupExport")}</h3>
            <p className="settings-detail">{t("backupDetail")}</p>
          </div>
        </div>
        <PasswordField
          autoComplete="new-password"
          error={archivePasswordRequirementError}
          help={t("archivePasswordHelp")}
          hideLabel={t("hidePassword")}
          id="archive-password"
          label={t("archivePasswordOptional")}
          maxLength={1024}
          onChange={setArchivePassword}
          showLabel={t("showPassword")}
          value={archivePassword}
        />
        <PasswordField
          autoComplete="new-password"
          error={archivePasswordMismatchError}
          hideLabel={t("hidePassword")}
          id="archive-password-confirmation"
          label={t("confirmArchivePassword")}
          maxLength={1024}
          onChange={setArchivePasswordConfirmation}
          showLabel={t("showPassword")}
          value={archivePasswordConfirmation}
        />
        <div className="settings-actions">
          <button className="button secondary" disabled={!archivePasswordReady} onClick={() => performExport(async () => {
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
          <button className="button secondary" onClick={() => performExport(() => {
            downloadText(exportGedcom(data, tree.id), safeFilename(tree.title, "ged"), "text/plain;charset=utf-8");
          })} type="button">
            <Download aria-hidden="true" size={16} /> {t("downloadGedcom")}
          </button>
        </div>
      </section>

      <section className="share-export-section" aria-labelledby="chart-export-title">
        <div className="settings-card-header">
          <FileImage aria-hidden="true" size={23} />
          <div>
            <h3 id="chart-export-title">{t("exportChart")}</h3>
            <p className="settings-detail">{t("chartDetail")}</p>
          </div>
        </div>
        <div className="settings-actions">
          <button className="button secondary" disabled={!peopleCount} onClick={() => performExport(exportPng)} type="button">
            <Download aria-hidden="true" size={16} /> {t("exportPng")}
          </button>
          <button className="button secondary" disabled={!peopleCount} onClick={() => performExport(exportSvg)} type="button">
            <Download aria-hidden="true" size={16} /> {t("exportSvg")}
          </button>
        </div>
      </section>
    </SidePanel>
  );
}
