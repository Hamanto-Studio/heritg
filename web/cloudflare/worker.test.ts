// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./worker";
import vercel from "../vercel.template.json";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, verify } from "node:crypto";

const origin = "https://staging.heritg.us";
const backend = "https://heritg-share-api-1079742937646.asia-southeast2.run.app";
function setup() {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: "ok" }));
  vi.stubGlobal("fetch", fetchMock);
  const assets = vi.fn().mockResolvedValue(new Response('<div id="root"></div>', { headers: { "content-type": "text/html" } }));
  const env = { DEPLOYMENT_ENV: "staging", API_ORIGIN: backend, APP_ORIGIN: origin, ASSETS: { fetch: assets } };
  return { fetchMock, assets, env };
}
afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare staging boundary", () => {
  it("preserves the consent and privacy headers for cookie-free analytics without caching", async () => {
    const { env, fetchMock } = setup();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await worker.fetch(new Request(origin + "/api/v1/analytics/journeys", {
      method: "POST", body: "{}",
      headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json",
        "x-heritg-analytics-consent": "1", dnt: "1", "sec-gpc": "1" }
    }), env);
    expect(response.status).toBe(204);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.href).toBe(backend + "/api/v1/analytics/journeys");
    for (const name of ["x-heritg-analytics-consent", "dnt", "sec-gpc"]) expect(options.headers.get(name)).toBe("1");
    for (const name of ["cookie", "authorization", "referer"]) expect(options.headers.has(name)).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("locks infrastructure to staging and disables public preview URLs and sensitive logs", () => {
    const config = JSON.parse(readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8"));
    expect(Object.keys(config.env)).toEqual(["staging", "production"]);
    expect(config.env.production.vars.API_ORIGIN).toBe("https://heritg-share-api-ulvjjfvqpq-et.a.run.app");
    expect(config.env.production.secrets.required).toEqual(["EDGE_CLIENT_IP_PRIVATE_KEY"]);
    expect(config.env.staging.vars.API_ORIGIN).toBe(backend);
    expect(config.env.staging.routes).toEqual([]);
    expect(config.preview_urls).toBe(false);
    expect(config.workers_dev).toBe(false);
    expect(config.observability.enabled).toBe(false);
    expect(config.observability.logs.invocation_logs).toBe(false);
    expect(config.env.staging.assets.run_worker_first).not.toContain("/assets/*");
    expect(config.env.staging.assets.not_found_handling).toBe("none");
  });

  it("streams the body to the pinned host with cookies, CSRF, account and payment idempotency headers", async () => {
    const { env, fetchMock } = setup();
    const request = new Request(origin + "/api/v1/billing/checkouts", { method: "POST", body: '{"planId":"six_months"}',
      headers: { origin, "content-type": "application/json", cookie: "session=synthetic", "x-csrf-token": "synthetic",
        "x-heritg-account-id": "synthetic", "idempotency-key": "synthetic", "sec-fetch-site": "same-origin",
        "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "1.2.3.4", "x-internal-token": "must-not-forward" } });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.href).toBe(backend + "/api/v1/billing/checkouts");
    expect(options.body).toBe(request.body);
    expect(options.redirect).toBe("manual");
    expect(options.cache).toBe("no-store");
    for (const name of ["cookie", "x-csrf-token", "x-heritg-account-id", "idempotency-key", "origin"]) {
      expect(options.headers.get(name)).toBe(request.headers.get(name));
    }
    for (const name of ["x-forwarded-for", "cf-connecting-ip", "x-internal-token"]) expect(options.headers.has(name)).toBe(false);
  });

  it("requires HTTPS before forwarding public API requests and redirects plaintext navigation", async () => {
    const { env, fetchMock } = setup();
    expect((await worker.fetch(new Request("http://staging.heritg.us/api/v1/auth/session"), env)).status).toBe(426);
    expect((await worker.fetch(new Request("http://staging.heritg.us/api/v1/share-uploads", { method: "POST", body: "{}" }), env)).status).toBe(426);
    const navigation = await worker.fetch(new Request("http://staging.heritg.us/s/synthetic"), env);
    expect(navigation.status).toBe(308);
    expect(navigation.headers.get("location")).toBe("https://staging.heritg.us/s/synthetic");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await worker.fetch(new Request("http://127.0.0.1:8787/health"), env)).status).toBe(200);
  });

  it("preserves multiple host-only cookies, backend errors and security headers without caching", async () => {
    const { env, fetchMock } = setup();
    const headers = new Headers({ "content-type": "application/json", "cache-control": "public, max-age=600" });
    headers.append("set-cookie", "__Host-heritg_session=synthetic; Secure; HttpOnly; Path=/; SameSite=Lax");
    headers.append("set-cookie", "__Host-heritg_csrf=synthetic; Secure; Path=/; SameSite=Lax");
    fetchMock.mockResolvedValue(new Response('{"error":{"code":"unauthenticated"}}', { status: 401, headers }));
    const response = await worker.fetch(new Request(origin + "/api/v1/auth/session"), env);
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    for (const { key, value } of vercel.headers[0].headers) expect(response.headers.get(key)).toBe(value);
    expect(await response.json()).toEqual({ error: { code: "unauthenticated" } });
  });

  it.each(["/api/v1/internal/admin", "/api/v1/billing/webhook", "/api/v1/share-uploads%2fcomplete", "/api", "/api/v1/unknown"])("does not forward %s", async path => {
    const { env, fetchMock } = setup();
    expect((await worker.fetch(new Request(origin + path), env)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects production wiring, cross-origin requests and unsupported methods", async () => {
    const { env, fetchMock } = setup();
    expect((await worker.fetch(new Request("https://heritg.us/api/v1/auth/session"), env)).status).toBe(421);
    expect((await worker.fetch(new Request(origin + "/health"), { ...env, API_ORIGIN: "https://production.run.app" })).status).toBe(503);
    expect((await worker.fetch(new Request(origin + "/api/v1/auth/session", { headers: { origin: "https://evil.example" } }), env)).status).toBe(403);
    expect((await worker.fetch(new Request(origin + "/api/v1/auth/session", { method: "PUT" }), env)).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not follow redirects, expose errors or retry writes", async () => {
    const { env, fetchMock } = setup();
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://evil.example" } }));
    const response = await worker.fetch(new Request(origin + "/api/v1/share-uploads", { method: "POST", body: "{}" }), env);
    expect(response.status).toBe(502);
    expect(response.headers.has("location")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValue(new Error("secret-token"));
    expect(await (await worker.fetch(new Request(origin + "/health"), env)).text()).not.toContain("secret-token");
  });

  it("does not send share fragments, passwords or cookies to the static asset binding", async () => {
    const { env, assets, fetchMock } = setup();
    const response = await worker.fetch(new Request(origin + "/s/synthetic#k=secret", { headers: { cookie: "synthetic" } }), env);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(assets.mock.calls[0][0].url).toBe(origin + "/index.html");
    expect(assets.mock.calls[0][0].headers.has("cookie")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never responds with HTML for a missing hashed asset", async () => {
    const { env } = setup();
    expect((await worker.fetch(new Request(origin + "/assets/missing.js"), env)).status).toBe(404);
  });

  it("requires the production signing secret, pins the live backend, and replaces visitor-supplied proofs", async () => {
    const { env, fetchMock } = setup();
    const pair = generateKeyPairSync("ed25519");
    const live = { ...env, DEPLOYMENT_ENV: "production", APP_ORIGIN: "https://heritg.us", API_ORIGIN: "https://heritg-share-api-ulvjjfvqpq-et.a.run.app" };
    const request = new Request("https://heritg.us/api/v1/billing/plans", { headers: {
      "cf-connecting-ip": "203.0.113.10", "x-heritg-edge-ip": "forged", "x-forwarded-for": "192.0.2.1"
    } });
    expect((await worker.fetch(request, live)).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    const response = await worker.fetch(request, { ...live, EDGE_CLIENT_IP_PRIVATE_KEY: pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url") });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-heritg-hosting")).toBe("cloudflare-production");
    expect(response.headers.has("x-heritg-edge-ip")).toBe(false);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.href).toBe(live.API_ORIGIN + "/api/v1/billing/plans");
    const [encoded, signature] = options.headers.get("x-heritg-edge-ip").split(".");
    const bytes = Buffer.from(encoded, "base64url");
    expect(verify(null, bytes, pair.publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    expect(JSON.parse(bytes.toString())).toEqual(["HTGIP01", "production", "GET", "/api/v1/billing/plans", "203.0.113.10", expect.any(Number)]);
    expect(options.headers.has("x-forwarded-for")).toBe(false);
    expect((await worker.fetch(new Request(origin + "/health"), live)).status).toBe(421);
  });

  it.each(["sw.js", "registerSW.js", "manifest.webmanifest"])("revalidates %s when routed through the Worker", async path => {
    const { env, assets } = setup();
    assets.mockResolvedValue(new Response("synthetic", { headers: { "content-type": "text/javascript" } }));
    expect((await worker.fetch(new Request(origin + "/" + path), env)).headers.get("cache-control")).toContain("must-revalidate");
  });
});
