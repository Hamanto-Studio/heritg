import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  archivePasswordIsReady,
  archivePasswordMeetsRequirements,
  archivePasswordRequirements,
  SettingsDialog
} from "./SettingsDialog";
import { createInitialAppData } from "./domain";
import { createTranslator } from "./i18n";
import type { AppActions } from "./store";

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

describe("relationship terminology settings", () => {
  it("shows every relationship language independently of interface language", () => {
    const actions = {} as AppActions;
    const indonesian = renderToStaticMarkup(
      <SettingsDialog
        actions={actions}
        data={createInitialAppData("id")}
        onClose={() => undefined}
        t={createTranslator("id")}
      />
    );
    const english = renderToStaticMarkup(
      <SettingsDialog
        actions={actions}
        data={createInitialAppData("en")}
        onClose={() => undefined}
        t={createTranslator("en")}
      />
    );

    expect(indonesian).toContain("Bahasa hubungan keluarga");
    expect(indonesian).toContain("Basa Jawa · Yogyakarta");
    expect(indonesian).toContain("Basa Jawa · Jawa Timur");
    expect(english).toContain("Relationship language");
    expect(english).toContain("Basa Jawa · Yogyakarta");
    expect(english).toContain("Basa Jawa · East Java");
  });
});
