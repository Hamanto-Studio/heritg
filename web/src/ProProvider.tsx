import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AccountAuthError, getAccountSession, readCsrfCookie, subscribeToAccountSessionChanges, type AccountSession } from "./accountAuth";
import { AccountSyncError, createAccountSyncClient } from "./accountSync";
import { reconcileAccountSync } from "./accountSyncCoordinator";
import { ACCOUNT_SYNC_LOCK_NAME, claimSyncOwnerAccountId, loadSyncMappings, loadSyncOwnerAccountId, saveSyncMetadata } from "./db";
import type { AccountState, ProContextValue, ProOffer, SubscriptionPlan, SubscriptionState, SyncState } from "./proTypes";
import { unavailableProContext } from "./proTypes";
import { syncDataFingerprint, syncTreeVersion, type AppStoreValue } from "./store";

interface EntitlementResponse {
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
}

interface BillingOffersResponse {
  offers: ProOffer[];
}

interface BillingCheckoutResponse {
  checkoutUrl: string;
}

const ProContext = createContext<ProContextValue>(unavailableProContext);

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

const subscriptionFromEntitlement = (
  entitlement: EntitlementResponse,
  offers: ProOffer[]
): SubscriptionState => {
  if (entitlement.access === "active") {
    return {
      status: "active",
      expiresAt: entitlement.expiresAt ?? undefined,
      manageUrl: entitlement.managementUrl ?? undefined
    };
  }
  if (entitlement.access === "read_only") {
    return { status: "expired", expiredAt: entitlement.graceEndsAt ?? undefined, offers };
  }
  return { status: "free", offers };
};

export function ProProvider({ children, value, appStore }: { children: ReactNode; value?: ProContextValue; appStore?: AppStoreValue }) {
  const configured = __FAMILY_BILLING_ENABLED__;
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

  const applySession = useCallback(async (session: AccountSession, generation = sessionGenerationRef.current) => {
    if (generation !== sessionGenerationRef.current) return;
    const sameAccount = currentAccountIdRef.current === session.accountId;
    currentAccountIdRef.current = session.accountId;
    setAccount({ status: "signedIn", user: { id: session.accountId, name: session.name, email: session.email, expiresAt: session.expiresAt } });
    if (!configured) {
      setSyncAccess({ canRead: false, canWrite: false });
      setSubscription({ status: "unavailable" });
      setSync({ enabled: false, phase: "unavailable", pendingChanges: 0 });
      return;
    }
    const [entitlement, billing] = await Promise.all([
      jsonRequest<EntitlementResponse>("/api/v1/entitlements/current"),
      jsonRequest<BillingOffersResponse>("/api/v1/billing/offers").catch(() => ({ offers: [] }))
    ]);
    if (generation !== sessionGenerationRef.current || currentAccountIdRef.current !== session.accountId) return;
    setSubscription(subscriptionFromEntitlement(entitlement, billing.offers));
    setSyncAccess({ canRead: entitlement.canRead, canWrite: entitlement.canWrite });
    setSync((current) => ({
      enabled: sameAccount && current.enabled && entitlement.canRead,
      phase: sameAccount && current.enabled && entitlement.canRead ? "comparing" : entitlement.canWrite ? "disabled" : entitlement.canRead ? "disabled" : "subscriptionRequired",
      pendingChanges: 0
    }));
  }, [configured]);

  const loadSession = useCallback(async () => {
    const generation = ++sessionGenerationRef.current;
    syncAbortRef.current?.abort();
    syncQueuedRef.current = false;
    if (!readCsrfCookie()) {
      currentAccountIdRef.current = undefined;
      setSyncAccess({ canRead: false, canWrite: false });
      setAccount({ status: "signedOut" });
      setSubscription(configured ? { status: "free", offers: [] } : { status: "unavailable" });
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
        setSubscription(configured ? { status: "free", offers: [] } : { status: "unavailable" });
        setSync({ enabled: false, phase: configured ? "authenticationRequired" : "unavailable", pendingChanges: 0 });
        return;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      setSyncAccess({ canRead: false, canWrite: false });
      setAccount({ status: "error", message });
      setSubscription({ status: "error", message, offers: [] });
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
        : cause instanceof AccountSyncError
          ? "Family synchronization could not be completed."
          : cause instanceof Error ? cause.message : "Family synchronization could not be completed.";
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
  const refreshEntitlement = async () => {
    if (account.status !== "signedIn") return;
    const csrfToken = readCsrfCookie();
    if (!csrfToken) throw new Error("Sign in again before refreshing the subscription.");
    await jsonRequest("/api/v1/entitlements/refresh", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken },
      body: "{}"
    });
    await applySession({ accountId: account.user.id, name: account.user.name, email: account.user.email, expiresAt: account.user.expiresAt });
  };
  const purchase = async (plan: SubscriptionPlan) => {
    if (account.status !== "signedIn") return;
    const csrfToken = readCsrfCookie();
    if (!csrfToken) {
      setError("Sign in again before starting checkout.");
      return;
    }
    const offers = "offers" in subscription ? subscription.offers : [];
    setError(undefined);
    setSubscription({ status: "purchasing", plan, offers });
    try {
      const result = await jsonRequest<BillingCheckoutResponse>("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body: JSON.stringify({ plan })
      });
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== "https:") throw new Error("The checkout URL is invalid.");
      window.location.assign(destination.href);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setSubscription({ status: "error", message, offers });
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
