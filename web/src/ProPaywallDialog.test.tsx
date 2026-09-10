import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "./i18n";
import { ProPaywallDialog } from "./ProPaywallDialog";
import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";

const context = (overrides: Partial<ProContextValue> = {}): ProContextValue => ({ ...unavailableProContext, closePaywall: vi.fn(), purchase: vi.fn(async () => undefined), ...overrides });
const prepaidOffers = ([['six_month', 49000, 15, 6], ['yearly', 79000, 20, 12], ['three_year', 199000, 30, 36]] as const).map(([planId, amount, stagingAccessMinutes, accessMonths]) => ({
  planId, productId: `family-${planId}`, name: 'Family+', price: { amount, currency: 'IDR' }, accessMonths, stagingAccessMinutes, renewal: 'manual' as const
}));
describe("ProPaywallDialog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers a sign-in action and never starts checkout before authentication', async () => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const pro = context({ configured: true, offers: prepaidOffers });
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<ProPaywallDialog pro={pro} t={createTranslator('en')} />));
      expect(host.querySelector('.checkout-sign-in')).not.toBeNull();
      expect(host.querySelector('.account-settings')).toBeNull();
      expect(pro.closePaywall).not.toHaveBeenCalled();
      expect(pro.purchase).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });

  it('blocks a second purchase while payment status is pending', () => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
    const pro = context({ configured: true, offers: prepaidOffers,
      account: { status: 'signedIn', user: { id: 'synthetic', name: null, email: null, expiresAt: '2099-01-01' } },
      payment: { status: 'pending', checking: false } });
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={pro} t={createTranslator('en')} />);
    expect(markup).toContain('Resume payment');
    expect(markup).toContain('Cancel payment');
    expect(markup).toContain('Check payment');
    expect(markup).toMatch(/pro-purchase-button[^>]*disabled/);
  });

  it.each(["signedOut", "loading", "error", "signedIn"] as const)("shows the staging prices with account state %s, without invoking checkout", async status => {
    vi.stubGlobal("__DEPLOYMENT_ENV__", "staging");
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const purchase = vi.fn(async () => undefined);
    const closePaywall = vi.fn();
    const account: ProContextValue["account"] = status === "signedIn"
      ? { status, user: { id: "synthetic", name: null, email: null, expiresAt: "2099-01-01" } }
      : status === "error" ? { status, message: "Service unavailable" } : { status };
    const pro = context({ configured: true, account, purchase, closePaywall, offers: prepaidOffers });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<ProPaywallDialog pro={pro} t={createTranslator("en")} />));
      expect(Array.from(host.querySelectorAll("input[type=radio]"), item => (item as HTMLInputElement).value)).toEqual(["six_month", "yearly", "three_year"]);
      for (const price of ["49.000", "79.000", "199.000", "8.200", "6.600", "5.500"]) expect(host.textContent).toContain(price);
      expect(host.textContent).toContain("No recurring invoices or automatic charges");
      expect(host.textContent).not.toContain("purchases not available yet");
      expect(host.textContent).not.toContain("Sign in to load the current price");
      if (status === "signedIn") expect((host.querySelector(".pro-purchase-button") as HTMLButtonElement).disabled).toBe(false);
      else expect(host.querySelector('.checkout-sign-in')).not.toBeNull();
      const benefits = host.querySelector(".family-plus-benefits")!;
      expect(benefits.closest("details")).toBeNull();
      expect(benefits.textContent).toContain("Included with Family+");
      expect(benefits.compareDocumentPosition(host.querySelector(".pro-plan-picker")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(host.querySelectorAll(".family-plus-benefits")).toHaveLength(1);
      expect(purchase).not.toHaveBeenCalled();
      await act(async () => host.querySelector<HTMLButtonElement>('.modal-header button')!.click());
      expect(closePaywall).toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });

  it("localizes the public staging preview and separates test timers from real periods", () => {
    vi.stubGlobal("__DEPLOYMENT_ENV__", "staging");
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={context({ offers: prepaidOffers })} t={createTranslator("id")} />);
    expect(markup).toContain("3 tahun");
    for (const duration of [15, 20, 30]) expect(markup).toContain(`${duration} menit`);
    expect(markup).toContain("Tanpa tagihan berulang atau pendebitan otomatis");
  });

  it.each(['en', 'id'] as const)('keeps upfront totals primary with monthly equivalents as supporting context in %s', language => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(<ProPaywallDialog pro={context({ offers: prepaidOffers })} t={createTranslator(language)} />);
    const rows = host.querySelectorAll('.pro-plan-choices label');
    const monthly = ['8.200', '6.600', '5.500'];
    const totals = ['49.000', '79.000', '199.000'];
    rows.forEach((row, index) => {
      expect(row.querySelector('.pro-plan-monthly [aria-hidden]')?.textContent?.replace(/\s/g, '')).toBe(`${language === 'en' ? 'About' : 'Sekitar'}Rp${monthly[index]}/${language === 'en' ? 'month' : 'bulan'}`);
      expect(row.querySelector('.pro-plan-monthly .sr-only')?.textContent).toContain(language === 'en' ? 'About' : 'Sekitar');
      expect(row.querySelector('.pro-plan-total')?.textContent).toContain(totals[index]);
      expect(row.querySelector('.pro-plan-payment-kind')?.textContent).toBe(language === 'en' ? 'One-time payment' : 'Sekali bayar');
      expect(row.querySelector('.pro-plan-pricing')?.firstElementChild).toBe(row.querySelector('.pro-plan-total'));
      expect(row.querySelector('.pro-plan-total')?.tagName).toBe('STRONG');
      expect(row.querySelector('.pro-plan-monthly')?.tagName).toBe('SPAN');
      expect(row.querySelector('.pro-plan-payment-kind')?.nextElementSibling).toBe(row.querySelector('.pro-plan-monthly'));
    });
    expect(host.querySelector('.pro-plan-price-explanation')?.textContent).toContain(language === 'en' ? 'for comparison' : 'sebagai perbandingan');
  });

  it('derives the comparison from server price and calendar months, never shortened staging minutes', () => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
    const offers = [{ ...prepaidOffers[0], price: { amount: 60_000, currency: 'IDR' }, stagingAccessMinutes: 1 }];
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={context({ offers })} t={createTranslator('en')} />);
    expect(markup).toContain('10.000/month');
    expect(markup).toContain('60.000</strong>');
    expect(markup).toContain('One-time payment');
    expect(markup).not.toContain('8.200');
  });

  it.each([
    [48_894, '8.100'], [48_900, '8.200'], [48_000, '8.000'], [180, '30']
  ] as const)('rounds only the IDR comparison for total %s, preserving the exact price', (amount, monthly) => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
    const offers = [{ ...prepaidOffers[0], price: { amount, currency: 'IDR' } }];
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(<ProPaywallDialog pro={context({ offers })} t={createTranslator('en')} />);
    expect(host.querySelector('.pro-plan-monthly [aria-hidden]')?.textContent?.replace(/\s/g, '')).toBe(`AboutRp${monthly}/month`);
    expect(host.querySelector('.pro-plan-total')?.textContent?.replace(/\s/g, '')).toBe(`Rp${new Intl.NumberFormat('id-ID').format(amount)}`);
  });

  it('does not apply rupiah rounding to other currencies', () => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
    const offers = [{ ...prepaidOffers[0], price: { amount: 59, currency: 'USD' } }];
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(<ProPaywallDialog pro={context({ offers })} t={createTranslator('en')} />);
    expect(host.querySelector('.pro-plan-monthly [aria-hidden]')?.textContent).toBe('About $9.83/month');
    expect(host.querySelector('.pro-plan-total')?.textContent).toBe('$59.00');
  });

  it.each([0, -1, Infinity, NaN])('does not invent a monthly price with invalid month duration %s', accessMonths => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
    const offers = [{ ...prepaidOffers[0], accessMonths }];
    const markup = renderToStaticMarkup(<ProPaywallDialog pro={context({ offers })} t={createTranslator('en')} />);
    expect(markup).not.toContain('pro-plan-monthly');
    expect(markup).toContain('49.000</strong>');
    expect(markup).toContain('One-time payment');
  });
  it("selects every server-priced plan and submits only its ID with clear sandbox durations", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal("__DEPLOYMENT_ENV__", "staging");
    const offers = prepaidOffers;
    const purchase = vi.fn(async () => undefined);
    const pro = context({ configured: true, offers, purchase, account: { status: 'signedIn', user: { id: 'synthetic', name: null, email: null, expiresAt: '2099-01-01' } }, subscription: { status: 'free', offer: offers[0] } });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<ProPaywallDialog pro={pro} t={createTranslator('en')} />));
      expect(host.textContent).toContain('No recurring invoices or automatic charges');
      expect(host.textContent).toContain('Sandbox only');
      expect(host.textContent).not.toContain('Infinity');
      const benefits = host.querySelector('.family-plus-benefits')!;
      expect(benefits.closest('details')).toBeNull();
      expect(benefits.compareDocumentPosition(host.querySelector('.pro-plan-picker')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
