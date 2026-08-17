import { describe, expect, it } from "vitest";

import {
  archivePasswordIsReady,
  archivePasswordMeetsRequirements,
  archivePasswordRequirements
} from "./SettingsDialog";

describe("encrypted backup password validation", () => {
  it("allows both password fields to be empty", () => {
    expect(archivePasswordIsReady("", "")).toBe(true);
  });

  it("requires matching non-empty passwords", () => {
    expect(archivePasswordIsReady("Pass123!", "Different1!")).toBe(false);
    expect(archivePasswordIsReady("Pass123!", "Pass123!")).toBe(true);
  });

  it("requires 8 NFC code points with uppercase, lowercase, a number, and a special character", () => {
    expect(archivePasswordMeetsRequirements("Pass123!")).toBe(true);
    expect(archivePasswordMeetsRequirements("Ångström1!")).toBe(true);
    expect(archivePasswordMeetsRequirements("Pass1")).toBe(false);
    expect(archivePasswordMeetsRequirements("password1!")).toBe(false);
    expect(archivePasswordMeetsRequirements("PASSWORD1!")).toBe(false);
    expect(archivePasswordMeetsRequirements("Password!")).toBe(false);
    expect(archivePasswordMeetsRequirements("Pass1234")).toBe(false);
  });

  it("reports each unmet requirement independently", () => {
    expect(archivePasswordRequirements("password")).toEqual({
      minimumLength: true,
      lowercase: true,
      uppercase: false,
      number: false,
      special: false
    });
  });
});
