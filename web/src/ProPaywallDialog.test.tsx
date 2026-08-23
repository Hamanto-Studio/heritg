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
  it("uses localized one-time prices and shows Indonesian payment methods", () => {
    const pro = context({ configured: true, account: { status: "signedIn", user: { id: "account-1", expiresAt: "2026-09-23T10:10:00.000Z" } }, subscription: { status: "free", offers: [
      { plan: "two_year", price: "$120.00", priceMicros: 120_000_000, currency: "USD" },
      { plan: "five_year", price: "$240.00", priceMicros: 240_000_000, currency: "USD" }
    ] } });
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={pro} t={createTranslator("en")} />);
    expect(markup).toContain("$120.00");
    expect(markup).toContain("$240.00");
    expect(markup).toContain("5 years");
    expect(markup).toContain("2 years");
    expect(markup).toContain("One-time payment");
    expect(markup).not.toContain("Monthly");
    expect(markup).not.toContain("Yearly");
    expect(markup).toContain("Switch devices without starting over");
    expect(markup).toContain("Invite up to five people");
    expect(markup).toContain("Encrypted and still yours");
    expect(markup).toContain("Heritg Family+");
    expect(markup).toContain("Continue to secure payment");
    expect(markup).toContain("GoPay");
    expect(markup).toContain("DANA");
    expect(markup).toContain("BRI Direct Debit");
    expect(markup).toContain("provided by Xendit");
    expect(markup).not.toContain("Heritg Pro");
  });
});
