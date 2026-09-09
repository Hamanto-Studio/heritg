// @vitest-environment-options {"url":"https://staging.heritg.us"}
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProProvider, usePro } from "./ProProvider";
import { ProPaywallDialog } from "./ProPaywallDialog";
import { PaymentStatusNotice } from "./PaymentStatusNotice";
import { readBillingAttempt, saveBillingAttempt } from "./billingAttempt";
import { GOOGLE_IDENTITY_SCRIPT, type GoogleIdentity } from "./accountAuth";
import { createTranslator } from "./i18n";
import { unavailableProContext, type ProContextValue } from "./proTypes";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const t = createTranslator("en");
const accountId = 'A'.repeat(22);
const token = 'b'.repeat(43);
const account = { accountId, name: null, email: null, expiresAt: '2099-01-01T00:00:00Z' };
const offers = ([['six_month', 49000, 15, 6], ['yearly', 79000, 20, 12], ['three_year', 199000, 30, 36]] as const).map(([planId, amount, stagingAccessMinutes, accessMonths]) => ({
  planId, price: { amount, currency: 'IDR' }, stagingAccessMinutes, accessMonths, productId: 'family', name: 'Family+'
}));
let root: Root | undefined;
let host: HTMLDivElement;
let observed: ProContextValue = unavailableProContext;
const Probe = () => {
  const pro = usePro(); useEffect(() => { observed = pro; }, [pro]);
  return <><button onClick={pro.openPaywall}>Family+</button>{pro.paywallOpen ? <ProPaywallDialog pro={pro} t={t} /> : null}<PaymentStatusNotice pro={pro} t={t} /></>;
};
const mount = async () => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<ProProvider billingEnabled><Probe /></ProProvider>));
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
};
const clickText = async (text: string) => act(async () => {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent === text);
  expect(button, `Button ${text}`).toBeDefined(); button!.click();
});
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const entitlements = () => ({ ...account, appUserId: accountId, access: 'none', canRead: false, canWrite: false, expiresAt: null, graceEndsAt: null, offer: offers[0], offers });
afterEach(async () => {
  if (root) await act(async () => root!.unmount()); root = undefined; host?.remove();
  sessionStorage.clear(); document.cookie = 'heritg_csrf=; Max-Age=0; Path=/';
  document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)?.remove(); delete window.google;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it('Google sign-in runs directly inside checkout, preserving the chosen plan without auto-purchasing', async () => {
  vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
  vi.stubGlobal('__GOOGLE_CLIENT_ID__', '123456789012-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com');
  let callback: ((value: { credential: string }) => void) | undefined;
  window.google = { accounts: { id: {
    initialize: options => { callback = options.callback; },
    renderButton: element => { const b = document.createElement('button'); b.textContent = 'Continue with Google'; b.onclick = () => callback?.({ credential: 'synthetic-google-proof' }); element.append(b); },
    disableAutoSelect: vi.fn(),
  } } } as GoogleIdentity;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/billing/plans')) return json({ offers });
    if (url.endsWith('/login-nonce')) return json({ nonce: token, state: 'c'.repeat(43), expiresAt: '2099-01-01T00:00:00Z' });
    if (url.endsWith('/auth/google')) { document.cookie = `heritg_csrf=${token}; Path=/`; return json({ ...account, csrfToken: token }); }
    if (url.endsWith('/auth/session')) return json(account);
    if (url.endsWith('/entitlements/current')) return json(entitlements());
    if (url.endsWith('/checkouts/pending')) return json({ status: 'not_found' });
    throw new Error('Unexpected test request');
  });
  vi.stubGlobal('fetch', fetcher); await mount(); await clickText('Family+');
  await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
  await act(async () => host.querySelector<HTMLInputElement>('input[value=three_year]')!.click());
  await clickText('Continue with Google');
  await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
  expect(host.querySelector('.modal-card')).not.toBeNull();
  expect(host.querySelector('.account-settings')).toBeNull();
  expect(host.querySelector<HTMLInputElement>('input[value=three_year]')!.checked).toBe(true);
  expect(host.querySelector('.pro-purchase-button')?.textContent).toContain('199.000');
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/auth/google'))).toHaveLength(1);
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/billing/checkouts'))).toBe(false);
});

it('finds an existing payment after session-storage loss without creating another invoice or showing a persistent banner', async () => {
  vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
  document.cookie = `heritg_csrf=${token}; Path=/`;
  const recoveryKey = `recovery_${'a'.repeat(64)}`;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/session')) return json(account);
    if (url.endsWith('/checkouts/pending')) return json({ status: 'pending', recoveryKey, planId: 'three_year', resumable: true, cancellable: true });
    if (url.endsWith('/status')) return json({ status: 'pending', planId: 'three_year', resumable: true });
    return json(entitlements());
  });
  vi.stubGlobal('fetch', fetcher); await mount();
  expect(readBillingAttempt()?.idempotencyKey).toBe(recoveryKey);
  expect(host.querySelector('.payment-status-notice')).toBeNull();
  await clickText('Family+');
  expect(host.textContent).toContain('Resume payment');
  expect(host.querySelector<HTMLButtonElement>('.pro-purchase-button')!.disabled).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/billing/checkouts'))).toBe(false);
});

it('dismissal survives provider remount while the pending checkout stays accessible in Family+', async () => {
  vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
  document.cookie = `heritg_csrf=${token}; Path=/`;
  saveBillingAttempt({ accountId, idempotencyKey: 'synthetic-recovery-key', planId: 'three_year', createdAt: Date.now() });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/session') ? json(account) : String(input).endsWith('/status') ? json({ status: 'pending', planId: 'three_year', resumable: true }) : json(entitlements())));
  await mount(); await act(async () => observed.refreshPayment?.());
  await act(async () => observed.dismissPayment?.());
  expect(readBillingAttempt()?.noticeHidden).toBe(true);
  expect(host.querySelector('.payment-status-notice')).toBeNull();
  await act(async () => root!.unmount()); root = undefined; host.remove();
  await mount(); expect(host.querySelector('.payment-status-notice')).toBeNull();
  await clickText('Family+');
  expect(host.textContent).toContain('Resume payment');
  expect(host.textContent).toContain('Cancel payment');
  expect(readBillingAttempt()?.idempotencyKey).toBe('synthetic-recovery-key');
});

it('a plan change requires confirmed cancellation, preserves selection and never automatically creates a replacement', async () => {
  vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
  document.cookie = `heritg_csrf=${token}; Path=/`;
  saveBillingAttempt({ accountId, idempotencyKey: 'synthetic-recovery-key', planId: 'three_year', createdAt: Date.now(), noticeHidden: true });
  let cancelled = false;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/session')) return json(account);
    if (url.endsWith('/status')) return json({ status: 'pending', planId: 'three_year', resumable: true });
    if (url.endsWith('/cancel')) return json({ status: cancelled ? 'cancelled' : 'pending' });
    return json(entitlements());
  });
  vi.stubGlobal('fetch', fetcher); await mount(); await clickText('Family+');
  await act(async () => host.querySelector<HTMLInputElement>('input[value=yearly]')!.click());
  expect(host.textContent).toContain('Cancel the pending checkout first');
  await clickText('Cancel payment'); await clickText('Yes, cancel checkout');
  expect(readBillingAttempt()).toBeDefined();
  expect(host.querySelector<HTMLButtonElement>('.pro-purchase-button')!.disabled).toBe(true);
  cancelled = true; await clickText('Yes, cancel checkout');
  expect(readBillingAttempt()).toBeUndefined();
  expect(host.querySelector<HTMLInputElement>('input[value=yearly]')!.checked).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('.pro-purchase-button')!.disabled).toBe(false);
  expect(host.querySelector('.pro-purchase-button')!.textContent).toContain('79.000');
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/billing/checkouts'))).toBe(false);
});
