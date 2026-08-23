import { Cloud, Download, ExternalLink, KeyRound, ShieldCheck, WifiOff } from "lucide-react";

import type { Translator } from "./i18n";
import { SidePanel } from "./ui";

export function PrivacyPanel({
  onClose,
  syncEnabled = false,
  t
}: {
  onClose: () => void;
  syncEnabled?: boolean;
  t: Translator;
}) {
  const storageItem = syncEnabled
    ? [Cloud, t("privacySyncTitle"), t("privacySyncDetail")] as const
    : [WifiOff, t("privacyLocalTitle"), t("privacyLocalDetail")] as const;
  const items = [
    [ShieldCheck, t("privacyStorageTitle"), t("privacyStorageDetail")],
    [KeyRound, t("privacyKeyTitle"), t("privacyKeyDetail")],
    storageItem,
    [Download, t("privacyExportTitle"), t("privacyExportDetail")]
  ] as const;

  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("privacyProtection")}>
      <div className="privacy-status">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <strong>{t("protectedOnDevice")}</strong>
          <span>{t("privacyIntro")}</span>
        </div>
      </div>
      <div className="help-list privacy-details">
        {items.map(([Icon, title, detail]) => (
          <section className="help-item" key={title}>
            <span className="panel-icon"><Icon aria-hidden="true" size={19} /></span>
            <div>
              <h3>{title}</h3>
              <p>{detail}</p>
            </div>
          </section>
        ))}
      </div>
      <a
        className="privacy-details-link"
        href="https://family.heritg.us/blog/e2e-encryption"
        rel="noopener noreferrer"
        target="_blank"
      >
        <span>
          <strong>{t("encryptionDetailsTitle")}</strong>
          <small>{t("encryptionDetailsDetail")}</small>
        </span>
        <ExternalLink aria-hidden="true" size={20} strokeWidth={2.2} />
      </a>
      <p className="app-version">Heritg Web {__APP_VERSION__}</p>
    </SidePanel>
  );
}
