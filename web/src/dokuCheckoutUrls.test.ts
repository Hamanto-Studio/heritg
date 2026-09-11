import { afterEach, describe, expect, it, vi } from "vitest";
import contract from "./__fixtures__/doku-checkout-urls.json";
import { requestBillingCheckout, validatedPaymentLink } from "./ProProvider";

// Byte-identical to heritg-be/test/fixtures/doku-checkout-urls.json.
afterEach(() => vi.unstubAllGlobals());

describe.each(["production", "staging"])("shared DOKU URL contract: %s", environment => {
  it.each(contract.cases)("$name", ({ url, environments }) => {
    vi.stubGlobal("__DEPLOYMENT_ENV__", environment);
    if (environments.includes(environment)) {
      expect(validatedPaymentLink(url)).toBe(url);
    } else {
      expect(() => validatedPaymentLink(url)).toThrow();
    }
  });

  it("keeps the 4096-character boundary aligned with the backend", () => {
    vi.stubGlobal("__DEPLOYMENT_ENV__", environment);
    const prefix = `https://${environment === "production" ? "checkout" : "staging"}.doku.com/checkout-link-v2/`;
    const maxUrl = prefix + "a".repeat(4096 - prefix.length);
    expect(validatedPaymentLink(maxUrl)).toBe(maxUrl);
    expect(() => validatedPaymentLink(maxUrl + "a")).toThrow();
  });
});

it("passes the observed live response through checkout without changing the destination or terms", async () => {
  vi.stubGlobal("__DEPLOYMENT_ENV__", "production");
  const paymentLinkUrl = contract.cases.find(test => test.name === "observed-live-v2")!.url;
  const fetcher = vi.fn(async () => Response.json({ paymentLinkUrl }, { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(requestBillingCheckout("synthetic-account", "synthetic-csrf", "synthetic-idempotency", "three_year"))
    .resolves.toBe(paymentLinkUrl);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/v1/billing/checkouts", expect.objectContaining({
    body: '{"planId":"three_year"}'
  }));
});
