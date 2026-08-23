import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FamilyPanel } from "./FamilyPanel";
import { createTranslator } from "./i18n";
import { unavailableFamilyContext } from "./familyTypes";

describe("FamilyPanel", () => {
  it("shows a simple device-focused benefit list and one unlock action", () => {
    const markup = renderToStaticMarkup(
      <FamilyPanel family={unavailableFamilyContext} onClose={() => undefined} t={createTranslator("en")} />
    );
    expect(markup).toContain("Your family history, safe and ready anywhere");
    expect(markup).toContain("Pick up where you left off");
    expect(markup).toContain("Not tied to one device");
    expect(markup).toContain("Private and always yours");
    expect(markup).toContain("Unlock with Family Plan");
    expect(markup).not.toContain("Optional Heritg account");
    expect(markup).not.toContain("Subscription");
  });
});
