import type { AppLanguage } from "./locale";
import { formatDisplayDate, type Translator } from "./i18n";
import type { FamilyRelationship } from "./types";

/** Pairwise facts stay attached to the named partner, even in multi-parent groups. */
export function PartnerFacts({ relationship, language, t }: { relationship: FamilyRelationship; language: AppLanguage; t: Translator }) {
  const former = relationship.subtype === "formerPartner" || relationship.subtype === "formerSpouse";
  return <p className="explorer-note">
    {t(former ? "branchFormerPartner" : "branchWith")}
    {relationship.marriageDate ? ` · ${t("marriageDate")}: ${formatDisplayDate(relationship.marriageDate, language)}` : ""}
    {relationship.divorceDate ? ` · ${t("branchDivorced")}: ${formatDisplayDate(relationship.divorceDate, language)}` : ""}
  </p>;
}
