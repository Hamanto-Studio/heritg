import { useSyncExternalStore } from "react";
import { analytics } from "./analytics";
import type { Translator } from "./i18n";

export function AnalyticsSettings({ t, language }: { t: Translator; language: "en" | "id" }) {
  useSyncExternalStore(analytics.subscribe, analytics.snapshot, analytics.snapshot);
  const status = analytics.status();
  const available = status === "on" || status === "off";
  const sent = analytics.lastSent();
  const date = sent ? new Date(sent) : undefined;
  const lastSent = date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date) : undefined;
  return <section className="settings-group analytics-settings" aria-labelledby="analytics-title">
    <h3 id="analytics-title">{t("analyticsTitle")}</h3>
    <p className="settings-detail" id="analytics-detail">{t("analyticsDetail")}</p>
    <p className="settings-detail">{t("analyticsRetention")}</p>
    <div aria-describedby="analytics-detail" aria-label={t("analyticsTitle")} className="language-options" role="group">
      <button aria-pressed={status !== "on"} className={status !== "on" ? "selected" : ""} onClick={() => analytics.setConsent(false)} type="button">{t("analyticsOff")}</button>
      <button aria-pressed={status === "on"} className={status === "on" ? "selected" : ""} disabled={!available} onClick={() => analytics.setConsent(true)} type="button">{t("analyticsOn")}</button>
    </div>
    <p className="settings-detail" role="status">{t(status === "unavailable" ? "analyticsUnavailable" : status === "browser_blocked" ? "analyticsBrowserBlocked" : status === "on" ? "analyticsEnabled" : "analyticsDisabled")}</p>
    <p className="settings-detail">{lastSent ? t("analyticsLastSent", { date: lastSent }) : t("analyticsNeverSent")}</p>
    <a href="https://github.com/Hamanto-Studio/heritg/blob/main/docs/ANALYTICS.md" rel="noreferrer" target="_blank">{t("analyticsCatalog")}</a>
  </section>;
}
