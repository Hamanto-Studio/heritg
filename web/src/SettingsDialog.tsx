import { Globe2, Languages, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Translator } from "./i18n";
import { passwordRequirements } from "./passwordPolicy";
import type { AppActions } from "./store";
import type { AppData } from "./types";
import { ButtonLoader, SidePanel } from "./ui";

interface SettingsDialogProps {
  data: AppData;
  actions: AppActions;
  t: Translator;
  onClose: () => void;
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
  onClose
}: SettingsDialogProps) {
  const [pendingLanguage, setPendingLanguage] = useState<AppData["language"]>();
  const [isPending, startTransition] = useTransition();
  const changingLanguage = useRef(false);
  const relationshipTerminology = data.relationshipTerminology ?? "id";

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
