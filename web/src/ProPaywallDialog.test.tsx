import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "./i18n";
import { ProPaywallDialog } from "./ProPaywallDialog";
import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";

const context = (overrides: Partial<ProContextValue> = {}): ProContextValue => ({ ...unavailableProContext, closePaywall: vi.fn(), purchase: vi.fn(async () => undefined), ...overrides });
describe("ProPaywallDialog", () => {
  it("renders a truthful unavailable preview with disabled checkout", () => {
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={context()} t={createTranslator("en")} />);
    expect(markup).toContain("Price available at launch");
    expect(markup).toContain("One-time purchases are not enabled in this deployment");
    expect(markup).toContain("disabled");
  });
  it("shows the backend offer total and monthly equivalent", () => {
    const pro = context({ configured: true, account: { status: "signedIn", user: { id: "account-1", name: null, email: null, expiresAt: "2026-09-23T10:10:00.000Z" } }, subscription: { status: "free", offer: {
      productId: "heritg_family_preservation",
      name: "HERITG Family Preservation",
      price: { amount: 120_000, currency: "IDR" },
      accessMonths: 24
    } } });
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={pro} t={createTranslator("en")} />);
    expect(markup).toContain("120.000");
    expect(markup).toContain("5.000");
    expect(markup).toContain("24 months of Family+");
    expect(markup).toContain("Equivalent to");
    expect(markup).toContain("One-time payment");
    expect(markup).toContain("Every change, ready on every device");
    expect(markup).toContain("Invite up to 5 people");
    expect(markup).toContain("Encrypted and still yours");
    expect(markup).toContain("Heritg Family+");
    expect(markup).toContain("Continue to secure payment");
    expect(markup).not.toContain("5 years");
    expect(markup).not.toContain("2 years");
    expect(markup).not.toContain("Xendit");
    expect(markup).not.toContain("Heritg Pro");
  });

  it("localizes the monthly equivalent in Indonesian", () => {
    const pro = context({ configured: true, account: { status: "signedIn", user: { id: "account-1", name: null, email: null, expiresAt: "2026-09-23T10:10:00.000Z" } }, subscription: { status: "free", offer: {
      productId: "heritg_family_preservation",
      name: "HERITG Family Preservation",
      price: { amount: 120_000, currency: "IDR" },
      accessMonths: 24
    } } });
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={pro} t={createTranslator("id")} />);
    expect(markup).toContain("Akses Family+ selama 24 bulan");
    expect(markup).toContain("Setara");
    expect(markup).toContain("5.000");
    expect(markup).toContain("/bulan");
  });
});
