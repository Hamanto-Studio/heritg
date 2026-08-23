import { Check, Cloud, Crown, ShieldCheck } from "lucide-react";

import type { Translator } from "./i18n";
import type { FamilyContextValue } from "./familyTypes";
import { SidePanel } from "./ui";

export function FamilyPanel({
  onClose,
  family,
  t
}: {
  onClose: () => void;
  family: FamilyContextValue;
  t: Translator;
}) {
  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("heritgFamily")}>
      <div className="settings-intro">
        <h3>{t("heritgFamilyTitle")}</h3>
        <p>{t("heritgFamilyDetail")}</p>
      </div>

      <section className="settings-card family-plan-overview">
        <div className="settings-card-header">
          <Crown aria-hidden="true" size={23} />
          <div>
            <strong>{t("heritgPro")}</strong>
            <p className="settings-detail">{t("proPlanDetail")}</p>
          </div>
        </div>
        <ul className="family-benefits family-plan-benefits">
          <li><Cloud aria-hidden="true" size={18} /><span><strong>{t("proBenefitSync")}</strong>{t("proBenefitSyncDetail")}</span></li>
          <li><ShieldCheck aria-hidden="true" size={18} /><span><strong>{t("proBenefitBackup")}</strong>{t("proBenefitBackupDetail")}</span></li>
          <li><Check aria-hidden="true" size={18} /><span><strong>{t("proBenefitLocal")}</strong>{t("proBenefitLocalDetail")}</span></li>
        </ul>
        <button
          className="button primary family-plan-cta"
          onClick={() => {
            onClose();
            family.openPaywall();
          }}
          type="button"
        >
          {t("unlockWithPro")}
        </button>
      </section>
    </SidePanel>
  );
}
