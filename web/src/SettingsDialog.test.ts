import { describe, expect, it } from "vitest";

import { archivePasswordIsReady, archivePasswordMeetsRequirements } from "./SettingsDialog";

describe("encrypted backup password validation", () => {
  it("allows both password fields to be empty", () => {
    expect(archivePasswordIsReady("", "")).toBe(true);
  });

  it("requires matching non-empty passwords", () => {
    expect(archivePasswordIsReady("Pass1234", "different1A")).toBe(false);
    expect(archivePasswordIsReady("Pass1234", "Pass1234")).toBe(true);
  });

  it("requires 8 NFC code points with uppercase, lowercase, and a number", () => {
    expect(archivePasswordMeetsRequirements("Pass1234")).toBe(true);
    expect(archivePasswordMeetsRequirements("Ångström1")).toBe(true);
    expect(archivePasswordMeetsRequirements("Pass1")).toBe(false);
    expect(archivePasswordMeetsRequirements("password1")).toBe(false);
    expect(archivePasswordMeetsRequirements("PASSWORD1")).toBe(false);
    expect(archivePasswordMeetsRequirements("Password")).toBe(false);
  });
});
