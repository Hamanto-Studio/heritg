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
import type { FamilyContextValue } from "./familyTypes";
import { unavailableFamilyContext } from "./familyTypes";

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

describe("Family settings", () => {
  it("presents accounts, the free plan, and locked synchronization without claiming access", () => {
    const markup = renderToStaticMarkup(
      <SettingsDialog
        actions={{} as AppActions}
        data={createInitialAppData("en")}
        onClose={() => undefined}
        t={createTranslator("en")}
      />
    );

    expect(markup).toContain("Heritg account");
    expect(markup).toContain("Heritg Family");
    expect(markup).toContain("Free");
    expect(markup).toContain("Automatic synchronization");
    expect(markup).toContain("Coming soon");
    expect(markup).toContain("Preview Family");
  });

  it("shows authoritative active subscription and synchronization state", () => {
    const family: FamilyContextValue = {
      ...unavailableFamilyContext,
      configured: true,
      account: { status: "signedIn", session: { accountId: "A".repeat(22), expiresAt: "2027-08-23T00:00:00Z" } },
      subscription: {
        status: "active",
        access: "active",
        offers: [],
        expiresAt: "2027-08-23T00:00:00Z",
        managementUrl: "https://billing.example.com/customer"
      },
      sync: { enabled: true, phase: "upToDate", pendingChanges: 0 }
    };
    const markup = renderToStaticMarkup(
      <SettingsDialog
        actions={{} as AppActions}
        data={createInitialAppData("en")}
        onClose={() => undefined}
        family={family}
        t={createTranslator("en")}
      />
    );

    expect(markup).toContain("Manage subscription");
    expect(markup).toContain("Up to date");
    expect(markup).toContain("Disable synchronization");
    expect(markup).toContain("synchronizes an encrypted hosted copy");
  });

  it("renders the subscription shell in Indonesian", () => {
    const markup = renderToStaticMarkup(
      <SettingsDialog
        actions={{} as AppActions}
        data={createInitialAppData("id")}
        onClose={() => undefined}
        t={createTranslator("id")}
      />
    );
    expect(markup).toContain("Akun Heritg");
    expect(markup).toContain("Sinkronisasi otomatis");
    expect(markup).toContain("Pratinjau Family");
  });
});
