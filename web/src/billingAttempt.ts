export interface BillingAttempt { accountId: string; idempotencyKey: string; createdAt: number }
const STORAGE_KEY = "heritg:pending-checkout";

export function readBillingAttempt(): BillingAttempt | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as BillingAttempt | null;
    return value && /^[A-Za-z0-9_-]{22}$/.test(value.accountId) && /^[A-Za-z0-9._~-]{16,128}$/.test(value.idempotencyKey) &&
      Number.isFinite(value.createdAt) ? value : undefined;
  } catch { return undefined; }
}

export function saveBillingAttempt(value: BillingAttempt): void {
  // Persist before creating a bill so a reload/network retry reuses the same key.
  // Failure stops checkout; no provider payment URL or credential is persisted.
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearBillingAttempt(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* No entitlement is stored here. */ }
}
