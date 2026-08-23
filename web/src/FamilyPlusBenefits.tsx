import { Info, LockKeyhole, RefreshCw, UsersRound } from "lucide-react";

import type { Translator } from "./i18n";

export function FamilyPlusBenefits({ t }: { t: Translator }) {
  return (
    <div className="family-plus-benefits">
      <ul className="pro-benefits">
        <li><RefreshCw aria-hidden="true" size={18} /><span><strong>{t("proBenefitSync")}</strong>{t("proBenefitSyncDetail")}</span></li>
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
