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

    expect(indonesian).toContain("Sebutan status keluarga");
    expect(indonesian).toContain("Basa Jawa (Yogyakarta)");
    expect(indonesian).toContain("Basa Jawa (Jawa Timur)");
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
    expect(markup).toContain("Access ends in");
    expect(markup).toContain("Ends Aug 23, 2028");
  });

  it("keeps cloud downloads available during read-only grace", () => {
    const markup = renderSettings({
      ...unavailableProContext,
      configured: true,
      subscription: {
        status: "readOnly",
        expiresAt: "2028-08-23T00:00:00Z",
        graceEndsAt: "2028-11-21T00:00:00Z"
      },
      sync: { enabled: false, phase: "disabled", pendingChanges: 0 }
    });

    expect(markup).toContain("Cloud changes remain downloadable");
    expect(markup).toContain("Read-only grace");
    expect(markup).toContain("Read-only access ends in");
    expect(markup).toContain("Nov 21, 2028");
    expect(markup).toContain("Enable synchronization");
  });

  it("shows the authoritative full-access expiry after grace has ended", () => {
    const markup = renderSettings({
      ...unavailableProContext,
      configured: true,
      subscription: { status: "expired", expiresAt: "2028-08-23T00:00:00Z" }
    });

    expect(markup).toContain("Expired Aug 23, 2028");
    expect(markup).not.toContain("Read-only grace");
  });

  it("uses one Family+ card and describes inactive access explicitly", () => {
    const markup = renderSettings(unavailableProContext);

    expect(markup).toContain("Not activated");
    expect(markup).toContain(">Enable<");
    expect(markup).not.toContain(">Family+ required<");
    expect(markup).not.toContain("Coming soon");
    expect(markup).not.toContain(">Free<");
  });
});
