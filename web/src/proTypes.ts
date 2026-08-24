export interface ProUser { id: string; name: string | null; email: string | null; expiresAt: string }
export interface ProOffer {
  productId: string;
  name: string;
  price: { amount: number; currency: string };
  accessMonths: number;
}

export type AccountState =
  | { status: "loading" | "signedOut" }
  | { status: "signedIn"; user: ProUser }
  | { status: "error"; message: string };

export type SubscriptionState =
  | { status: "unavailable" | "loading" }
  | { status: "free"; offer?: ProOffer }
  | { status: "purchasing"; offer: ProOffer }
  | { status: "active"; offer?: ProOffer; expiresAt?: string; manageUrl?: string }
  | { status: "expired"; expiredAt?: string; offer?: ProOffer }
  | { status: "error"; message: string; offer?: ProOffer };

export type SyncPhase = "unavailable" | "comparing" | "upToDate" | "pending" |
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
  purchase: () => Promise<void>;
  manageSubscription: () => void;
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
  manageSubscription: () => undefined,
  resolveSync: unavailable,
  clearError: () => undefined
};
