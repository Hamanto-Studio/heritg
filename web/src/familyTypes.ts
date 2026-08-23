export interface AccountSession {
  accountId: string;
  expiresAt: string;
}

export type AccountState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: AccountSession }
  | { status: "error"; message: string };

export type SubscriptionPlan = "monthly" | "yearly";

export interface FamilyOffer {
  plan: SubscriptionPlan;
  price: string;
  priceMicros: number;
  currency: string;
}

export type FamilySubscriptionState =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "free"; offers: FamilyOffer[] }
  | { status: "purchasing"; plan: SubscriptionPlan; offers: FamilyOffer[] }
  | {
      status: "active";
      access: "active";
      expiresAt?: string;
      managementUrl?: string;
      offers: FamilyOffer[];
    }
  | {
      status: "readOnly";
      graceEndsAt: string;
      offers: FamilyOffer[];
    }
  | { status: "error"; message: string; offers: FamilyOffer[] };

export type SyncPhase =
  | "unavailable"
  | "disabled"
  | "upToDate"
  | "offline"
  | "authenticationRequired"
  | "subscriptionRequired"
  | "readOnly"
  | "error";

export interface SyncState {
  enabled: boolean;
  phase: SyncPhase;
  pendingChanges: number;
  lastSuccessAt?: string;
  error?: string;
}

export interface FamilyContextValue {
  configured: boolean;
  account: AccountState;
  subscription: FamilySubscriptionState;
  sync: SyncState;
  paywallOpen: boolean;
  error?: string;
  openPaywall: () => void;
  closePaywall: () => void;
  purchase: (plan: SubscriptionPlan, target?: HTMLElement) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  manageSubscription: () => void;
  setSyncEnabled: (enabled: boolean) => Promise<void>;
  clearError: () => void;
}

const unavailable = async () => undefined;

export const unavailableFamilyContext: FamilyContextValue = {
  configured: false,
  account: { status: "signedOut" },
  subscription: { status: "unavailable" },
  sync: { enabled: false, phase: "unavailable", pendingChanges: 0 },
  paywallOpen: false,
  openPaywall: () => undefined,
  closePaywall: () => undefined,
  purchase: unavailable,
  refreshSubscription: unavailable,
  manageSubscription: () => undefined,
  setSyncEnabled: unavailable,
  clearError: () => undefined
};
