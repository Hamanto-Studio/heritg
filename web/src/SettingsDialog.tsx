import {
  Cloud,
  CloudOff,
  Crown,
  Globe2,
  Languages,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { AccountSettings } from "./AccountSettings";
import type { Translator } from "./i18n";
import { passwordRequirements } from "./passwordPolicy";
import type { FamilyContextValue, SyncPhase } from "./familyTypes";
import { unavailableFamilyContext } from "./familyTypes";
import type { AppActions } from "./store";
import type { AppData } from "./types";
import { ButtonLoader, SidePanel } from "./ui";

interface SettingsDialogProps {
  data: AppData;
  actions: AppActions;
  t: Translator;
  onClose: () => void;
  family?: FamilyContextValue;
}

export const archivePasswordRequirements = (password: string) => passwordRequirements(password);

export const archivePasswordMeetsRequirements = (password: string) =>
  password.length === 0 || Object.values(archivePasswordRequirements(password)).every(Boolean);

export const archivePasswordIsReady = (password: string, confirmation: string) =>
  password === confirmation && archivePasswordMeetsRequirements(password);

export function SettingsDialog({
  data,
  actions,
  t,
  onClose,
  family = unavailableFamilyContext
}: SettingsDialogProps) {
  const [pendingLanguage, setPendingLanguage] = useState<AppData["language"]>();
  const [isPending, startTransition] = useTransition();
  const changingLanguage = useRef(false);
  const relationshipTerminology = data.relationshipTerminology ?? "id";

  const syncStatusKey = (phase: SyncPhase) => {
    switch (phase) {
      case "disabled": return "syncDisabled" as const;
      case "upToDate": return "syncUpToDate" as const;
      case "offline": return "syncOffline" as const;
      case "authenticationRequired": return "signInRequired" as const;
      case "subscriptionRequired": return "familyRequired" as const;
      case "readOnly": return "syncReadOnly" as const;
      case "error": return "syncError" as const;
      default: return "syncUnavailable" as const;
    }
  };

  const activeSubscription = family.subscription.status === "active" ? family.subscription : undefined;
  const familyActive = Boolean(activeSubscription);

  useEffect(() => {
    if (!isPending) changingLanguage.current = false;
  }, [isPending]);

  const changeLanguage = (language: AppData["language"]) => {
    if (language === data.language || changingLanguage.current) return;
    changingLanguage.current = true;
    setPendingLanguage(language);
    startTransition(() => actions.setLanguage(language));
  };

  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("settings")}>
      <div className="settings-intro">
        <h3>{t("privateSimple")}</h3>
        <p>{t(family.sync.enabled ? "privateSyncDescription" : "privateDescription")}</p>
      </div>

      <div className="settings-group">
        <h3>{t("subscription")}</h3>
        <section className={`settings-card family-settings-card ${familyActive ? "active" : ""}`}>
          <div className="settings-card-header">
            <Crown aria-hidden="true" size={23} />
            <div>
              <div className="settings-title-line">
                <strong>{t("heritgFamily")}</strong>
                <span className={`family-badge ${familyActive ? "active" : ""}`}>
                  {familyActive ? t("familyPlan") : t("freePlan")}
                </span>
              </div>
              <p className="settings-detail">
                {family.subscription.status === "active"
                  ? t("familyActiveDetail")
                  : family.subscription.status === "readOnly" ? t("familyExpiredDetail") : t("familyPlanDetail")}
              </p>
            </div>
          </div>
          <div className="settings-card-actions">
            {activeSubscription?.managementUrl ? <button className="button secondary" onClick={family.manageSubscription} type="button">{t("manageSubscription")}</button> : null}
            {familyActive ? (
              <button className="button secondary" onClick={() => void family.refreshSubscription()} type="button"><RefreshCw aria-hidden="true" size={16} />{t("refreshSubscription")}</button>
            ) : (
              <button className="button primary" onClick={family.openPaywall} type="button">{family.configured ? t("viewFamilyPlans") : t("previewFamily")}</button>
            )}
          </div>
        </section>
      </div>

      <div className="settings-group">
        <h3>{t("automaticSync")}</h3>
        <section className="settings-card sync-settings-card">
          <div className="settings-card-header">
            {family.sync.phase === "offline" || family.sync.phase === "unavailable" ? <CloudOff aria-hidden="true" size={23} /> : <Cloud aria-hidden="true" size={23} />}
            <div>
              <div className="settings-title-line">
                <strong>{t("automaticSync")}</strong>
                <span className={`sync-status sync-${family.sync.phase}`}>{t(syncStatusKey(family.sync.phase))}</span>
              </div>
              <p className="settings-detail">{t("automaticSyncDetail")}</p>
            </div>
          </div>
          {familyActive && family.sync.phase !== "unavailable" ? (
            <button
              aria-pressed={family.sync.enabled}
              className={`sync-toggle ${family.sync.enabled ? "selected" : ""}`}
              onClick={() => void family.setSyncEnabled(!family.sync.enabled)}
              type="button"
            >
              <span aria-hidden="true" />
              {family.sync.enabled ? t("disableSync") : t("enableSync")}
            </button>
          ) : !familyActive ? (
            <button className="button secondary" onClick={family.openPaywall} type="button">{t("unlockWithFamily")}</button>
          ) : null}
          {family.sync.pendingChanges > 0 ? <p className="sync-meta" role="status">{t("syncPendingChanges", { count: family.sync.pendingChanges })}</p> : null}
          {family.sync.error ? <p className="field-error" role="alert">{family.sync.error}</p> : null}
        </section>
      </div>

      <AccountSettings language={data.language} t={t} />

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
              aria-busy={isPending && pendingLanguage === "en" || undefined}
              className={data.language === "en" ? "selected" : ""}
              disabled={isPending}
              onClick={() => changeLanguage("en")}
              type="button"
            >
              {isPending && pendingLanguage === "en" ? <ButtonLoader /> : null}
              {t("english")}
            </button>
            <button
              aria-pressed={data.language === "id"}
              aria-busy={isPending && pendingLanguage === "id" || undefined}
              className={data.language === "id" ? "selected" : ""}
              disabled={isPending}
              onClick={() => changeLanguage("id")}
              type="button"
            >
              {isPending && pendingLanguage === "id" ? <ButtonLoader /> : null}
              {t("indonesian")}
            </button>
          </div>
        </section>
      </div>

      {data.language === "id" ? (
        <div className="settings-group">
          <h3>{t("relationshipTerminology")}</h3>
          <section className="settings-card">
            <div className="settings-card-header">
              <Languages aria-hidden="true" size={23} />
              <div>
                <strong>{t("relationshipTerminology")}</strong>
                <p className="settings-detail">{t("relationshipTerminologyDetail")}</p>
              </div>
            </div>
            <div className="language-options relationship-language-options">
              <button
                aria-pressed={relationshipTerminology === "id"}
                className={relationshipTerminology === "id" ? "selected" : ""}
                onClick={() => actions.setRelationshipTerminology("id")}
                type="button"
              >
                {t("indonesianRelationships")}
              </button>
              <button
                aria-pressed={relationshipTerminology === "jv-yogyakarta"}
                className={relationshipTerminology === "jv-yogyakarta" ? "selected" : ""}
                onClick={() => actions.setRelationshipTerminology("jv-yogyakarta")}
                type="button"
              >
                {t("javaneseYogyakarta")}
              </button>
              <button
                aria-pressed={relationshipTerminology === "jv-east-java"}
                className={relationshipTerminology === "jv-east-java" ? "selected" : ""}
                onClick={() => actions.setRelationshipTerminology("jv-east-java")}
                type="button"
              >
                {t("javaneseEastJava")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <div className="privacy-note">
        <ShieldCheck aria-hidden="true" size={17} />
        <span><strong>{t("offlineReady")}</strong><br />{t("savedAutomatically")}</span>
      </div>
      <p className="app-version">Heritg Web {__APP_VERSION__}</p>
    </SidePanel>
  );
}
