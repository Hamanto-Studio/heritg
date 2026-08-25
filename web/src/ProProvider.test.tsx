import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProProvider, requestBillingCheckout, subscriptionFromEntitlement, usePro, type EntitlementResponse } from "./ProProvider";
import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    expect(fetchMock.mock.calls.filter(([request]) => String(request).endsWith("/entitlements/refresh")))
      .toHaveLength(2);
  });

  it("shows immediate mock activation instead of redirecting after checkout", async () => {
    document.cookie = `heritg_csrf=${"c".repeat(43)}; Path=/`;
    let entitlementRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return new Response(JSON.stringify({
        accountId: "A".repeat(22),
        name: null,
        email: null,
        expiresAt: "2026-09-24T00:00:00Z"
      }));
      if (path.endsWith("/billing/checkouts")) return new Response(JSON.stringify({
        paymentLinkUrl: "https://checkout.flip.test/pay"
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

  it("creates checkout with the backend contract and returns its payment URL", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ paymentLinkUrl: "https://checkout.flip.test/pay" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestBillingCheckout("account-1", "csrf-token", "idempotency-key-1"))
      .resolves.toBe("https://checkout.flip.test/pay");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/billing/checkouts", expect.objectContaining({
      body: "{}",
      method: "POST",
      headers: expect.objectContaining({
        "idempotency-key": "idempotency-key-1",
        "x-csrf-token": "csrf-token",
        "x-heritg-account-id": "account-1"
      })
    }));
  });

  it("surfaces the backend checkout failure message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "service_unavailable", message: "Payments are unavailable" }
    }), { status: 503 })));

    await expect(requestBillingCheckout("account-1", "csrf-token", "idempotency-key-2"))
      .rejects.toThrow("Payments are unavailable");
  });
});
