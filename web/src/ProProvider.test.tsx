// @vitest-environment-options {"url":"https://staging.heritg.us"}
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSyncError } from "./accountSync";
import { ProProvider, requestBillingCheckout, requestFreeAccess, subscriptionFromEntitlement, syncFailureMessage, validatedPaymentLink, usePro, type EntitlementResponse } from "./ProProvider";
import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";
import { saveBillingAttempt } from "./billingAttempt";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const Probe = () => { const pro = usePro(); return <span>{`${pro.configured}:${pro.account.status}:${pro.subscription.status}:${pro.sync.phase}`}</span>; };
const PurchaseProbe = () => {
  const pro = usePro();
  return <button onClick={() => void pro.purchase()} type="button">{pro.subscription.status}</button>;
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

  afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  document.cookie = "heritg_csrf=; Max-Age=0; Path=/";
  localStorage.removeItem("heritg:family-sync-enabled");
  sessionStorage.removeItem("heritg:pending-checkout");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const offer = {
  productId: "family-24m",
  name: "Family+",
  price: { amount: 120_000, currency: "IDR" },
  accessMonths: 24
};

const entitlement = (overrides: Partial<EntitlementResponse> = {}): EntitlementResponse => ({
  appUserId: "A".repeat(22),
  entitlementId: "family",
  plan: "free",
  access: "none",
  canRead: false,
  canWrite: false,
  expiresAt: null,
  graceEndsAt: null,
  checkedAt: "2026-08-24T00:00:00Z",
  managementUrl: null,
  offer,
  ...overrides
});

describe("ProProvider", () => {
  it('submits only the selected plan identifier, never an amount or duration', async () => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ paymentLinkUrl: 'https://sandbox.doku.com/checkout-link-v2/synthetic' })));
    vi.stubGlobal('fetch', fetchMock);
    await requestBillingCheckout('A'.repeat(22), 'synthetic-csrf', 'synthetic-retry-key', 'weekly');
    expect(fetchMock.mock.calls[0]).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/billing/checkouts', expect.objectContaining({ body: '{"planId":"weekly"}' }));
  });

  it('expires active cloud access at the deadline even if the refresh is offline', async () => {
    vi.useFakeTimers();
    const start = new Date('2026-09-08T12:00:00Z');
    vi.setSystemTime(start);
    document.cookie = `heritg_csrf=${'c'.repeat(43)}; Path=/`;
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/billing/plans')) return Response.json({ offers: [] });
      if (String(input).endsWith('/billing/checkouts/pending')) return Response.json({ status: 'not_found' });
      if (String(input).endsWith('/auth/session')) return new Response(JSON.stringify({ accountId: 'A'.repeat(22), name: null, email: null, expiresAt: '2026-09-24T00:00:00Z' }));
      reads++;
      if (reads > 1) throw new Error('offline');
      return new Response(JSON.stringify(entitlement({ access: 'active', canRead: true, canWrite: true, expiresAt: new Date(start.getTime() + 10 * 60_000).toISOString() })));
    }));
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<ProProvider billingEnabled><Probe /></ProProvider>));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(container.textContent).toContain('signedIn:active');
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(container.textContent).toContain('signedIn:expired:subscriptionRequired');
    expect(reads).toBe(2);
  });
  it.each(["sandbox.doku.com", "staging.doku.com"])("accepts verified sandbox checkout host %s", async (host) => {
    vi.stubGlobal("__DEPLOYMENT_ENV__", "staging");
    const paymentLinkUrl = `https://${host}/checkout-link-v2/synthetic`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ paymentLinkUrl }), { status: 201 })));
    expect(await requestBillingCheckout("synthetic-account", "synthetic-csrf", "synthetic-idempotency")).toBe(paymentLinkUrl);
  });

  it.each([
    "https://staging.doku.com.attacker.test/checkout-link-v2/synthetic",
    "https://staging.doku.com/other", "https://doku.com/checkout-link-v2/synthetic",
    "http://staging.doku.com/checkout-link-v2/synthetic",
    "https://staging.doku.com:8443/checkout-link-v2/synthetic",
    "https://user:pass@staging.doku.com/checkout-link-v2/synthetic",
    "https://staging.doku.com/checkout-link-v2/synthetic#fragment"
  ])("rejects an unsafe sandbox checkout URL: %s", async (paymentLinkUrl) => {
    vi.stubGlobal("__DEPLOYMENT_ENV__", "staging");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ paymentLinkUrl }), { status: 201 })));
    await expect(requestBillingCheckout("synthetic-account", "synthetic-csrf", "synthetic-idempotency")).rejects.toThrow();
  });

  it("confirms only the same checkout's durable completion, not an already-active subscription", async () => {
    document.cookie = `heritg_csrf=${"c".repeat(43)}; Path=/`;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    saveBillingAttempt({ accountId: "A".repeat(22), idempotencyKey: "synthetic-checkout-key", createdAt: Date.now() });
    let completed = false;
    let observed: ProContextValue = unavailableProContext;
    const PaymentProbe = () => { const pro = usePro(); useEffect(() => { observed = pro; }, [pro]); return <span>{pro.payment?.status}</span>; };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return new Response(JSON.stringify({ accountId: "A".repeat(22), name: null, email: null, expiresAt: "2026-10-01T00:00:00Z" }));
      if (path.endsWith("/entitlements/current")) return new Response(JSON.stringify(entitlement({ access: "active", canRead: true, canWrite: true, expiresAt: completed ? "2030-09-08T00:00:00Z" : "2028-09-08T00:00:00Z" })));
      if (path.endsWith("/billing/checkouts/status")) return new Response(JSON.stringify({ status: completed ? "completed" : "pending" }));
      throw new Error("Unexpected synthetic request");
    }));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(<ProProvider billingEnabled><PaymentProbe /></ProProvider>));
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
    await act(async () => observed.refreshPayment?.());
    expect(observed.subscription.status).toBe("active");
    expect(container.textContent).toBe("pending");
    completed = true;
    await act(async () => observed.refreshPayment?.());
    expect(container.textContent).toBe("confirmed");
    expect(observed.subscription).toMatchObject({ status: "active", expiresAt: "2030-09-08T00:00:00Z" });
    expect(sessionStorage.getItem("heritg:pending-checkout")).toBeNull();
  });
  it("shows safe transport diagnostics only in staging", () => {
    const error = new AccountSyncError(502, "invalid_response");
    expect(syncFailureMessage(error, true)).toBe("Family synchronization failed. Sync diagnostic: stage=response, code=invalid_response, http=502.");
    expect(syncFailureMessage(error, false)).toBe("Family synchronization could not be completed.");
    expect(syncFailureMessage(new Error("Failed to fetch"), true)).toBe("Failed to fetch");
  });

  it("fails closed without deployment configuration", () => {
    expect(renderToStaticMarkup(<ProProvider><Probe /></ProProvider>)).toContain("false:signedOut:unavailable:unavailable");
  });
  it("accepts authoritative state injection without local entitlement persistence", () => {
    const value: ProContextValue = { ...unavailableProContext, configured: true, account: { status: "signedIn", user: { id: "account-1", name: null, email: null, expiresAt: "2026-09-23T10:10:00.000Z" } }, subscription: { status: "active" }, sync: { enabled: true, phase: "syncing", pendingChanges: 1 } };
    expect(renderToStaticMarkup(<ProProvider value={value}><Probe /></ProProvider>)).toContain("true:signedIn:active:syncing");
  });

  it("maps access and server timestamps without consulting the plan", () => {
    expect(subscriptionFromEntitlement(entitlement({
      plan: "free",
      access: "read_only",
      expiresAt: "2026-08-24T00:00:00Z",
      graceEndsAt: "2026-11-24T00:00:00Z"
    }))).toMatchObject({
      status: "readOnly",
      expiresAt: "2026-08-24T00:00:00Z",
      graceEndsAt: "2026-11-24T00:00:00Z"
    });
    expect(subscriptionFromEntitlement(entitlement({
      plan: "family",
      access: "none",
      expiresAt: "2026-08-24T00:00:00Z"
    }))).toMatchObject({ status: "expired", expiresAt: "2026-08-24T00:00:00Z" });
    expect(subscriptionFromEntitlement(entitlement({ plan: "family", access: "none" })))
      .toMatchObject({ status: "free" });
  });

  it("refreshes authoritative entitlement when the app returns to the foreground", async () => {
    document.cookie = `heritg_csrf=${"c".repeat(43)}; Path=/`;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return new Response(JSON.stringify({
        accountId: "A".repeat(22),
        name: null,
        email: null,
        expiresAt: "2026-09-24T00:00:00Z"
      }));
      if (path.endsWith("/entitlements/refresh")) return new Response("{}", { status: 200 });
      if (path.endsWith("/entitlements/current")) return new Response(JSON.stringify(entitlement({
        access: "active",
        canRead: true,
        canWrite: true,
        expiresAt: "2028-08-24T00:00:00Z"
      })));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<ProProvider billingEnabled><Probe /></ProProvider>));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)));
    expect(container.textContent).toContain("true:signedIn:active");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });
    expect(fetchMock.mock.calls.filter(([request]) => String(request).endsWith("/entitlements/current")))
      .toHaveLength(2);
  });

  it("shows immediate mock activation instead of redirecting after checkout", async () => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'staging');
    document.cookie = `heritg_csrf=${"c".repeat(43)}; Path=/`;
    let entitlementRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/billing/plans')) return Response.json({ offers: [] });
      if (path.endsWith('/billing/checkouts/pending')) return Response.json({ status: 'not_found' });
      if (path.endsWith("/auth/session")) return new Response(JSON.stringify({
        accountId: "A".repeat(22),
        name: null,
        email: null,
        expiresAt: "2026-09-24T00:00:00Z"
      }));
      if (path.endsWith("/billing/checkouts")) return new Response(JSON.stringify({
        paymentLinkUrl: `${window.location.origin}/billing/return`
      }), { status: 201 });
      if (path.endsWith("/entitlements/refresh")) return new Response("{}", { status: 200 });
      if (path.endsWith("/entitlements/current")) {
        entitlementRequests += 1;
        return new Response(JSON.stringify(entitlementRequests === 1
          ? entitlement()
          : entitlement({ access: "active", canRead: true, canWrite: true, expiresAt: "2026-08-24T00:05:00Z" })));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<ProProvider billingEnabled><PurchaseProbe /></ProProvider>));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)));
    expect(container.textContent).toBe("free");

    await act(async () => {
      container?.querySelector("button")?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });
    expect(container.textContent).toBe("active");
    expect(entitlementRequests).toBe(2);
  });

  it("claims one month free without requesting a billing checkout", async () => {
    document.cookie = `heritg_csrf=${"c".repeat(43)}; Path=/`;
    const freeOffer = { ...offer, price: { amount: 0, currency: "IDR" }, accessMonths: 1 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return new Response(JSON.stringify({
        accountId: "A".repeat(22), name: null, email: null, expiresAt: "2026-09-24T00:00:00Z"
      }));
      if (path.endsWith("/entitlements/refresh")) return new Response("{}", { status: 200 });
      if (path.endsWith("/entitlements/current")) return new Response(JSON.stringify(entitlement({ offer: freeOffer })));
      if (path.endsWith("/entitlements/free-access")) return new Response(JSON.stringify(entitlement({
        plan: "family", access: "active", canRead: true, canWrite: true,
        expiresAt: "2026-09-24T00:00:00Z", offer: freeOffer
      })));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<ProProvider billingEnabled><PurchaseProbe /></ProProvider>));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)));
    expect(container.textContent).toBe("free");
    await act(async () => {
      container?.querySelector("button")?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });

    expect(container.textContent).toBe("active");
    expect(fetchMock.mock.calls.some(([request]) => String(request).endsWith("/entitlements/free-access"))).toBe(true);
    expect(fetchMock.mock.calls.some(([request]) => String(request).endsWith("/billing/checkouts"))).toBe(false);
  });

  it("keeps synchronization disabled across a session reload", async () => {
    localStorage.setItem("heritg:family-sync-enabled", "false");
    document.cookie = `heritg_csrf=${"c".repeat(43)}; Path=/`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return new Response(JSON.stringify({
        accountId: "A".repeat(22), name: null, email: null, expiresAt: "2026-09-24T00:00:00Z"
      }));
      if (path.endsWith("/entitlements/current")) return new Response(JSON.stringify(entitlement({
        access: "active", canRead: true, canWrite: true, expiresAt: "2026-09-24T00:00:00Z"
      })));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<ProProvider billingEnabled><Probe /></ProProvider>));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)));
    expect(container.textContent).toContain("active:disabled");
    localStorage.removeItem("heritg:family-sync-enabled");
  });

  it("preserves an explicit synchronization opt-out when free access is renewed", async () => {
    localStorage.setItem("heritg:family-sync-enabled", "false");
    document.cookie = `heritg_csrf=${"c".repeat(43)}; Path=/`;
    const freeOffer = { ...offer, price: { amount: 0, currency: "IDR" }, accessMonths: 1 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return new Response(JSON.stringify({
        accountId: "A".repeat(22), name: null, email: null, expiresAt: "2026-09-24T00:00:00Z"
      }));
      if (path.endsWith("/entitlements/current")) return new Response(JSON.stringify(entitlement({ offer: freeOffer })));
      if (path.endsWith("/entitlements/free-access")) return new Response(JSON.stringify(entitlement({
        plan: "family", access: "active", canRead: true, canWrite: true,
        expiresAt: "2026-09-24T00:00:00Z", offer: freeOffer
      })));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<ProProvider billingEnabled><PurchaseProbe /></ProProvider>));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)));
    await act(async () => {
      container?.querySelector("button")?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });
    expect(localStorage.getItem("heritg:family-sync-enabled")).toBe("false");
  });

  it("claims free access with the account and CSRF contract", async () => {
    const response = entitlement({ access: "active", canRead: true, canWrite: true });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestFreeAccess("account-1", "csrf-token")).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/entitlements/free-access", expect.objectContaining({
      body: "{}",
      method: "POST",
      headers: expect.objectContaining({ "x-csrf-token": "csrf-token", "x-heritg-account-id": "account-1" })
    }));
  });

  it("creates checkout with the backend contract and returns its payment URL", async () => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'production');
    const testIdempotencyKey = "i".repeat(16);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ paymentLinkUrl: "https://jokul.doku.com/checkout-link-v2/synthetic" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestBillingCheckout("account-1", "csrf-token", testIdempotencyKey))
      .resolves.toBe("https://jokul.doku.com/checkout-link-v2/synthetic");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/billing/checkouts", expect.objectContaining({
      body: "{}",
      method: "POST",
      headers: expect.objectContaining({
        "idempotency-key": testIdempotencyKey,
        "x-csrf-token": "csrf-token",
        "x-heritg-account-id": "account-1"
      })
    }));
  });

  it('restricts production checkout and resume links to live DOKU', () => {
    vi.stubGlobal('__DEPLOYMENT_ENV__', 'production');
    expect(validatedPaymentLink('https://jokul.doku.com/checkout-link-v2/synthetic')).toContain('jokul.doku.com');
    for (const url of ['https://sandbox.doku.com/checkout-link-v2/synthetic', 'https://staging.doku.com/checkout-link-v2/synthetic', 'https://evil.test/pay', 'https://jokul.doku.com.evil.test/checkout-link-v2/synthetic', 'https://heritg.us/billing/return']) {
      expect(() => validatedPaymentLink(url)).toThrow();
    }
  });

  it("surfaces the backend checkout failure message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "service_unavailable", message: "Payments are unavailable" }
    }), { status: 503 })));

    await expect(requestBillingCheckout("account-1", "csrf-token", "idempotency-key-2"))
      .rejects.toThrow("Payments are unavailable");
  });
});
