import { Copy, Download, FileImage, FileText, HardDrive, Link2, Send, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { loadManagedShares, saveManagedShares, type ManagedShare } from "./db";
import { exportHeritgArchive } from "./heritgArchive";
import { PasswordField, PasswordRequirementList } from "./PasswordField";
import { downloadBlob, downloadText, exportGedcom, safeFilename } from "./portability";
import { archivePasswordIsReady, archivePasswordRequirements } from "./SettingsDialog";
import type { ExportPrivacySelection } from "./exportPrivacy";
import {
  createEncryptedShare,
  DEFAULT_SHARE_DATA_SELECTION,
  revokeEncryptedShare,
  sharePasswordIsReady,
  sharePasswordRequirements,
  type CreatedShare,
  type ShareDataSelection,
  type SharePhase
} from "./encryptedSharing";
import type { Translator } from "./i18n";
import type { AppData, FamilyTree } from "./types";
import { ButtonLoader, SidePanel } from "./ui";

interface SharePanelProps {
  data: AppData;
  tree: FamilyTree;
  peopleCount: number;
  t: Translator;
  onClose: () => void;
  onError: (message: string) => void;
  onCopied: () => void;
  onExported: () => void;
  exportPng: (privacy: ExportPrivacySelection) => Promise<void>;
  exportSvg: (privacy: ExportPrivacySelection) => Promise<void>;
}

type ShareMethod = "link" | "heritg" | "gedcom" | "images";

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
  const [isSharing, setIsSharing] = useState(false);
  const [shareMethod, setShareMethod] = useState<ShareMethod>("link");
  const operationRef = useRef<AbortController | undefined>(undefined);
  const sharingRef = useRef(false);
  const treeShares = useMemo(
    () => managedShares.filter((share) => share.treeId === tree.id),
    [managedShares, tree.id]
  );

  useEffect(() => {
    let active = true;
    void loadManagedShares()
      .then((shares) => { if (active) setManagedShares(shares); })
      .catch((reason: unknown) => {
        if (active) onError(reason instanceof Error ? reason.message : t("managedSharesLoadFailed"));
      });
    return () => {
      active = false;
      operationRef.current?.abort();
    };
  }, [onError, t]);

  const formatDate = (value: string) => new Intl.DateTimeFormat(
    data.language === "id" ? "id-ID" : "en-US",
    { dateStyle: "medium" }
  ).format(new Date(value));

  const createShare = () => {
    if (operationRef.current) return;
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
    if (!createdShare || typeof navigator.share !== "function" || sharingRef.current) return;
    sharingRef.current = true;
    setIsSharing(true);
    void navigator.share({ title: tree.title, url: createdShare.url })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        onError(t("shareCopyFailed"));
      })
      .finally(() => {
        sharingRef.current = false;
        setIsSharing(false);
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
  const passwordReady = sharePasswordIsReady(sharePassword, sharePasswordConfirmation);
  const shareRequirements = sharePasswordRequirements(sharePassword);
  const passwordMismatchError = sharePasswordConfirmation.length > 0 && sharePassword !== sharePasswordConfirmation
    ? t("sharePasswordsMismatch")
    : undefined;
  const archivePasswordMismatchError = archivePasswordConfirmation.length > 0 && archivePassword !== archivePasswordConfirmation
    ? t("archivePasswordsMismatch")
    : undefined;
  const archivePasswordReady = archivePasswordIsReady(archivePassword, archivePasswordConfirmation);
  const archiveRequirements = archivePasswordRequirements(archivePassword);
  const privacyDetails = (
    keys: readonly (keyof ShareDataSelection)[],
    help: string
  ) => (
    <details className="share-privacy">
      <summary>
        <span>{t("shareIncludedTitle")}</span>
        <small>{t("sharePrivacySummary")}</small>
      </summary>
      <fieldset className="share-included" disabled={Boolean(phase) || !peopleCount}>
        <legend className="sr-only">{t("shareIncludedTitle")}</legend>
        <p>{help}</p>
        <div className="share-included-options">
          {([
            ["birthDates", t("shareIncludesBirthDates")],
            ["relationshipDates", t("shareIncludesRelationshipDates")],
            ["photos", t("shareIncludesPhotos")],
            ["ages", t("shareIncludesAges")]
          ] as const).filter(([key]) => keys.includes(key)).map(([key, label]) => (
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
    </details>
  );

  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("shareAndExport")}>
      <div className="share-panel">
        <div className="share-scope">
          <UsersRound aria-hidden="true" size={19} />
          <span><strong>{tree.title}</strong><small>{t("shareScopeDetail", { count: peopleCount })}</small></span>
        </div>

        <h3 className="share-methods-title" id="share-methods-title">{t("shareMethodsTitle")}</h3>
        <div aria-labelledby="share-methods-title" className="share-method-picker" role="group">
          {([
            ["link", Link2, t("shareReadOnlyCopy"), t("shareMethodLinkDetail")],
            ["heritg", HardDrive, t("shareMethodHeritgTitle"), t("shareMethodHeritgDetail")],
            ["gedcom", FileText, t("shareMethodGedcomTitle"), t("shareMethodGedcomDetail")],
            ["images", FileImage, t("exportChart"), t("shareMethodImagesDetail")]
          ] as const).map(([method, Icon, title, detail]) => (
            <button
              aria-controls="share-method-details"
              aria-pressed={shareMethod === method}
              className={`share-method-choice ${shareMethod === method ? "selected" : ""}`}
              disabled={Boolean(phase)}
              key={method}
              onClick={() => setShareMethod(method)}
              type="button"
            >
              <span className="share-method-icon"><Icon aria-hidden="true" size={20} /></span>
              <span><strong>{title}</strong><small>{detail}</small></span>
            </button>
          ))}
        </div>

        <section className="settings-card share-method-content" id="share-method-details">
          {shareMethod === "link" ? (
            <>
              <div className="settings-card-header">
                <Link2 aria-hidden="true" size={23} />
                <div><h3>{t("shareReadOnlyCopy")}</h3><p className="settings-detail">{t("shareLinkMethodDetail")}</p></div>
              </div>
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
                          <button aria-label={t("copyShareLink")} className="icon-button quiet small" onClick={() => copyManagedLink(share)} type="button"><Copy aria-hidden="true" size={16} /></button>
                          <button aria-label={`${t("revokeShare")}: ${formatDate(share.expiresAt)}`} className="icon-button quiet small danger-text" disabled={revokingId === share.shareId} onClick={() => revoke(share)} type="button">
                            {revokingId === share.shareId ? <ButtonLoader /> : <Trash2 aria-hidden="true" size={16} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <div className="share-format">
                <h4>{t("createNewShareLink")}</h4>
                {privacyDetails(["birthDates", "relationshipDates", "photos", "ages"], t("shareIncludedHelp"))}
                <p className="share-warning"><ShieldCheck aria-hidden="true" size={18} /><span>{t("shareWarning")}</span></p>
                <PasswordField autoComplete="new-password" disabled={Boolean(phase) || !peopleCount} hideLabel={t("hidePassword")} id="share-password" label={t("sharePassword")} onChange={setSharePassword} showLabel={t("showPassword")} value={sharePassword} />
                <PasswordRequirementList highlightUnmet={sharePassword.length > 0} items={[["minimumLength", t("archivePasswordMinimumLength")], ["lowercase", t("archivePasswordLowercase")], ["uppercase", t("archivePasswordUppercase")], ["number", t("archivePasswordNumber")], ["special", t("archivePasswordSpecial")]]} label={t("archivePasswordChecklist")} requirements={shareRequirements} />
                <PasswordField autoComplete="new-password" disabled={Boolean(phase) || !peopleCount} error={passwordMismatchError} hideLabel={t("hidePassword")} id="share-password-confirmation" label={t("confirmSharePassword")} onChange={setSharePasswordConfirmation} showLabel={t("showPassword")} value={sharePasswordConfirmation} />
                <label className="field share-expiry">{t("shareExpiry")}<select disabled={Boolean(phase) || !peopleCount} onChange={(event) => setExpiryDays(Number(event.target.value))} value={expiryDays}><option value={7}>{t("shareSevenDays")}</option><option value={30}>{t("shareThirtyDays")}</option><option value={90}>{t("shareNinetyDays")}</option></select></label>
                {!peopleCount ? <p className="share-unavailable">{t("shareNeedsPerson")}</p> : null}
                <button aria-busy={Boolean(phase) || undefined} className="button primary full" disabled={Boolean(phase) || !peopleCount || !passwordReady} onClick={createShare} type="button">{phase ? <ButtonLoader size={17} /> : <Link2 aria-hidden="true" size={17} />} {progress ?? t("createShareLink")}</button>
                {progress ? <p className="share-progress" role="status">{progress}</p> : null}
                {createdShare ? (
                  <section className="share-result" aria-labelledby="share-ready-title"><strong id="share-ready-title">{t("shareReady")}</strong><p>{t("shareExpires", { date: formatDate(createdShare.expiresAt) })}</p><input aria-label={t("shareLink")} readOnly value={createdShare.url} /><div className="share-result-actions"><button className="button primary" onClick={copyLink} type="button"><Copy aria-hidden="true" size={16} /> {t("copyShareLink")}</button>{typeof navigator.share === "function" ? <button aria-busy={isSharing || undefined} className="button secondary" disabled={isSharing} onClick={shareLink} type="button">{isSharing ? <ButtonLoader /> : <Send aria-hidden="true" size={16} />} {t("shareLink")}</button> : null}</div><small>{t("shareLinkNotSaved")}</small></section>
                ) : null}
              </div>
            </>
          ) : shareMethod === "heritg" ? (
            <>
              <div className="settings-card-header"><HardDrive aria-hidden="true" size={23} /><div><span className="share-format-badge recommended">{t("recommended")}</span><h3>{t("heritgFileTitle")}</h3><p className="settings-detail">{t("heritgFileDetail")}</p></div></div>
              <PasswordField autoComplete="new-password" help={t("archivePasswordHelp")} hideLabel={t("hidePassword")} id="archive-password" label={t("archivePasswordOptional")} maxLength={1024} onChange={(value) => { setArchivePassword(value); if (!value) setArchivePasswordConfirmation(""); }} showLabel={t("showPassword")} value={archivePassword} />
              {archivePassword ? <><PasswordRequirementList highlightUnmet items={[["minimumLength", t("archivePasswordMinimumLength")], ["lowercase", t("archivePasswordLowercase")], ["uppercase", t("archivePasswordUppercase")], ["number", t("archivePasswordNumber")], ["special", t("archivePasswordSpecial")]]} label={t("archivePasswordChecklist")} requirements={archiveRequirements} /><PasswordField autoComplete="new-password" error={archivePasswordMismatchError} hideLabel={t("hidePassword")} id="archive-password-confirmation" label={t("confirmArchivePassword")} maxLength={1024} onChange={setArchivePasswordConfirmation} showLabel={t("showPassword")} value={archivePasswordConfirmation} /></> : null}
              <button className="button secondary full" disabled={!archivePasswordReady} onClick={() => performExport(async () => { const archive = await exportHeritgArchive(data, tree.id, archivePassword); downloadBlob(new Blob([archive.slice().buffer as ArrayBuffer], { type: "application/vnd.heritg.family-archive" }), safeFilename(tree.title, "heritg")); setArchivePassword(""); setArchivePasswordConfirmation(""); })} type="button"><Download aria-hidden="true" size={16} /> {t("downloadEncryptedBackup")}</button>
            </>
          ) : shareMethod === "gedcom" ? (
            <>
              <div className="settings-card-header"><FileText aria-hidden="true" size={23} /><div><span className="share-format-badge">{t("forOtherApps")}</span><h3>{t("gedcomFileTitle")}</h3><p className="settings-detail">{t("gedcomFileDetail")}</p></div></div>
              {privacyDetails(["birthDates", "relationshipDates"], t("gedcomIncludedHelp"))}
              <button className="button secondary full" onClick={() => performExport(() => downloadText(exportGedcom(data, tree.id, shareSelection), safeFilename(tree.title, "ged"), "application/x-gedcom;charset=utf-8"))} type="button"><Download aria-hidden="true" size={16} /> {t("downloadGedcom")}</button>
            </>
          ) : (
            <>
              <div className="settings-card-header"><FileImage aria-hidden="true" size={23} /><div><h3>{t("exportChart")}</h3><p className="settings-detail">{t("chartDetail")}</p></div></div>
              {privacyDetails(["birthDates", "relationshipDates", "photos", "ages"], t("imageIncludedHelp"))}
              <div className="settings-actions"><button className="button secondary" disabled={!peopleCount} onClick={() => performExport(() => exportPng(shareSelection))} type="button"><Download aria-hidden="true" size={16} /> {t("exportPng")}</button><button className="button secondary" disabled={!peopleCount} onClick={() => performExport(() => exportSvg(shareSelection))} type="button"><Download aria-hidden="true" size={16} /> {t("exportSvg")}</button></div>
            </>
          )}
        </section>
      </div>
    </SidePanel>
  );
}
