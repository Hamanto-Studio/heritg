import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createTranslator } from "./i18n";
import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";
import { SyncResolutionDialog } from "./SyncResolutionDialog";

describe("SyncResolutionDialog", () => {
  it("shows both copies and requires an explicit choice", () => {
    const pro: ProContextValue = { ...unavailableProContext, configured: true, sync: { enabled: true, phase: "conflict", pendingChanges: 3, local: { trees: 2, people: 42 }, cloud: { trees: 1, people: 38 } } };
    const markup = renderToStaticMarkup(<SyncResolutionDialog pro={pro} t={createTranslator("en")} />);
    expect(markup).toContain("2 trees · 42 people");
    expect(markup).toContain("1 trees · 38 people");
    expect(markup).toContain("Use this device");
    expect(markup).toContain("Use cloud copy");
    expect(markup).toContain("Preserve both");
  });
});
