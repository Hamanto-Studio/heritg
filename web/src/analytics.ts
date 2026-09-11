import { JOURNEYS, validEvent, validVariant, type Journey, type JourneyEvent, type Outcome, type Variant } from "./analyticsContract";

export const ANALYTICS_CONSENT_KEY = "heritg:analytics-consent:v1";
export const ANALYTICS_CHECKOUT_KEY = "heritg:analytics-checkout:v1";
export const ANALYTICS_DISCOVERY_KEY = "heritg:analytics-discovery:v1";
const checkoutJourneys = { checkout: ANALYTICS_CHECKOUT_KEY, family_discovery: ANALYTICS_DISCOVERY_KEY } as const;
const DAY = 86_400_000;
const LAST_SENT_KEY = "heritg:analytics-last-sent:v1";
interface Attempt { event: JourneyEvent; startedAt: number; epoch: number; pending: Promise<void>; stopped: boolean }
interface AnalyticsOptions {
  configured: () => boolean;
  privacySignal: () => boolean;
  online: () => boolean;
  local: () => Storage;
  session: () => Storage;
  fetch: typeof fetch;
  now: () => number;
  uuid: () => string;
}

/** One explicit gateway. Never pass app data, errors, URLs, or account objects here. */
export class ProductAnalytics {
  private attempts = new Map<Journey, Attempt>();
  private listeners = new Set<() => void>();
  private controllers = new Set<AbortController>();
  private epoch = 0;
  private revokedInMemory = false;
  constructor(private options: AnalyticsOptions) {}
  private read(key: string): string | null { try { return this.options.local().getItem(key); } catch { return null; } }
  private consent(): boolean {
    try {
      const value = JSON.parse(this.read(ANALYTICS_CONSENT_KEY) ?? "null");
      return value?.version === 1 && value.enabled === true && Number.isFinite(value.at) &&
        value.at <= this.options.now() && this.options.now() - value.at < 180 * DAY;
    } catch { return false; }
  }
  status = (): "unavailable" | "browser_blocked" | "off" | "on" => {
    if (!this.options.configured()) return "unavailable";
    if (this.options.privacySignal()) return "browser_blocked";
    return !this.revokedInMemory && this.consent() ? "on" : "off";
  };
  lastSent = (): string | null => this.read(LAST_SENT_KEY);
  snapshot = (): string => `${this.status()}:${this.lastSent() ?? ""}`;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { this.listeners.forEach(listener => listener()); }
  reset = (): void => {
    this.epoch++;
    this.controllers.forEach(controller => controller.abort());
    this.controllers.clear();
    this.attempts.forEach(attempt => { attempt.stopped = true; });
    this.attempts.clear();
    try { for (const key of Object.values(checkoutJourneys)) this.options.session().removeItem(key); } catch { /* Memory-only fallback. */ }
    this.notify();
  };
  setConsent = (enabled: boolean): void => {
    this.revokedInMemory = true;
    try {
      this.options.local().setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ version: 1, enabled: enabled && this.options.configured() && !this.options.privacySignal(), at: this.options.now() }));
      this.revokedInMemory = !enabled;
    } catch { /* Failed persistence never enables collection. */ }
    this.reset();
  };
  storageChanged = (): void => { this.revokedInMemory = false; this.reset(); };
  accountChanged = (): void => {
    // End only account-bound correlation; do not abort the sign-in success event
    // that triggered the account-change notification.
    for (const journey of ["checkout", "sync_enable", "family_discovery"] as const) {
      const attempt = this.attempts.get(journey);
      // Keep an anonymous paywall visit through sign-in, but never a purchase
      // that was already bound to the previous account session.
      if (journey === "family_discovery" && attempt?.event.step === 0) continue;
      if (attempt) attempt.stopped = true;
      this.attempts.delete(journey);
      if (journey in checkoutJourneys) {
        try { this.options.session().removeItem(checkoutJourneys[journey as keyof typeof checkoutJourneys]); } catch { /* Optional. */ }
      }
    }
    try { this.options.session().removeItem(ANALYTICS_CHECKOUT_KEY); } catch { /* No identity is retained. */ }
  };
  private allowed(): boolean { return this.status() === "on" && this.options.online(); }
  private persist(attempt: Attempt) {
    if (!(attempt.event.journey in checkoutJourneys)) return;
    if (this.attempts.get(attempt.event.journey) !== attempt) return;
    const key = checkoutJourneys[attempt.event.journey as keyof typeof checkoutJourneys];
    try {
      if (attempt.stopped || attempt.event.outcome !== "in_progress") this.options.session().removeItem(key);
      else this.options.session().setItem(key, JSON.stringify({ event: attempt.event, startedAt: attempt.startedAt }));
    } catch { /* No persistence is required to use checkout. */ }
  }
  private send(attempt: Attempt) {
    const event = { ...attempt.event };
    if (!validEvent(event) || !this.allowed()) return;
    attempt.pending = attempt.pending.then(async () => {
      if (attempt.stopped || attempt.epoch !== this.epoch || !this.allowed() || this.options.now() - attempt.startedAt >= DAY) return;
      const controller = new AbortController();
      this.controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const result = await this.options.fetch("/api/v1/analytics/journeys", {
          method: "POST", headers: { "content-type": "application/json", "x-heritg-analytics-consent": "1" },
          body: JSON.stringify(event), credentials: "omit", referrerPolicy: "no-referrer",
          cache: "no-store", redirect: "error", keepalive: true, signal: controller.signal
        });
        if (result.status !== 204) throw new Error("Analytics unavailable");
        if (attempt.epoch === this.epoch && this.status() === "on") {
          try { this.options.local().setItem(LAST_SENT_KEY, new Date(this.options.now()).toISOString()); } catch { /* Optional status. */ }
          this.notify();
        }
      } catch {
        // No retries, durable offline queue, raw errors, or effect on the user's action.
        attempt.stopped = true;
        this.persist(attempt);
      } finally {
        clearTimeout(timeout);
        this.controllers.delete(controller);
      }
    }).catch(() => { /* Analytics must never reject into an app workflow. */ });
  }
  begin(journey: Journey, variant: Variant = "default"): void {
    if (!this.allowed() || !Object.hasOwn(JOURNEYS, journey) || !validVariant(journey, variant)) return;
    this.end(journey, "cancelled");
    try {
      const attempt: Attempt = { event: { schemaVersion: 1, attemptId: this.options.uuid(), journey, variant, step: 0, outcome: "in_progress" }, startedAt: this.options.now(), epoch: this.epoch, pending: Promise.resolve(), stopped: false };
      if (!validEvent(attempt.event)) return;
      this.attempts.set(journey, attempt);
      this.persist(attempt);
      this.send(attempt);
    } catch { /* Randomness/storage unavailable: no analytics, app still works. */ }
  }
  has(journey: Journey): boolean { const attempt = this.attempts.get(journey); return Boolean(attempt && !attempt.stopped && attempt.event.outcome === "in_progress" && this.options.now() - attempt.startedAt < DAY); }
  ensure(journey: Journey, variant: Variant = "default"): void { if (!this.has(journey)) this.begin(journey, variant); }
  selectedView(variant: "full" | "focus" | "fan"): void {
    this.begin("view_change", variant);
    this.end("view_change", "success");
  }
  reach(journey: Journey, step: number): void {
    if (this.attempts.get(journey)?.event.step === step - 1) this.advance(journey);
  }
  advance(journey: Journey): void {
    const attempt = this.attempts.get(journey);
    if (!attempt || !this.has(journey) || !this.allowed() || attempt.event.step >= JOURNEYS[journey].length - 2) return;
    attempt.event = { ...attempt.event, step: attempt.event.step + 1 };
    this.persist(attempt);
    this.send(attempt);
  }
  end(journey: Journey, outcome: Exclude<Outcome, "in_progress">): void {
    const attempt = this.attempts.get(journey);
    if (!attempt || !this.has(journey) || !this.allowed() || !["success", "failed", "cancelled"].includes(outcome)) return;
    if (outcome === "success" && attempt.event.step !== JOURNEYS[journey].length - 2) return;
    attempt.event = { ...attempt.event, outcome, step: attempt.event.step + (outcome === "success" ? 1 : 0) };
    this.persist(attempt);
    this.send(attempt);
  }
  restoreCheckout(): void {
    for (const [journey, key] of Object.entries(checkoutJourneys)) this.restore(journey as keyof typeof checkoutJourneys, key);
  }
  private restore(journey: keyof typeof checkoutJourneys, key: string): void {
    if (!this.allowed() || this.has(journey)) return;
    try {
      const saved = JSON.parse(this.options.session().getItem(key) ?? "null");
      if (!saved || Object.keys(saved).sort().join(",") !== "event,startedAt" || !validEvent(saved.event) ||
        saved.event.journey !== journey || saved.event.outcome !== "in_progress" || !Number.isFinite(saved.startedAt) ||
        saved.startedAt > this.options.now() || this.options.now() - saved.startedAt >= DAY) {
        this.options.session().removeItem(key); return;
      }
      const attempt: Attempt = { event: { ...saved.event, step: 0 }, startedAt: saved.startedAt, epoch: this.epoch, pending: Promise.resolve(), stopped: false };
      this.attempts.set(journey, attempt);
      this.send(attempt);
      for (let step = 1; step <= saved.event.step; step++) this.advance(journey);
    } catch { /* Invalid/expired state is never sent. */ }
  }
}

export const analytics = new ProductAnalytics({
  configured: () => typeof __ANALYTICS_ENABLED__ !== "undefined" && __ANALYTICS_ENABLED__ && import.meta.env.PROD &&
    window.location.origin === (__DEPLOYMENT_ENV__ === "staging" ? "https://staging.heritg.us" : "https://heritg.us"),
  privacySignal: () => navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true,
  online: () => navigator.onLine,
  local: () => localStorage, session: () => sessionStorage,
  fetch: (...args) => fetch(...args), now: Date.now, uuid: () => crypto.randomUUID()
});
if (typeof window !== "undefined") {
  window.addEventListener("storage", event => {
    if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) analytics.storageChanged();
    if (event.key === "heritg:account-session-change") analytics.accountChanged();
  });
  window.addEventListener("heritg:account-session-changed", analytics.accountChanged);
}
