import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "./i18n";
import { ProPaywallDialog } from "./ProPaywallDialog";
import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";

const context = (overrides: Partial<ProContextValue> = {}): ProContextValue => ({ ...unavailableProContext, closePaywall: vi.fn(), purchase: vi.fn(async () => undefined), ...overrides });
describe("ProPaywallDialog", () => {
  it("selects every server-priced plan and submits only its ID with clear sandbox durations", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const offers = ([['weekly', 9000, 10], ['monthly', 15000, 15], ['yearly', 79000, 20], ['two_year', 120000, 30]] as const).map(([planId, amount, stagingAccessMinutes]) => ({
      planId, productId: `family-${planId}`, name: 'Family+', price: { amount, currency: 'IDR' }, accessMonths: 0, stagingAccessMinutes, renewal: 'manual' as const
    }));
    const purchase = vi.fn(async () => undefined);
    const pro = context({ configured: true, offers, purchase, account: { status: 'signedIn', user: { id: 'synthetic', name: null, email: null, expiresAt: '2099-01-01' } }, subscription: { status: 'free', offer: offers[0] } });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<ProPaywallDialog pro={pro} t={createTranslator('en')} />));
      expect(host.textContent).toContain('No automatic charges');
      expect(host.textContent).toContain('Sandbox only');
      expect(host.textContent).not.toContain('Infinity');
      for (const plan of offers) {
        expect(host.textContent).toContain(`Active for ${plan.stagingAccessMinutes} minutes in staging`);
        await act(async () => host.querySelector<HTMLInputElement>(`input[value="${plan.planId}"]`)!.click());
        await act(async () => host.querySelector<HTMLButtonElement>('.pro-purchase-button')!.click());
        expect(purchase).toHaveBeenLastCalledWith(plan.planId);
        expect(host.querySelector('.pro-purchase-button')?.textContent).toContain(new Intl.NumberFormat('id-ID').format(plan.price.amount));
      }
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
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
    expect(markup).toContain("Continue on another device");
    expect(markup).toContain("Encrypted and still yours");
    expect(markup).toContain("Heritg Family+");
    expect(markup).toContain("Continue to secure payment");
    expect(markup).toContain("Terms of Use (EULA)");
    expect(markup).toContain('href="/terms/"');
    expect(markup).toContain("Privacy Policy");
    expect(markup).toContain("https://family.heritg.us/privacy/");
    expect(markup).not.toContain("5 years");
    expect(markup).not.toContain("2 years");
    expect(markup).not.toContain("Xendit");
    expect(markup).not.toContain("Heritg Pro");
  });

  it("shows one month free access without payment copy", () => {
    const pro = context({ configured: true, account: { status: "signedIn", user: { id: "account-1", name: null, email: null, expiresAt: "2026-09-23T10:10:00.000Z" } }, subscription: { status: "free", offer: {
      productId: "heritg_family_preservation",
      name: "HERITG Family Preservation",
      price: { amount: 0, currency: "IDR" },
      accessMonths: 1
    } } });
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={pro} t={createTranslator("en")} />);
    expect(markup).toContain("One month of Family+ free access");
    expect(markup).toContain("No payment required");
    expect(markup).toContain("Claim one month free");
    expect(markup).toContain("Claim again after access expires");
    expect(markup).not.toContain("Continue to secure payment");
    expect(markup).not.toContain("One-time payment");
  });

  it("does not offer another claim while access is active", () => {
    const pro = context({ configured: true, account: { status: "signedIn", user: { id: "account-1", name: null, email: null, expiresAt: "2026-09-23T10:10:00.000Z" } }, subscription: { status: "active", offer: {
      productId: "heritg_family_preservation", name: "HERITG Family Preservation",
      price: { amount: 0, currency: "IDR" }, accessMonths: 1
    } } });
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={pro} t={createTranslator("en")} />);
    expect(markup).toContain(">Active</button>");
    expect(markup).toContain("disabled");
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
