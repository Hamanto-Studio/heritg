export type SubscriptionPlan = "two_year" | "five_year";

export interface ProUser { id: string; name: string | null; email: string | null; expiresAt: string }
export interface ProOffer {
  plan: SubscriptionPlan;
  price: string;
  priceMicros: number;
  currency: string;
}

export type AccountState =
  | { status: "loading" | "signedOut" }
  | { status: "signedIn"; user: ProUser }
  | { status: "error"; message: string };

export type SubscriptionState =
  | { status: "unavailable" | "loading" }
  | { status: "free"; offers: ProOffer[] }
  | { status: "purchasing"; plan: SubscriptionPlan; offers: ProOffer[] }
  | { status: "active"; plan?: SubscriptionPlan; expiresAt?: string; manageUrl?: string }
  | { status: "expired"; expiredAt?: string; offers: ProOffer[] }
  | { status: "error"; message: string; offers: ProOffer[] };

export type SyncPhase = "unavailable" | "disabled" | "comparing" | "upToDate" | "pending" |
  "syncing" | "offline" | "conflict" | "authenticationRequired" | "subscriptionRequired" |
  "encryptionKeyRequired" | "error";
export interface SyncArchiveSummary { people: number; trees: number; updatedAt?: string }
export interface SyncState {
  enabled: boolean;
  phase: SyncPhase;
  lastSuccessAt?: string;
  pendingChanges: number;
  error?: string;
  local?: SyncArchiveSummary;
  cloud?: SyncArchiveSummary;
}
export type SyncResolution = "device" | "cloud" | "both";

export interface ProContextValue {
  configured: boolean;
  account: AccountState;
  subscription: SubscriptionState;
  sync: SyncState;
  paywallOpen: boolean;
  error?: string;
  openPaywall: () => void;
  closePaywall: () => void;
  purchase: (plan: SubscriptionPlan) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  manageSubscription: () => void;
  setSyncEnabled: (enabled: boolean) => Promise<void>;
  resolveSync: (resolution: SyncResolution) => Promise<void>;
  clearError: () => void;
}

const unavailable = async () => undefined;
export const unavailableProContext: ProContextValue = {
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
  resolveSync: unavailable,
  clearError: () => undefined
};
