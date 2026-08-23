import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { FamilyPlusMark, FamilyPlusWordmark } from "./FamilyPlusMark";
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
  const readOnly = pro.subscription.status === "expired";

  return <>
    <div className="settings-group">
      <h3>{t("subscription")}</h3>
      <section className={`settings-card pro-settings-card ${active ? "active" : ""}`}>
        <div className="settings-card-header"><FamilyPlusMark size={25} /><div>
          <div className="settings-title-line"><strong><FamilyPlusWordmark /></strong><span className={`pro-badge ${active ? "active" : ""}`}>{active ? t("familyPlusActive") : readOnly ? t("syncReadOnly") : t("familyPlusInactive")}</span></div>
          <p className="settings-detail">{active ? t("proActiveDetail") : pro.subscription.status === "expired" ? t("proExpiredDetail") : t("proPlanDetail")}</p>
        </div></div>

        <div className="pro-settings-sync">
          {pro.sync.phase === "offline" || pro.sync.phase === "unavailable" ? <CloudOff aria-hidden="true" size={21} /> : <Cloud aria-hidden="true" size={21} />}<div>
          <div className="settings-title-line"><strong>{t("automaticSync")}</strong><span className={`sync-status sync-${pro.sync.phase}`}>{t(readOnly ? "syncReadOnly" : syncStatusKey(pro.sync.phase))}</span></div>
          <p className="settings-detail">{t("automaticSyncDetail")}</p>
          </div>
        </div>
        {(active || readOnly) && pro.sync.phase !== "unavailable" ? <button aria-pressed={pro.sync.enabled} className={`sync-toggle ${pro.sync.enabled ? "selected" : ""}`} onClick={() => void pro.setSyncEnabled(!pro.sync.enabled)} type="button"><span aria-hidden="true" />{pro.sync.enabled ? t("disableSync") : t("enableSync")}</button> : null}
        {pro.sync.pendingChanges > 0 ? <p className="sync-meta" role="status">{t("syncPendingChanges", { count: pro.sync.pendingChanges })}</p> : null}
        {pro.sync.error ? <p className="field-error" role="alert">{pro.sync.error}</p> : null}
        <div className="settings-card-actions">
          {active ? <button className="button secondary" onClick={() => void pro.refreshSubscription()} type="button"><RefreshCw aria-hidden="true" size={16} />{t("refreshSubscription")}</button>
            : <button className="button primary" disabled={pro.subscription.status === "loading"} onClick={onOpenPaywall} type="button">{pro.subscription.status === "loading" ? <ButtonLoader /> : null}{pro.configured ? t("viewProPlans") : t("previewPro")}</button>}
        </div>
      </section>
    </div>
    <ErrorNotice message={pro.error} />
  </>;
}
