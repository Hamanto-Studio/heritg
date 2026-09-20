import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FamilyPlusBenefits } from "./FamilyPlusBenefits";
import { createTranslator } from "./i18n";

describe.each(["en", "id", "ms"] as const)("Family+ benefits in %s", (language) => {
  it("separates paid sharing and sync from free views, languages, and exports", () => {
    const t = createTranslator(language);
    const html = renderToStaticMarkup(<FamilyPlusBenefits t={t} />);
    const page = new DOMParser().parseFromString(html, "text/html");
    const paid = page.querySelector(".pro-benefits")!;
    expect(paid.children).toHaveLength(3);
    expect(paid.textContent).toContain(t("proBenefitSync"));
    expect(paid.textContent).toContain(t("proBenefitSharingDetail"));
    expect(paid.textContent).toContain(t("proBenefitLocal"));
    expect(paid.textContent).not.toContain(t("proBenefitCollaborate"));
    const free = page.querySelector(".family-free-tools")!;
    expect(free.textContent).toContain(t("familyFreeToolsTitle"));
    for (const format of ["GEDCOM", "PNG", "PDF", "SVG"]) expect(free.textContent).toContain(format);
    expect(free.textContent).toContain("PDF");
    expect(page.querySelector(".family-plan-recovery-note")).not.toBeNull();
  });
});
