import { ArrowRight, Laptop, Smartphone } from "lucide-react";

import { FamilyPlusBenefits } from "./FamilyPlusBenefits";
import { FamilyPlusMark, FamilyPlusWordmark } from "./FamilyPlusMark";
import type { Translator } from "./i18n";
import type { ProContextValue } from "./proTypes";
import { SidePanel } from "./ui";

export function FamilyPanel({
  onClose,
  pro,
  t
}: {
  onClose: () => void;
  pro: ProContextValue;
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
          <FamilyPlusMark size={25} />
          <div>
            <strong><FamilyPlusWordmark /></strong>
            <p className="settings-detail">{t("proPlanDetail")}</p>
          </div>
        </div>

        <div className="family-plan-comparison">
          <div className="family-plan-state current">
            <span>{t("withoutFamilyPlus")}</span>
            <Smartphone aria-hidden="true" size={22} />
            <strong>{t("thisDeviceOnly")}</strong>
          </div>
          <ArrowRight aria-hidden="true" className="family-plan-state-arrow" size={18} />
          <div className="family-plan-state connected">
            <span>{t("withFamilyPlus")}</span>
            <Laptop aria-hidden="true" size={22} />
            <strong>{t("connectedDevices")}</strong>
          </div>
        </div>

        <FamilyPlusBenefits t={t} />

        <button
          className="button primary family-plan-cta"
          onClick={() => {
            onClose();
            pro.openPaywall();
          }}
          type="button"
        >
          {t("unlockWithPro")}
        </button>
      </section>
    </SidePanel>
  );
}
