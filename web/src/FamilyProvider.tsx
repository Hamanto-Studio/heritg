import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";

import { readCsrfCookie } from "./accountAuth";
import type {
  AccountSession,
  FamilyContextValue,
  FamilyOffer,
  FamilySubscriptionState,
  SyncState,
  SubscriptionPlan
} from "./familyTypes";
import { unavailableFamilyContext } from "./familyTypes";
import {
  loadRevenueCatOffers,
  purchaseRevenueCatPlan,
  refreshRevenueCatCustomer
} from "./revenueCat";

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

const FamilyContext = createContext<FamilyContextValue>(unavailableFamilyContext);

const api = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
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

const subscriptionFor = (
  entitlement: EntitlementResponse,
  offers: FamilyOffer[]
): FamilySubscriptionState => {
  if (entitlement.access === "active") {
    return {
      status: "active",
      access: "active",
      offers,
      ...(entitlement.expiresAt ? { expiresAt: entitlement.expiresAt } : {}),
      ...(entitlement.managementUrl ? { managementUrl: entitlement.managementUrl } : {})
    };
  }
  if (entitlement.access === "read_only" && entitlement.graceEndsAt) {
    return { status: "readOnly", graceEndsAt: entitlement.graceEndsAt, offers };
  }
  return { status: "free", offers };
};

export function FamilyProvider({ children }: { children: ReactNode }) {
  const configured = __FAMILY_ENABLED__ && Boolean(__REVENUECAT_PUBLIC_API_KEY__);
  const [account, setAccount] = useState<FamilyContextValue["account"]>({ status: "loading" });
  const [subscription, setSubscription] = useState<FamilySubscriptionState>(
    configured ? { status: "loading" } : { status: "unavailable" }
  );
  const [sync, setSync] = useState<SyncState>({
    enabled: false,
    phase: configured ? "authenticationRequired" : "unavailable",
    pendingChanges: 0
  });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [error, setError] = useState<string>();

  const loadForSession = useCallback(async (session: AccountSession) => {
    setAccount({ status: "signedIn", session });
    if (!configured) {
      setSubscription({ status: "unavailable" });
      setSync({ enabled: false, phase: "unavailable", pendingChanges: 0 });
      return;
    }
    const [entitlement, offers] = await Promise.all([
      api<EntitlementResponse>("/api/v1/entitlements/current"),
      loadRevenueCatOffers(session.accountId).catch(() => [] as FamilyOffer[])
    ]);
    setSubscription(subscriptionFor(entitlement, offers));
    setSync({
      enabled: false,
      phase: "unavailable",
      pendingChanges: 0
    });
  }, [configured]);

  const refreshAccount = useCallback(async () => {
    try {
      const session = await api<AccountSession>("/api/v1/auth/session");
      await loadForSession(session);
    } catch (loadError) {
      if ((loadError as { status?: number }).status === 401) {
        setAccount({ status: "signedOut" });
        setSubscription(configured ? { status: "free", offers: [] } : { status: "unavailable" });
        setSync({ enabled: false, phase: "authenticationRequired", pendingChanges: 0 });
        return;
      }
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setAccount({ status: "error", message });
      setSubscription({ status: "error", message, offers: [] });
      setSync({ enabled: false, phase: "error", pendingChanges: 0, error: message });
    }
  }, [configured, loadForSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshAccount(), 0);
    const changed = () => void refreshAccount();
    window.addEventListener("heritg:account-session-changed", changed);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("heritg:account-session-changed", changed);
    };
  }, [refreshAccount]);

  const refreshSubscription = async () => {
    if (account.status !== "signedIn") return;
    setError(undefined);
    try {
      await refreshRevenueCatCustomer(account.session.accountId);
      const csrf = readCsrfCookie();
      if (!csrf) throw new Error("Sign in again before refreshing the subscription.");
      await api("/api/v1/entitlements/refresh", {
        method: "POST",
        headers: { "x-csrf-token": csrf },
        body: "{}"
      });
      await loadForSession(account.session);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  };

  const purchase = async (plan: SubscriptionPlan, target?: HTMLElement) => {
    if (account.status !== "signedIn") return;
    const offers = "offers" in subscription ? subscription.offers : [];
    setSubscription({ status: "purchasing", plan, offers });
    setError(undefined);
    try {
      const result = await purchaseRevenueCatPlan(
        account.session.accountId,
        plan,
        document.documentElement.lang === "id" ? "id" : "en",
        target
      );
      if (!result) {
        setSubscription({ status: "free", offers });
        return;
      }
      await refreshSubscription();
      setPaywallOpen(false);
    } catch (purchaseError) {
      const message = purchaseError instanceof Error ? purchaseError.message : String(purchaseError);
      setError(message);
      setSubscription({ status: "error", message, offers });
    }
  };

  const context: FamilyContextValue = {
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
      if (subscription.status !== "active" || !subscription.managementUrl) return;
      const destination = new URL(subscription.managementUrl);
      if (destination.protocol === "https:") window.location.assign(destination.href);
    },
    setSyncEnabled: async () => undefined,
    clearError: () => setError(undefined)
  };

  return <FamilyContext.Provider value={context}>{children}</FamilyContext.Provider>;
}

export const useFamily = () => useContext(FamilyContext);
