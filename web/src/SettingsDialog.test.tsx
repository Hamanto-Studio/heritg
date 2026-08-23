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
import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";
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
    expect(english).toContain("Basa Cerbon · Cirebon");
    expect(english).toContain("Basa Sunda · Priangan");
    expect(english).toContain("Batak Toba");
    expect(english).toContain("Batak Karo");
    expect(english).toContain("Batak Mandailing");
    expect(english).toContain("Batak Angkola");
    expect(english).toContain("Batak Simalungun");
    expect(english).toContain("Pakpak/Dairi");
  });
});

describe("Family+ settings", () => {
  const renderSettings = (pro: ProContextValue) => renderToStaticMarkup(
    <SettingsDialog
      actions={{} as AppActions}
      data={createInitialAppData("en")}
      onClose={() => undefined}
      pro={pro}
      t={createTranslator("en")}
    />
  );

  it("shows authoritative active access and synchronization state", () => {
    const markup = renderSettings({
      ...unavailableProContext,
      configured: true,
      account: { status: "signedIn", user: { id: "A".repeat(22), name: null, email: null, expiresAt: "2027-08-23T00:00:00Z" } },
      subscription: { status: "active", expiresAt: "2028-08-23T00:00:00Z" },
      sync: { enabled: true, phase: "upToDate", pendingChanges: 0 }
    });

    expect(markup).toContain("Heritg Family+");
    expect(markup).toContain("Active");
    expect(markup).toContain("Refresh access");
    expect(markup).toContain("Up to date");
    expect(markup).toContain("Disable synchronization");
    expect(markup).toContain("synchronizes an encrypted hosted copy");
  });

  it("keeps cloud downloads available during read-only grace", () => {
    const markup = renderSettings({
      ...unavailableProContext,
      configured: true,
      subscription: { status: "expired", expiredAt: "2028-11-21T00:00:00Z", offers: [] },
      sync: { enabled: false, phase: "disabled", pendingChanges: 0 }
    });

    expect(markup).toContain("Cloud changes remain downloadable");
    expect(markup).toContain("Read-only grace");
    expect(markup).toContain("Enable synchronization");
  });

  it("uses one Family+ card and describes inactive access explicitly", () => {
    const markup = renderSettings(unavailableProContext);

    expect(markup).toContain("Not activated");
    expect(markup).toContain("Preview Family+");
    expect(markup.match(/Preview Family\+/gu)).toHaveLength(1);
    expect(markup).not.toContain(">Free<");
  });
});
