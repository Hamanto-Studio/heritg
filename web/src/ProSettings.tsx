import { Cloud, CloudOff, Crown, RefreshCw } from "lucide-react";
import type { Translator } from "./i18n";
import type { ProContextValue, SyncPhase } from "./proTypes";
import { ButtonLoader, ErrorNotice } from "./ui";

const syncStatusKey = (phase: SyncPhase) => {
  switch (phase) {
    case "disabled": return "syncDisabled" as const;
    case "comparing": return "syncComparing" as const;
    case "upToDate": return "syncUpToDate" as const;
    case "pending": return "syncPending" as const;
    case "syncing": return "syncing" as const;
    case "offline": return "syncOffline" as const;
    case "conflict": return "syncConflict" as const;
    case "authenticationRequired": return "signInRequired" as const;
    case "subscriptionRequired": return "proRequired" as const;
    case "encryptionKeyRequired": return "syncKeyRequired" as const;
    case "error": return "syncError" as const;
    default: return "syncUnavailable" as const;
  }
};

export function ProSettings({ pro, t, onOpenPaywall }: { pro: ProContextValue; t: Translator; onOpenPaywall: () => void }) {
  const active = pro.subscription.status === "active" ? pro.subscription : undefined;

  return <>
    <div className="settings-group">
      <h3>{t("subscription")}</h3>
      <section className={`settings-card pro-settings-card ${active ? "active" : ""}`}>
        <div className="settings-card-header"><Crown aria-hidden="true" size={23} /><div>
          <div className="settings-title-line"><strong>{t("heritgPro")}</strong><span className={`pro-badge ${active ? "active" : ""}`}>{active ? t("proPlan") : t("freePlan")}</span></div>
          <p className="settings-detail">{active ? active.willRenew ? t("proActiveDetail") : t("proCanceledDetail") : pro.subscription.status === "expired" ? t("proExpiredDetail") : t("proPlanDetail")}</p>
        </div></div>
        <div className="settings-card-actions">
          {active?.manageUrl ? <button className="button secondary" onClick={pro.manageSubscription} type="button">{t("manageSubscription")}</button> : null}
          {active ? <button className="button secondary" onClick={() => void pro.refreshSubscription()} type="button"><RefreshCw aria-hidden="true" size={16} />{t("refreshSubscription")}</button>
            : <button className="button primary" disabled={pro.subscription.status === "loading"} onClick={onOpenPaywall} type="button">{pro.subscription.status === "loading" ? <ButtonLoader /> : null}{pro.configured ? t("viewProPlans") : t("previewPro")}</button>}
        </div>
      </section>
    </div>

    <div className="settings-group">
      <h3>{t("automaticSync")}</h3>
      <section className="settings-card sync-settings-card">
        <div className="settings-card-header">{pro.sync.phase === "offline" || pro.sync.phase === "unavailable" ? <CloudOff aria-hidden="true" size={23} /> : <Cloud aria-hidden="true" size={23} />}<div>
          <div className="settings-title-line"><strong>{t("automaticSync")}</strong><span className={`sync-status sync-${pro.sync.phase}`}>{t(syncStatusKey(pro.sync.phase))}</span></div>
          <p className="settings-detail">{t("automaticSyncDetail")}</p>
        </div></div>
        {active && pro.sync.phase !== "unavailable" ? <button aria-pressed={pro.sync.enabled} className={`sync-toggle ${pro.sync.enabled ? "selected" : ""}`} onClick={() => void pro.setSyncEnabled(!pro.sync.enabled)} type="button"><span aria-hidden="true" />{pro.sync.enabled ? t("disableSync") : t("enableSync")}</button>
          : active ? <p className="sync-meta">{t("syncUnavailable")}</p>
          : <button className="button secondary" onClick={onOpenPaywall} type="button">{t("unlockWithPro")}</button>}
        {pro.sync.pendingChanges > 0 ? <p className="sync-meta" role="status">{t("syncPendingChanges", { count: pro.sync.pendingChanges })}</p> : null}
        {pro.sync.error ? <p className="field-error" role="alert">{pro.sync.error}</p> : null}
      </section>
    </div>
    <ErrorNotice message={pro.error} />
  </>;
}
