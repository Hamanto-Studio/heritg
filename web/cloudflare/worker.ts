import vercel from "../vercel.template.json";
import { Buffer } from "node:buffer";

const origins = {
  staging: { api: "https://heritg-share-api-1079742937646.asia-southeast2.run.app", app: "https://staging.heritg.us" },
  production: { api: "https://heritg-share-api-ulvjjfvqpq-et.a.run.app", app: "https://heritg.us" }
};
const securityHeaders = vercel.headers[0].headers;
const forwardedHeaders = [
  "accept", "content-type", "cookie", "authorization", "origin",
  "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "x-csrf-token",
  "x-heritg-account-id", "idempotency-key", "dnt", "sec-gpc",
];

// Only the existing browser API is reachable. Never forward internal jobs,
// payment webhooks, arbitrary destinations, or encoded routing separators.
const publicApi = /^\/api\/v1\/(?:share-(?:uploads(?:\/complete)?|downloads|revocations)|auth\/(?:login-nonce|google|session|logout|logout-all|email\/(?:request|verify))|account(?:\/share-uploads)?|entitlements\/(?:current|refresh|free-access)|billing\/(?:plans|checkouts(?:\/(?:status|pending|resume|cancel))?)|trees(?:\/[A-Za-z0-9_-]+(?:\/(?:key|snapshot|device-links|snapshot-uploads(?:\/[A-Za-z0-9_-]+\/complete)?))?)?|device-links\/[A-Za-z0-9_-]+\/redeem|analytics\/journeys)$/;

function secureResponse(response: Response, environment: string, cacheControl = "private, no-store"): Response {
  const headers = new Headers(response.headers);
  for (const { key, value } of securityHeaders) headers.set(key, value);
  headers.set("cache-control", cacheControl);
  headers.set("cdn-cache-control", "no-store");
  headers.set("cloudflare-cdn-cache-control", "no-store");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  headers.set("x-heritg-hosting", `cloudflare-${environment}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Only Cloudflare's trusted visitor address is attested, not caller-supplied
// forwarding/proof headers. No account identity, body, cookie or key is logged.
export async function edgeIpProof(request: Request, environment: string, privateKey: string): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip || ip.length > 45 || !/^[0-9a-fA-F:.]+$/.test(ip)) throw new Error("Unavailable edge context");
  const url = new URL(request.url);
  const bytes = new TextEncoder().encode(JSON.stringify(["HTGIP01", environment, request.method, url.pathname + url.search, ip, Math.floor(Date.now() / 1000)]));
  const key = await crypto.subtle.importKey("pkcs8", Buffer.from(privateKey, "base64url"), "Ed25519", false, ["sign"]);
  const signature = await crypto.subtle.sign("Ed25519", key, bytes);
  return `${Buffer.from(bytes).toString("base64url")}.${Buffer.from(signature).toString("base64url")}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const environment = env.DEPLOYMENT_ENV;
    const secured = (response: Response, cacheControl?: string) => secureResponse(response, environment, cacheControl);
    const error = (status: number, code: string) => secured(Response.json({ error: { code, message: "The request could not be completed." } }, { status }));
    const fixed = origins[environment as keyof typeof origins];
    if (!fixed || env.API_ORIGIN !== fixed.api || env.APP_ORIGIN !== fixed.app) {
      return error(503, "service_unavailable");
    }
    const API_ORIGIN = fixed.api;
    const APP_ORIGIN = fixed.app;
    const url = new URL(request.url);
    const allowedHosts = [new URL(APP_ORIGIN).hostname, `heritg-${environment}-candidate.heritg.workers.dev`, "127.0.0.1", "localhost"];
    if (!allowedHosts.includes(url.hostname)) return error(421, "invalid_origin");
    // HSTS protects returning browsers; also refuse first-visit plaintext API
    // requests. Loopback remains available for local development and smoke tests.
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      if (!["GET", "HEAD"].includes(request.method) || url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return error(426, "https_required");
      }
      url.protocol = "https:";
      return secured(Response.redirect(url.href, 308));
    }
    const api = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const health = url.pathname === "/health" || url.pathname === "/ready";
    if (api || health) {
      if (api && !publicApi.test(url.pathname)) return error(404, "not_found");
      if (!(health ? ["GET", "HEAD"] : ["GET", "HEAD", "POST", "DELETE", "OPTIONS"]).includes(request.method)) {
        return error(405, "method_not_allowed");
      }
      const origin = request.headers.get("origin");
      if (origin && origin !== APP_ORIGIN) return error(403, "invalid_origin");
      if (request.headers.get("sec-fetch-site") === "cross-site") return error(403, "invalid_origin");
      if (Number(request.headers.get("content-length")) > 64 * 1024) return error(413, "invalid_request");
      // URL components are assigned separately: a path can never replace the host.
      const upstream = new URL(API_ORIGIN);
      upstream.pathname = url.pathname;
      upstream.search = url.search;
      const headers = new Headers();
      for (const name of forwardedHeaders) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      try {
        if (env.EDGE_CLIENT_IP_PRIVATE_KEY) {
          headers.set("x-heritg-edge-ip", await edgeIpProof(request, environment, env.EDGE_CLIENT_IP_PRIVATE_KEY));
        } else if (environment === "production") {
          return error(503, "service_unavailable");
        }
        const response = await fetch(upstream, {
          method: request.method,
          headers,
          body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(30_000)
        });
        // No API currently redirects. Never follow a redirect with credentials,
        // expose an upstream location, retry a mutation, or mask errors as HTML.
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          return error(502, "service_unavailable");
        }
        return secured(response);
      } catch {
        // Deliberately no raw error, URL, body, token, or automatic invocation log.
        return error(502, "service_unavailable");
      }
    }

    if (!["GET", "HEAD"].includes(request.method)) return error(405, "method_not_allowed");
    try {
      if (url.pathname === "/terms/" || url.pathname === "/terms") {
        return secured(await env.ASSETS.fetch(new Request(new URL("/terms/index.html", url.origin), { method: request.method })), "public, max-age=0, must-revalidate");
      }
      if (url.pathname.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(url.pathname)) {
        const response = await env.ASSETS.fetch(request);
        if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
          await response.body?.cancel();
          return error(404, "not_found");
        }
        return secured(response, url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate");
      }
      // Share and auth routes get an uncached shell, never personalized HTML.
      const shell = new URL("/index.html", url.origin);
      return secured(await env.ASSETS.fetch(new Request(shell, { method: request.method })));
    } catch {
      return error(503, "service_unavailable");
    }
  }
} satisfies ExportedHandler<Env>;
