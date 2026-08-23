import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProProvider, requestBillingCheckout, usePro } from "./ProProvider";
import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";

const Probe = () => { const pro = usePro(); return <span>{`${pro.configured}:${pro.account.status}:${pro.subscription.status}:${pro.sync.phase}`}</span>; };

afterEach(() => vi.unstubAllGlobals());

describe("ProProvider", () => {
  it("fails closed without deployment configuration", () => {
    expect(renderToStaticMarkup(<ProProvider><Probe /></ProProvider>)).toContain("false:signedOut:unavailable:unavailable");
  });
  it("accepts authoritative state injection without local entitlement persistence", () => {
    const value: ProContextValue = { ...unavailableProContext, configured: true, account: { status: "signedIn", user: { id: "account-1", name: null, email: null, expiresAt: "2026-09-23T10:10:00.000Z" } }, subscription: { status: "active" }, sync: { enabled: true, phase: "syncing", pendingChanges: 1 } };
    expect(renderToStaticMarkup(<ProProvider value={value}><Probe /></ProProvider>)).toContain("true:signedIn:active:syncing");
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
