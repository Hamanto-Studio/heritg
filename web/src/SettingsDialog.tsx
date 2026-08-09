import { Globe2, ShieldCheck } from "lucide-react";
import type { Translator } from "./i18n";
import type { AppActions } from "./store";
import type { AppData } from "./types";
import { SidePanel } from "./ui";

interface SettingsDialogProps {
  data: AppData;
  actions: AppActions;
  t: Translator;
  onClose: () => void;
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
  actions,
  t,
  onClose
}: SettingsDialogProps) {
  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("settings")}>
      <div className="settings-intro">
        <h3>{t("privateSimple")}</h3>
        <p>{t("privateDescription")}</p>
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
      <p className="app-version">Heritg Web {__APP_VERSION__}</p>
    </SidePanel>
  );
}
