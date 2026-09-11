import { describe, expect, it, vi } from "vitest";
import { ANALYTICS_CHECKOUT_KEY, ANALYTICS_CONSENT_KEY, ANALYTICS_DISCOVERY_KEY, ProductAnalytics } from "./analytics";
import { JOURNEYS, validEvent, type Journey, type Variant } from "./analyticsContract";

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: key => values.get(key) ?? null,
    key: i => [...values.keys()][i] ?? null, removeItem: key => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); } };
}
function fixture() {
  const local = storage(), session = storage();
  const flags = { enabled: true, privacy: false, online: true, now: Date.now() };
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  const options = { configured: () => flags.enabled, privacySignal: () => flags.privacy, online: () => flags.online,
    now: () => flags.now, uuid: () => crypto.randomUUID(), local: () => local, session: () => session, fetch: send };
  const client = new ProductAnalytics(options);
  return { client, local, session, flags, send, options };
}
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

describe("opt-in analytics privacy boundary", () => {
  it("keeps one upgrade funnel through sign-in and same-tab payment return, without skipping retry milestones", async () => {
    const { client, send, options, session } = fixture(); client.setConsent(true);
    client.begin("family_discovery", "free_user");
    client.accountChanged();
    expect(client.has("family_discovery")).toBe(true);
    client.reach("family_discovery", 1);
    client.reach("family_discovery", 1);
    client.begin("checkout", "yearly");
    client.advance("checkout"); client.reach("family_discovery", 2);
    await flush();
    const restored = new ProductAnalytics(options);
    restored.restoreCheckout();
    restored.end("checkout", "success");
    restored.end("family_discovery", "success");
    await flush();
    const events = send.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    const discovery = events.filter(e => e.journey === "family_discovery");
    expect(new Set(discovery.map(e => e.attemptId)).size).toBe(1);
    expect(discovery.at(-1)).toMatchObject({ step: 3, outcome: "success", variant: "free_user" });
    expect(discovery.filter(e => e.step === 1)).toHaveLength(2); // Original + idempotent restoration.
    expect(session.getItem(ANALYTICS_DISCOVERY_KEY)).toBeNull();
    expect(session.length).toBe(0);
  });
  it("drops both purchase journeys on an account change after intent or consent withdrawal", async () => {
    const { client, session, send } = fixture(); client.setConsent(true);
    client.begin("family_discovery"); client.reach("family_discovery", 1);
    client.begin("checkout", "yearly");
    client.accountChanged(); await flush();
    expect(client.has("family_discovery")).toBe(false);
    expect(session.length).toBe(0);
    expect(send).not.toHaveBeenCalled();
    client.begin("family_discovery"); client.setConsent(false);
    expect(session.length).toBe(0);
  });
  it("measures view choices using fixed enums, never names or a canvas snapshot", async () => {
    const { client, send } = fixture(); client.setConsent(true);
    client.selectedView("fan"); await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(send.mock.calls[1][1]?.body))).toMatchObject({ journey: "view_change", variant: "fan", outcome: "success" });
  });
  it("sends and persists no journey without consent; never replays pre-consent activity", async () => {
    const { client, send, session } = fixture();
    client.begin("share_create"); client.end("share_create", "success");
    expect(session.length).toBe(0);
    client.setConsent(true);
    await flush(); expect(send).not.toHaveBeenCalled();
  });
  it.each(["privacy", "enabled", "online"] as const)("honors %s gating", async flag => {
    const { client, flags, send } = fixture(); client.setConsent(true);
    flags[flag] = flag === "privacy";
    client.begin("export", "png"); await flush(); expect(send).not.toHaveBeenCalled();
  });
  it("uses no cookies, referrer, arbitrary metadata, persistent user ID, or offline queue", async () => {
    const { client, send, flags, session } = fixture(); client.setConsent(true);
    client.begin("export", "heritg"); client.end("export", "success");
    await flush(); expect(send).toHaveBeenCalledTimes(2);
    for (const [url, options] of send.mock.calls) {
      expect(url).toBe("/api/v1/analytics/journeys");
      expect(options).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error", keepalive: true });
      const body = JSON.parse(String(options?.body));
      expect(validEvent(body)).toBe(true);
      expect(Object.keys(body).sort()).toEqual(["attemptId", "journey", "outcome", "schemaVersion", "step", "variant"]);
    }
    expect(session.length).toBe(0);
    flags.online = false; client.begin("import", "heritg"); flags.online = true;
    await flush(); expect(send).toHaveBeenCalledTimes(2);
  });
  it("makes every documented journey complete once in order", async () => {
    const { client, send } = fixture(); client.setConsent(true);
    for (const journey of Object.keys(JOURNEYS) as Journey[]) {
      client.begin(journey, journey === "checkout" ? "six_month" : "default");
      for (let i = 1; i < JOURNEYS[journey].length - 1; i++) client.advance(journey);
      client.end(journey, "success"); client.end(journey, "success");
    }
    await flush();
    expect(send.mock.calls.map(([, options]) => JSON.parse(String(options?.body))).filter(event => event.outcome === "success")).toHaveLength(Object.keys(JOURNEYS).length);
  });
  it("does not mark skipped milestones or paywall clicks as a purchase", async () => {
    const { client, send } = fixture(); client.setConsent(true);
    client.begin("checkout", "yearly"); client.end("checkout", "success");
    await flush(); expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(send.mock.calls[0][1]?.body)).outcome).toBe("in_progress");
  });
  it("aborts in-flight requests and discards pending work on withdrawal", async () => {
    const { client, send, session } = fixture(); client.setConsent(true);
    send.mockImplementation((_url, options) => new Promise((_resolve, reject) => { options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))); }));
    client.begin("checkout", "yearly"); client.advance("checkout"); await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    client.setConsent(false); client.setConsent(true); await flush();
    expect(send.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(send).toHaveBeenCalledTimes(1); expect(session.length).toBe(0);
  });
  it("restores only a consenting same-tab checkout for at most 24 hours", async () => {
    const { client, session, options, flags, send } = fixture(); client.setConsent(true);
    client.begin("checkout", "three_year"); client.advance("checkout"); await flush();
    expect(Object.keys(JSON.parse(session.getItem(ANALYTICS_CHECKOUT_KEY)!)).sort()).toEqual(["event", "startedAt"]);
    const restored = new ProductAnalytics(options); restored.restoreCheckout(); restored.end("checkout", "success"); await flush();
    expect(JSON.parse(String(send.mock.calls.at(-1)?.[1]?.body)).outcome).toBe("success"); expect(session.length).toBe(0);
    client.begin("checkout", "six_month"); await flush(); flags.now += 86_400_000;
    const expired = new ProductAnalytics(options); expired.restoreCheckout(); expect(expired.has("checkout")).toBe(false); expect(session.length).toBe(0);
  });
  it("fails closed with invalid consent, expired consent, storage errors, or a collector outage", async () => {
    const { client, local, options, send, flags } = fixture();
    local.setItem(ANALYTICS_CONSENT_KEY, "true"); expect(client.status()).toBe("off");
    client.setConsent(true); flags.now += 180 * 86_400_000; expect(client.status()).toBe("off");
    const denied = new ProductAnalytics({ ...options, local: () => { throw new Error("denied"); } });
    denied.setConsent(true); denied.begin("export", "png"); await flush(); expect(send).not.toHaveBeenCalled();
    client.setConsent(true); send.mockRejectedValue(new Error("sensitive raw error"));
    client.begin("export", "png"); client.end("export", "success"); await flush(); expect(send).toHaveBeenCalledTimes(1);
  });
  it("rejects arbitrary names, variants, and injected properties at runtime", async () => {
    const { client, send } = fixture(); client.setConsent(true);
    client.begin("private family name" as Journey); client.begin("checkout", "secret" as Variant); await flush(); expect(send).not.toHaveBeenCalled();
    expect(validEvent({ schemaVersion: 1, attemptId: crypto.randomUUID(), journey: "export", variant: "png", step: 0, outcome: "in_progress", filename: "private.heritg" })).toBe(false);
  });
  it("preserves sign-in completion while removing account-bound checkout correlation", async () => {
    const { client, send, session } = fixture(); client.setConsent(true);
    client.begin("checkout", "yearly"); client.begin("sign_in", "google"); client.end("sign_in", "success");
    client.accountChanged(); await flush();
    expect(client.has("checkout")).toBe(false); expect(session.length).toBe(0);
    expect(send.mock.calls.map(([, options]) => JSON.parse(String(options?.body)))).toContainEqual(expect.objectContaining({ journey: "sign_in", outcome: "success" }));
  });
});
