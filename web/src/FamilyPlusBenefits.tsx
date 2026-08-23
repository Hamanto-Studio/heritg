import { Info, LockKeyhole, RefreshCw, Sparkles, UsersRound } from "lucide-react";

import type { Translator } from "./i18n";

export function FamilyPlusBenefits({ t }: { t: Translator }) {
  return (
    <div className="family-plus-benefits">
      <div className="family-plus-benefits-title"><Sparkles aria-hidden="true" size={17} /><strong>{t("familyPlusIncludes")}</strong></div>
      <ul className="pro-benefits">
        <li><RefreshCw aria-hidden="true" size={18} /><span><strong>{t("automaticSync")}</strong>{t("automaticSyncDetail")}</span></li>
        <li><UsersRound aria-hidden="true" size={18} /><span><strong>{t("proBenefitCollaborate")}</strong>{t("proBenefitCollaborateDetail")}</span></li>
        <li><LockKeyhole aria-hidden="true" size={18} /><span><strong>{t("proBenefitLocal")}</strong>{t("proBenefitLocalDetail")}</span></li>
      </ul>
      <div className="family-plan-recovery-note">
        <Info aria-hidden="true" size={17} />
        <p><strong>{t("familyRecoveryTitle")}</strong>{t("familyRecoveryDetail")}</p>
      </div>
    </div>
  );
}
