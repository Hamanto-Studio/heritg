import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AccountAuthError, getAccountSession, readCsrfCookie, subscribeToAccountSessionChanges, type AccountSession } from "./accountAuth";
import { AccountSyncError, createAccountSyncClient } from "./accountSync";
import { reconcileAccountSync } from "./accountSyncCoordinator";
import { ACCOUNT_SYNC_LOCK_NAME, claimSyncOwnerAccountId, loadSyncMappings, loadSyncOwnerAccountId, saveSyncMetadata } from "./db";
import type { AccountState, ProContextValue, ProOffer, SubscriptionState, SyncState } from "./proTypes";
import { unavailableProContext } from "./proTypes";
import { syncDataFingerprint, syncTreeVersion, type AppStoreValue } from "./store";

export interface EntitlementResponse {
  appUserId: string;
  entitlementId: "family";
  plan: "free" | "family";
  access: "active" | "read_only" | "none";
  canRead: boolean;
  canWrite: boolean;
  expiresAt: string | null;
  graceEndsAt: string | null;
  checkedAt: string | null;
  managementUrl: string | null;
  offer: ProOffer;
}

export const syncFailureMessage = (cause: unknown, staging = __DEPLOYMENT_ENV__ === "staging") => {
  if (!(cause instanceof AccountSyncError)) {
    return cause instanceof Error ? cause.message : "Family synchronization could not be completed.";
  }
  return staging
    ? `Family synchronization failed. Sync diagnostic: stage=${cause.stage}, code=${cause.code}, http=${cause.status}.`
    : "Family synchronization could not be completed.";
};

interface BillingCheckoutResponse {
  paymentLinkUrl: string;
}

const ProContext = createContext<ProContextValue>(unavailableProContext);
const SYNC_ENABLED_STORAGE_KEY = "heritg:family-sync-enabled";

const readSyncEnabled = (): boolean | undefined => {
  try {
    const value = localStorage.getItem(SYNC_ENABLED_STORAGE_KEY);
    return value === null ? undefined : value === "true";
  } catch { return undefined; }
};

const saveSyncEnabled = (enabled: boolean): void => {
  try { localStorage.setItem(SYNC_ENABLED_STORAGE_KEY, String(enabled)); } catch { /* Browser storage can be unavailable. */ }
};

const jsonRequest = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "include",
    redirect: "error",
    referrerPolicy: "no-referrer",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers
    }
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body &&
      body.error && typeof body.error === "object" && "message" in body.error &&
      typeof body.error.message === "string"
      ? body.error.message
      : `Request failed (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body as T;
};

export const requestBillingCheckout = async (
  accountId: string,
  csrfToken: string,
  idempotencyKey: string = crypto.randomUUID()
): Promise<string> => {
  const result = await jsonRequest<BillingCheckoutResponse>("/api/v1/billing/checkouts", {
    method: "POST",
    headers: {
      "idempotency-key": idempotencyKey,
      "x-csrf-token": csrfToken,
      "x-heritg-account-id": accountId
    },
    body: "{}"
  });
  if (!result || typeof result.paymentLinkUrl !== "string") {
    throw new Error("The payment service returned an invalid response.");
  }
  const destination = new URL(result.paymentLinkUrl);
  if (destination.protocol !== "https:") throw new Error("The checkout URL is invalid.");
  return destination.href;
};

export const requestFreeAccess = async (
  accountId: string,
  csrfToken: string
): Promise<EntitlementResponse> => jsonRequest<EntitlementResponse>("/api/v1/entitlements/free-access", {
  method: "POST",
  headers: {
    "x-csrf-token": csrfToken,
    "x-heritg-account-id": accountId
  },
  body: "{}"
});

export const subscriptionFromEntitlement = (
  entitlement: EntitlementResponse
): SubscriptionState => {
  if (entitlement.access === "active") {
    return {
      status: "active",
      offer: entitlement.offer,
      expiresAt: entitlement.expiresAt ?? undefined,
      manageUrl: entitlement.managementUrl ?? undefined
    };
  }
  if (entitlement.access === "read_only") {
    return {
      status: "readOnly",
      expiresAt: entitlement.expiresAt ?? undefined,
      graceEndsAt: entitlement.graceEndsAt ?? undefined,
      offer: entitlement.offer,
      manageUrl: entitlement.managementUrl ?? undefined
    };
  }
  if (entitlement.expiresAt) return { status: "expired", expiresAt: entitlement.expiresAt, offer: entitlement.offer };
  return { status: "free", offer: entitlement.offer };
};

export function ProProvider({
  children,
  value,
  appStore,
  billingEnabled = __FAMILY_BILLING_ENABLED__
}: { children: ReactNode; value?: ProContextValue; appStore?: AppStoreValue; billingEnabled?: boolean }) {
  const configured = billingEnabled;
  const [account, setAccount] = useState<AccountState>(readCsrfCookie() ? { status: "loading" } : { status: "signedOut" });
  const [subscription, setSubscription] = useState<SubscriptionState>(configured ? { status: "loading" } : { status: "unavailable" });
  const [sync, setSync] = useState<SyncState>({ enabled: false, phase: "unavailable", pendingChanges: 0 });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [syncAccess, setSyncAccess] = useState({ canRead: false, canWrite: false });
  const syncRunningRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const syncAbortRef = useRef<AbortController | undefined>(undefined);
  const runSyncRef = useRef<(resolution?: "device" | "cloud" | "both") => Promise<void>>(async () => undefined);
  const sessionGenerationRef = useRef(0);
  const currentAccountIdRef = useRef<string | undefined>(undefined);

  const applyEntitlement = useCallback((entitlement: EntitlementResponse, preserveDisabledSync = false) => {
    const nextSubscription = subscriptionFromEntitlement(entitlement);
    const enabled = entitlement.canRead && readSyncEnabled() === true;
    setSubscription(nextSubscription);
    setSyncAccess({ canRead: entitlement.canRead, canWrite: entitlement.canWrite });
    setSync((current) => preserveDisabledSync && entitlement.canRead && current.phase === "disabled"
      ? { ...current, error: undefined }
      : {
          enabled,
          phase: entitlement.canRead ? enabled ? "comparing" : "disabled" : "subscriptionRequired",
          pendingChanges: 0
        });
    return nextSubscription;
  }, []);

  const applySession = useCallback(async (session: AccountSession, generation = sessionGenerationRef.current) => {
    if (generation !== sessionGenerationRef.current) return;
    currentAccountIdRef.current = session.accountId;
    setAccount({ status: "signedIn", user: { id: session.accountId, name: session.name, email: session.email, expiresAt: session.expiresAt } });
    if (!configured) {
      setSyncAccess({ canRead: false, canWrite: false });
      setSubscription({ status: "unavailable" });
      setSync({ enabled: false, phase: "unavailable", pendingChanges: 0 });
      return;
    }
    const entitlement = await jsonRequest<EntitlementResponse>("/api/v1/entitlements/current");
    if (generation !== sessionGenerationRef.current || currentAccountIdRef.current !== session.accountId) return;
    applyEntitlement(entitlement);
  }, [applyEntitlement, configured]);

  const loadSession = useCallback(async () => {
    const generation = ++sessionGenerationRef.current;
    syncAbortRef.current?.abort();
    syncQueuedRef.current = false;
    if (!readCsrfCookie()) {
      currentAccountIdRef.current = undefined;
      setSyncAccess({ canRead: false, canWrite: false });
      setAccount({ status: "signedOut" });
      setSubscription(configured ? { status: "free" } : { status: "unavailable" });
      setSync({ enabled: false, phase: configured ? "authenticationRequired" : "unavailable", pendingChanges: 0 });
      return;
    }
    try {
      const session = await getAccountSession();
      if (generation !== sessionGenerationRef.current) return;
      await applySession(session, generation);
    } catch (cause) {
      if (generation !== sessionGenerationRef.current) return;
      if (cause instanceof AccountAuthError && cause.status === 401) {
        currentAccountIdRef.current = undefined;
        setSyncAccess({ canRead: false, canWrite: false });
        setAccount({ status: "signedOut" });
        setSubscription(configured ? { status: "free" } : { status: "unavailable" });
        setSync({ enabled: false, phase: configured ? "authenticationRequired" : "unavailable", pendingChanges: 0 });
        return;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      setSyncAccess({ canRead: false, canWrite: false });
      setAccount({ status: "error", message });
      setSubscription({ status: "error", message });
      setSync({ enabled: false, phase: "error", pendingChanges: 0, error: message });
    }
  }, [applySession, configured]);

  useEffect(() => {
    if (value) return;
    const timer = window.setTimeout(() => void loadSession(), 0);
    const sessionChanged = () => void loadSession();
    const unsubscribe = subscribeToAccountSessionChanges(sessionChanged);
    return () => {
      sessionGenerationRef.current += 1;
      syncAbortRef.current?.abort();
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [loadSession, value]);

  const refreshEntitlement = useCallback(async () => {
    if (account.status !== "signedIn") return undefined;
    const accountId = account.user.id;
    const generation = sessionGenerationRef.current;
    const entitlement = await jsonRequest<EntitlementResponse>("/api/v1/entitlements/current");
    if (generation !== sessionGenerationRef.current || currentAccountIdRef.current !== accountId) return undefined;
    return applyEntitlement(entitlement, true);
  }, [account, applyEntitlement]);

  useEffect(() => {
    if (value || account.status !== "signedIn") return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshEntitlement().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [account.status, refreshEntitlement, value]);

  const runSync = useCallback(async (resolution?: "device" | "cloud" | "both") => {
    if (value || !appStore?.ready || !appStore.data || account.status !== "signedIn" || !syncAccess.canRead || (!sync.enabled && !resolution)) return;
    if (syncRunningRef.current) {
      syncQueuedRef.current = true;
      return;
    }
    syncRunningRef.current = true;
    const controller = new AbortController();
    syncAbortRef.current = controller;
    const accountId = account.user.id;
    const sessionGeneration = sessionGenerationRef.current;
    setSync((current) => ({ ...current, enabled: true, phase: resolution ? "syncing" : "comparing", error: undefined }));
    try {
      if (!navigator.locks) throw new Error("This browser cannot safely coordinate family synchronization between tabs.");
      await appStore.actions.flushLocalSaves();
      await navigator.locks.request(ACCOUNT_SYNC_LOCK_NAME, { signal: controller.signal }, async () => {
        const prepared = await appStore.actions.prepareSyncData();
        const snapshot = prepared.data;
        const verifiedSession = await getAccountSession(controller.signal);
        if (verifiedSession.accountId !== accountId) throw new AccountAuthError(401, "unauthenticated");
        const ownerAccountId = await loadSyncOwnerAccountId();
        if (ownerAccountId && ownerAccountId !== accountId) {
          throw new Error("This device's family data is linked to another account.");
        }
        let ownershipClaimed = Boolean(ownerAccountId);
        const mappings = await loadSyncMappings(accountId);
        const result = await reconcileAccountSync({
          client: createAccountSyncClient(accountId),
          data: snapshot,
          mappings,
          canWrite: syncAccess.canWrite,
          csrfToken: readCsrfCookie(),
          resolution,
          beforeMutation: async () => {
            if (ownershipClaimed) return;
            await claimSyncOwnerAccountId(accountId);
            ownershipClaimed = true;
          },
          signal: controller.signal
        });
        if (sessionGeneration !== sessionGenerationRef.current || currentAccountIdRef.current !== accountId) return;
        if (!ownershipClaimed) await claimSyncOwnerAccountId(accountId);
        if (result.data !== snapshot || syncDataFingerprint(snapshot) !== prepared.currentDataFingerprint) {
          if (!await appStore.actions.applySyncedData(result.data, prepared.currentDataFingerprint, accountId, result.mappings)) {
            syncQueuedRef.current = true;
            return;
          }
        } else {
          await saveSyncMetadata(accountId, result.mappings);
        }
        if (sessionGeneration !== sessionGenerationRef.current || currentAccountIdRef.current !== accountId) return;
        setSync({
          enabled: true,
          phase: result.phase,
          pendingChanges: result.pendingChanges,
          ...(result.phase === "upToDate" ? { lastSuccessAt: new Date().toISOString() } : {}),
          ...(result.local ? { local: result.local } : {}),
          ...(result.cloud ? { cloud: result.cloud } : {})
        });
        if (result.phase === "pending" && syncAccess.canWrite) syncQueuedRef.current = true;
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const authenticationRequired = ((cause instanceof AccountSyncError || cause instanceof AccountAuthError) && cause.status === 401) ||
        (cause instanceof AccountSyncError && cause.status === 409 && cause.code === "session_changed");
      const subscriptionRequired = cause instanceof AccountSyncError && cause.status === 403;
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      const message = offline
        ? "Family synchronization will retry when this device is online."
        : syncFailureMessage(cause);
      setSync((current) => ({
        ...current,
        phase: authenticationRequired ? "authenticationRequired" : subscriptionRequired ? "subscriptionRequired" : offline ? "offline" : "error",
        error: message
      }));
      if (authenticationRequired) window.setTimeout(() => void loadSession(), 0);
    } finally {
      if (syncAbortRef.current === controller) syncAbortRef.current = undefined;
      syncRunningRef.current = false;
      if (syncQueuedRef.current) {
        syncQueuedRef.current = false;
        window.setTimeout(() => void runSyncRef.current(), 0);
      }
    }
  }, [account, appStore, loadSession, sync.enabled, syncAccess, value]);
  runSyncRef.current = runSync;

  const syncStoreReady = Boolean(appStore?.ready && appStore.data);
  const currentTreeVersion = appStore?.data ? syncTreeVersion(appStore.data) : "";

  useEffect(() => {
    if (value || !sync.enabled || !syncStoreReady || account.status !== "signedIn" || !syncAccess.canRead) return;
    const timer = window.setTimeout(() => void runSyncRef.current(), 500);
    return () => window.clearTimeout(timer);
  }, [account, currentTreeVersion, sync.enabled, syncAccess.canRead, syncStoreReady, value]);

  useEffect(() => {
    if (value) return;
    const online = () => {
      if (sync.enabled) void runSyncRef.current();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [sync.enabled, value]);

  if (value) return <ProContext.Provider value={value}>{children}</ProContext.Provider>;

  const fail = (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause));
  const purchase = async () => {
    if (account.status !== "signedIn") return;
    const csrfToken = readCsrfCookie();
    if (!csrfToken) {
      setError("Sign in again before activating Family+.");
      return;
    }
    const offer = "offer" in subscription ? subscription.offer : undefined;
    if (!offer) {
      setError("The Family+ offer is unavailable. Refresh and try again.");
      return;
    }
    setError(undefined);
    setSubscription({ status: "purchasing", offer });
    try {
      if (offer.price.amount === 0) {
        const claimed = await requestFreeAccess(account.user.id, csrfToken);
        if (claimed.appUserId !== account.user.id) throw new Error("The Family+ response did not match this account.");
        if (readSyncEnabled() === undefined) saveSyncEnabled(true);
        const next = applyEntitlement(claimed);
        if (next.status !== "active") throw new Error("Free Family+ access could not be activated.");
        setPaywallOpen(false);
        return;
      }
      const paymentLink = await requestBillingCheckout(account.user.id, csrfToken);
      const refreshed = await refreshEntitlement().catch(() => undefined);
      if (refreshed?.status === "active") {
        setPaywallOpen(false);
        return;
      }
      window.location.assign(paymentLink);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setSubscription({ status: "error", message, offer });
    }
  };
  const refreshSubscription = async () => {
    if (account.status !== "signedIn") return;
    setError(undefined);
    try {
      await refreshEntitlement();
    } catch (cause) { fail(cause); }
  };
  const context: ProContextValue = {
    configured,
    account,
    subscription,
    sync,
    paywallOpen,
    error,
    openPaywall: () => setPaywallOpen(true),
    closePaywall: () => setPaywallOpen(false),
    purchase,
    refreshSubscription,
    manageSubscription: () => {
      if (subscription.status !== "active" || !subscription.manageUrl) return;
      const destination = new URL(subscription.manageUrl);
      if (destination.protocol === "https:") window.location.assign(destination.href);
    },
    setSyncEnabled: async (enabled) => {
      if (!syncAccess.canRead) return;
      saveSyncEnabled(enabled);
      if (!enabled) {
        syncAbortRef.current?.abort();
        syncQueuedRef.current = false;
        setSync({ enabled: false, phase: "disabled", pendingChanges: 0 });
        return;
      }
      setSync({ enabled: true, phase: "comparing", pendingChanges: 0 });
      window.setTimeout(() => void runSyncRef.current(), 0);
    },
    resolveSync: async (resolution) => runSync(resolution),
    clearError: () => setError(undefined)
  };
  return <ProContext.Provider value={context}>{children}</ProContext.Provider>;
}

export const usePro = () => useContext(ProContext);
