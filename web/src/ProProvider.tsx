import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AccountAuthError, getAccountSession, readCsrfCookie, type AccountSession } from "./accountAuth";
import { loadRevenueCatOffers, purchaseRevenueCatPlan, refreshRevenueCatCustomer } from "./revenueCat";
import type { AccountState, ProContextValue, ProOffer, SubscriptionPlan, SubscriptionState, SyncState } from "./proTypes";
import { unavailableProContext } from "./proTypes";

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
      renewsAt: entitlement.expiresAt ?? undefined,
      willRenew: true,
      manageUrl: entitlement.managementUrl ?? undefined
    };
  }
  if (entitlement.access === "read_only") {
    return { status: "expired", expiredAt: entitlement.graceEndsAt ?? undefined, offers };
  }
  return { status: "free", offers };
};

export function ProProvider({ children, value }: { children: ReactNode; value?: ProContextValue }) {
  const configured = __PRO_ENABLED__ && Boolean(__REVENUECAT_PUBLIC_API_KEY__);
  const [account, setAccount] = useState<AccountState>(readCsrfCookie() ? { status: "loading" } : { status: "signedOut" });
  const [subscription, setSubscription] = useState<SubscriptionState>(configured ? { status: "loading" } : { status: "unavailable" });
  const [sync, setSync] = useState<SyncState>({ enabled: false, phase: "unavailable", pendingChanges: 0 });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [error, setError] = useState<string>();

  const applySession = useCallback(async (session: AccountSession) => {
    setAccount({ status: "signedIn", user: { id: session.accountId, expiresAt: session.expiresAt } });
    if (!configured) {
      setSubscription({ status: "unavailable" });
      setSync({ enabled: false, phase: "unavailable", pendingChanges: 0 });
      return;
    }
    const [entitlement, offers] = await Promise.all([
      jsonRequest<EntitlementResponse>("/api/v1/entitlements/current"),
      loadRevenueCatOffers(session.accountId).catch(() => [] as ProOffer[])
    ]);
    setSubscription(subscriptionFromEntitlement(entitlement, offers));
    setSync({
      enabled: false,
      phase: entitlement.canWrite ? "disabled" : entitlement.canRead ? "unavailable" : "subscriptionRequired",
      pendingChanges: 0
    });
  }, [configured]);

  const loadSession = useCallback(async () => {
    if (!readCsrfCookie()) {
      setAccount({ status: "signedOut" });
      setSubscription(configured ? { status: "free", offers: [] } : { status: "unavailable" });
      setSync({ enabled: false, phase: configured ? "authenticationRequired" : "unavailable", pendingChanges: 0 });
      return;
    }
    try {
      await applySession(await getAccountSession());
    } catch (cause) {
      if (cause instanceof AccountAuthError && cause.status === 401) {
        setAccount({ status: "signedOut" });
        setSubscription(configured ? { status: "free", offers: [] } : { status: "unavailable" });
        setSync({ enabled: false, phase: configured ? "authenticationRequired" : "unavailable", pendingChanges: 0 });
        return;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      setAccount({ status: "error", message });
      setSubscription({ status: "error", message, offers: [] });
      setSync({ enabled: false, phase: "error", pendingChanges: 0, error: message });
    }
  }, [applySession, configured]);

  useEffect(() => {
    if (value) return;
    const timer = window.setTimeout(() => void loadSession(), 0);
    const sessionChanged = () => void loadSession();
    window.addEventListener("heritg:account-session-changed", sessionChanged);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("heritg:account-session-changed", sessionChanged);
    };
  }, [loadSession, value]);

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
    await applySession({ accountId: account.user.id, expiresAt: account.user.expiresAt });
  };
  const purchase = async (plan: SubscriptionPlan, target?: HTMLElement) => {
    if (account.status !== "signedIn") return;
    const offers = "offers" in subscription ? subscription.offers : [];
    setError(undefined);
    setSubscription({ status: "purchasing", plan, offers });
    try {
      const result = await purchaseRevenueCatPlan(account.user.id, plan, document.documentElement.lang === "id" ? "id" : "en", target);
      if (!result) { setSubscription({ status: "free", offers }); return; }
      await refreshEntitlement();
      setPaywallOpen(false);
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
      await refreshRevenueCatCustomer(account.user.id);
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
      if (subscription.status !== "active") return;
      setSync({ enabled, phase: enabled ? "unavailable" : "disabled", pendingChanges: 0 });
    },
    resolveSync: async () => undefined,
    clearError: () => setError(undefined)
  };
  return <ProContext.Provider value={context}>{children}</ProContext.Provider>;
}

export const usePro = () => useContext(ProContext);
