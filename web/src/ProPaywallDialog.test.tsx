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
    expect(markup).toContain("Subscriptions are not enabled in this deployment");
    expect(markup).toContain("disabled");
  });
  it("uses localized offer prices and calculated yearly savings", () => {
    const pro = context({ configured: true, account: { status: "signedIn", user: { id: "account-1", expiresAt: "2026-09-23T10:10:00.000Z" } }, subscription: { status: "free", offers: [
      { plan: "monthly", price: "$10.00", priceMicros: 10_000_000, currency: "USD" },
      { plan: "yearly", price: "$96.00", priceMicros: 96_000_000, currency: "USD" }
    ] } });
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={pro} t={createTranslator("en")} />);
    expect(markup).toContain("$10.00");
    expect(markup).toContain("$96.00");
    expect(markup).toContain("Save 20%");
    expect(markup).toContain("Choose Family Plan");
    expect(markup).not.toContain("Heritg Pro");
  });
});
