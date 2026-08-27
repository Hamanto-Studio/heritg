import { Cloud, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { FamilyPlusMark, FamilyPlusWordmark } from "./FamilyPlusMark";
import type { Translator } from "./i18n";
import type { ProContextValue, SyncPhase } from "./proTypes";
import type { AppData } from "./types";
import { ButtonLoader, ErrorNotice } from "./ui";

const localeForLanguage = (language: AppData["language"]) => language === "id" ? "id-ID" : "en-US";

export const formatRemainingDuration = (expiresAt: string, language: AppData["language"], now = Date.now()) => {
  const remainingDays = Math.max(1, Math.ceil((Date.parse(expiresAt) - now) / 86_400_000));
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] = remainingDays >= 30
    ? [Math.max(1, Math.round(remainingDays / 30)), "month"]
    : remainingDays >= 7
      ? [Math.max(1, Math.round(remainingDays / 7)), "week"]
      : [remainingDays, "day"];
  return new Intl.RelativeTimeFormat(localeForLanguage(language), { numeric: "always" }).format(value, unit);
};

export const formatExpiryDate = (expiresAt: string, language: AppData["language"], includeTime = false) =>
  new Intl.DateTimeFormat(localeForLanguage(language), includeTime
    ? { dateStyle: "medium", timeStyle: "medium" }
    : { dateStyle: "medium" }).format(new Date(expiresAt));

export const formatCountdown = (expiresAt: string, now = Date.now()) => {
  const totalSeconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
};

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

interface ProSettingsProps {
  pro: ProContextValue;
  t: Translator;
  language: AppData["language"];
  onOpenPaywall: () => void;
  deploymentEnvironment?: "production" | "staging";
}

export function ProSettings({
  pro,
  t,
  language,
  onOpenPaywall,
  deploymentEnvironment = __DEPLOYMENT_ENV__
}: ProSettingsProps) {
  const [now, setNow] = useState(Date.now);
  const [refreshingAccess, setRefreshingAccess] = useState(false);
  const active = pro.subscription.status === "active" ? pro.subscription : undefined;
  const readOnly = deploymentEnvironment === "production" && pro.subscription.status === "readOnly";
  const expired = pro.subscription.status === "expired" ||
    deploymentEnvironment === "staging" && pro.subscription.status === "readOnly";
  const activeExpiry = active?.expiresAt;
  const refreshSubscription = pro.refreshSubscription;
  const expiredAt = pro.subscription.status === "expired"
    ? pro.subscription.expiresAt
    : pro.subscription.status === "readOnly" ? pro.subscription.expiresAt : undefined;

  const refreshAccess = async () => {
    if (refreshingAccess) return;
    setRefreshingAccess(true);
    try {
      await refreshSubscription();
    } finally {
      setRefreshingAccess(false);
    }
  };

  useEffect(() => {
    if (deploymentEnvironment !== "staging" || !activeExpiry) return;
    let refreshed = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current < Date.parse(activeExpiry) || refreshed) return;
      refreshed = true;
      void refreshSubscription();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeExpiry, deploymentEnvironment, refreshSubscription]);

  const expiry = activeExpiry
    ? deploymentEnvironment === "staging"
      ? <div className="pro-expiry" role="status">
          <strong>{t("proTestAccessEnds", { duration: formatCountdown(activeExpiry, now) })}</strong>
          <span>{t("proExactExpiry", { date: formatExpiryDate(activeExpiry, language, true) })}</span>
        </div>
      : <div className="pro-expiry">
          <strong>{t("proAccessEnds", { duration: formatRemainingDuration(activeExpiry, language, now) })}</strong>
          <span>{t("proAccessEndsOn", { date: formatExpiryDate(activeExpiry, language) })}</span>
        </div>
    : readOnly && pro.subscription.status === "readOnly" && pro.subscription.graceEndsAt
      ? <div className="pro-expiry">
          <strong>{t("proReadOnlyEnds", { duration: formatRemainingDuration(pro.subscription.graceEndsAt, language, now) })}</strong>
          <span>{t("proReadOnlyEndsOn", { date: formatExpiryDate(pro.subscription.graceEndsAt, language) })}</span>
        </div>
      : expired && expiredAt
        ? <div className="pro-expiry"><strong>{t("proExpiredOn", {
            date: formatExpiryDate(expiredAt, language)
          })}</strong></div>
        : null;

  return <>
    <div className="settings-group">
      <h3>{t("subscription")}</h3>
      <section className={`settings-card pro-settings-card ${active ? "active" : ""}`}>
        <div className="settings-card-header"><FamilyPlusMark size={25} /><div>
          <div className="settings-title-line"><strong><FamilyPlusWordmark /></strong><span className={`pro-badge ${active ? "active" : ""}`}>{active ? t("familyPlusActive") : readOnly ? t("syncReadOnly") : expired ? t("familyPlusExpired") : t("familyPlusInactive")}</span></div>
          <p className="settings-detail">{active ? t("proActiveDetail") : readOnly ? t("proExpiredDetail") : t("proPlanDetail")}</p>
          {expiry}
        </div></div>

        <div className="pro-settings-sync">
          <Cloud aria-hidden="true" size={21} /><div>
          <div className="settings-title-line"><strong>{t("automaticSync")}</strong>{pro.sync.phase !== "unavailable" && pro.sync.phase !== "subscriptionRequired" ? <span className={`sync-status sync-${pro.sync.phase}`}>{t(readOnly ? "syncReadOnly" : syncStatusKey(pro.sync.phase))}</span> : null}</div>
          <p className="settings-detail">{t("automaticSyncDetail")}</p>
          {pro.sync.error ? <p className="sync-error-message" role="alert">{pro.sync.error}</p> : null}
          </div>
        </div>
        {(active || readOnly) && pro.sync.phase !== "unavailable" ? <button aria-pressed={pro.sync.enabled} className={`sync-toggle ${pro.sync.enabled ? "selected" : ""}`} onClick={() => void pro.setSyncEnabled(!pro.sync.enabled)} type="button"><span aria-hidden="true" />{pro.sync.enabled ? t("disableSync") : t("enableSync")}</button> : null}
        {pro.sync.pendingChanges > 0 ? <p className="sync-meta" role="status">{t("syncPendingChanges", { count: pro.sync.pendingChanges })}</p> : null}
        <div className="settings-card-actions">
          {active ? <button aria-busy={refreshingAccess} className="button secondary" disabled={refreshingAccess} onClick={() => void refreshAccess()} type="button">{refreshingAccess ? <ButtonLoader /> : <RefreshCw aria-hidden="true" size={16} />}{t(refreshingAccess ? "refreshingSubscription" : "refreshSubscription")}</button>
            : <button className="button primary" disabled={pro.subscription.status === "loading"} onClick={onOpenPaywall} type="button">{pro.subscription.status === "loading" ? <ButtonLoader /> : null}{t("enableSyncFamilyPlus")}</button>}
        </div>
        {active ? <p className="settings-detail">{t("refreshSubscriptionDetail")}</p> : null}
      </section>
    </div>
    <ErrorNotice message={pro.error} />
  </>;
}
