import { Copy, Link2, Send, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { loadManagedShares, saveManagedShares, type ManagedShare } from "./db";
import {
  createEncryptedShare,
  revokeEncryptedShare,
  type CreatedShare,
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
  onCopied
}: SharePanelProps) {
  const [expiryDays, setExpiryDays] = useState(30);
  const [phase, setPhase] = useState<SharePhase>();
  const [createdShare, setCreatedShare] = useState<CreatedShare>();
  const [managedShares, setManagedShares] = useState<ManagedShare[]>([]);
  const [revokingId, setRevokingId] = useState<string>();
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

  const progress = phase ? t(phaseKey(phase)) : undefined;

  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("shareTree")}>
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

      <p className="share-warning">
        <ShieldCheck aria-hidden="true" size={18} />
        <span>{t("shareWarning")}</span>
      </p>

      <label className="field share-expiry">
        {t("shareExpiry")}
        <select disabled={Boolean(phase)} onChange={(event) => setExpiryDays(Number(event.target.value))} value={expiryDays}>
          <option value={7}>{t("shareSevenDays")}</option>
          <option value={30}>{t("shareThirtyDays")}</option>
          <option value={90}>{t("shareNinetyDays")}</option>
        </select>
      </label>

      <button className="button primary full share-create" disabled={Boolean(phase)} onClick={createShare} type="button">
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
                <span><strong>{t("sharedSnapshot")}</strong><small>{t("shareExpires", { date: formatDate(share.expiresAt) })}</small></span>
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
            ))}
          </div>
        </section>
      ) : null}
    </SidePanel>
  );
}
