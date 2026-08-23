import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FamilyPanel } from "./FamilyPanel";
import { createTranslator } from "./i18n";
import { unavailableProContext } from "./proTypes";

describe("FamilyPanel", () => {
  it("contrasts local-only storage with connected devices and explains recovery", () => {
    const markup = renderToStaticMarkup(
      <FamilyPanel onClose={() => undefined} pro={unavailableProContext} t={createTranslator("en")} />
    );
    expect(markup).toContain("Continue your family tree on another device");
    expect(markup).toContain("Without Family+");
    expect(markup).toContain("This device only");
    expect(markup).toContain("Connected devices");
    expect(markup).toContain("Invite up to five people");
    expect(markup).toContain("About recovery");
    expect(markup).toContain("Heritg Family+");
    expect(markup).toContain("View Family+ plans");
    expect(markup).not.toContain("Optional Heritg account");
    expect(markup).not.toContain("Subscription");
  });
});
