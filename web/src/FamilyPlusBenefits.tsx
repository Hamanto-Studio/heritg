import { Info, Link2, LockKeyhole, RefreshCw, Sparkles } from "lucide-react";

import type { Translator } from "./i18n";

export function FamilyPlusBenefits({ t }: { t: Translator }) {
  return (
    <div className="family-plus-benefits">
      <div className="family-plus-benefits-title"><Sparkles aria-hidden="true" size={17} /><strong>{t("familyPlusIncludes")}</strong></div>
      <ul className="pro-benefits">
        <li><RefreshCw aria-hidden="true" size={18} /><span><strong>{t("proBenefitSync")}</strong>{t("proBenefitSyncDetail")}</span></li>
        <li><Link2 aria-hidden="true" size={18} /><span><strong>{t("proBenefitSharing")}</strong>{t("proBenefitSharingDetail")}</span></li>
        <li><LockKeyhole aria-hidden="true" size={18} /><span><strong>{t("proBenefitLocal")}</strong>{t("proBenefitLocalDetail")}</span></li>
      </ul>
      <p className="family-free-tools"><strong>{t("familyFreeToolsTitle")}</strong>{t("familyFreeToolsDetail")}</p>
      <div className="family-plan-recovery-note">
        <Info aria-hidden="true" size={17} />
        <p><strong>{t("familyRecoveryTitle")}</strong>{t("familyRecoveryDetail")}</p>
      </div>
    </div>
  );
}
