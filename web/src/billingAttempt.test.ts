import { afterEach, expect, it } from "vitest";
import { clearBillingAttempt, readBillingAttempt, saveBillingAttempt } from "./billingAttempt";

afterEach(clearBillingAttempt);
it("retains only retry correlation, never payment credentials or entitlement", () => {
  const attempt = { accountId: "A".repeat(22), idempotencyKey: "synthetic-attempt-key", createdAt: Date.now() };
  saveBillingAttempt(attempt);
  expect(readBillingAttempt()).toEqual(attempt);
  clearBillingAttempt();
  expect(readBillingAttempt()).toBeUndefined();
});
it("fails safely on malformed browser storage", () => {
  for (const value of ["{", "null", "[]", JSON.stringify({ accountId: "bad", idempotencyKey: 12 })]) {
    sessionStorage.setItem("heritg:pending-checkout", value);
    expect(readBillingAttempt()).toBeUndefined();
  }
});

it("keeps the chosen plan across reloads and rejects unknown stored plans", () => {
  const attempt = { accountId: 'A'.repeat(22), idempotencyKey: 'synthetic-attempt-key', createdAt: Date.now(), planId: 'weekly' as const };
  saveBillingAttempt(attempt);
  expect(readBillingAttempt()).toEqual(attempt);
  sessionStorage.setItem('heritg:pending-checkout', JSON.stringify({ ...attempt, planId: 'unlimited' }));
  expect(readBillingAttempt()).toBeUndefined();
});
