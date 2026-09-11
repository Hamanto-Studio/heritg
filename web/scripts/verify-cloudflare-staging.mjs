#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const production = process.argv.includes("--production");
const environment = production ? "production" : "staging";
const origin = production ? "https://heritg.us" : "https://staging.heritg.us";
const paid = !process.argv.includes("--payments-disabled");
const target = new URL(process.argv.slice(2).find(arg => !arg.startsWith("--")) ?? origin);
const local = ["127.0.0.1", "localhost"].includes(target.hostname);
assert((target.protocol === "https:" && (target.origin === origin || target.hostname === `heritg-${environment}-candidate.heritg.workers.dev`)) ||
  (local && target.protocol === "http:"), "Verification target must be staging, its candidate, or loopback");
assert(target.pathname === "/" && !target.search && !target.hash && !target.username && !target.password, "Use only the staging origin");
const skipApi = process.argv.includes("--skip-api");
assert(!skipApi || local, "API checks cannot be skipped for remote staging");
const template = JSON.parse(readFileSync(new URL("../vercel.template.json", import.meta.url), "utf8"));
let phase = "public shell";
const check = async (path, expected = 200, options = {}) => {
  const r = await fetch(new URL(path, target), { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000), ...options });
  assert.equal(r.status, expected, `${phase}: unexpected HTTP status`);
  for (const { key, value } of template.headers[0].headers) assert.equal(r.headers.get(key), value, `${phase}: missing security header ${key}`);
  assert.equal(r.headers.get("x-heritg-hosting"), `cloudflare-${environment}`);
  assert.match(r.headers.get("x-robots-tag") ?? "", /noindex/);
  if (path.startsWith("/api/") || ["/health", "/ready"].includes(path)) assert.match(r.headers.get("cache-control") ?? "", /no-store/);
  return r;
};
const post = async (path, body, expected = 200) => {
  const r = await check(path, expected, { method: "POST", headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" }, body: JSON.stringify(body) });
  return r.json();
};

async function shareSmoke() {
  let allocation;
  try {
    const plaintext = new TextEncoder().encode("Synthetic Cloudflare staging verification; no family information.");
    allocation = await post("/api/v1/share-uploads", { envelopeVersion: "HTGSHR02", ciphertextBytes: plaintext.length + 52, expiryDays: 1 }, 201);
    assert.match(allocation.shareId, /^[A-Za-z0-9_-]{22}$/);
    assert.match(allocation.deletionToken, /^[A-Za-z0-9_-]{43}$/);
    const storageUrl = value => { const url = new URL(value); assert.equal(url.protocol, "https:"); assert.match(url.hostname, /^(?:[a-z0-9._-]+\.)?storage\.googleapis\.com$/); return url; };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const magic = new TextEncoder().encode("HTGSHR02");
    const aad = new Uint8Array([...magic, 0, ...new TextEncoder().encode(allocation.shareId)]);
    const material = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" }, material,
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, key, plaintext));
    const envelope = new Uint8Array([...magic, ...salt, ...nonce, ...encrypted]);
    const uploadUrl = storageUrl(allocation.uploadUrl);
    const cors = await fetch(uploadUrl, { method: "OPTIONS", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { origin, "access-control-request-method": "PUT", "access-control-request-headers": Object.keys(allocation.requiredHeaders).join(", ") } });
    assert(cors.ok); assert.equal(cors.headers.get("access-control-allow-origin"), origin);
    const upload = await fetch(uploadUrl, { method: "PUT", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { ...allocation.requiredHeaders, origin }, body: envelope });
    assert(upload.ok);
    const generation = upload.headers.get("x-goog-generation");
    assert.match(generation ?? "", /^[1-9][0-9]*$/);
    await post("/api/v1/share-uploads/complete", { shareId: allocation.shareId, deletionToken: allocation.deletionToken, objectGeneration: generation });
    const grant = await post("/api/v1/share-downloads", { shareId: allocation.shareId });
    const download = await fetch(storageUrl(grant.downloadUrl), { headers: { origin }, redirect: "error", signal: AbortSignal.timeout(30_000) });
    assert(download.ok); assert.equal(download.headers.get("access-control-allow-origin"), origin);
    const bytes = new Uint8Array(await download.arrayBuffer());
    assert.deepEqual(bytes, envelope);
    const opened = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(24, 36), additionalData: aad }, key, bytes.slice(36)));
    assert.deepEqual(opened, plaintext);
    const tampered = bytes.slice(36); tampered[0] ^= 1;
    await assert.rejects(() => crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, key, tampered));
  } finally {
    if (allocation?.shareId && allocation?.deletionToken) {
      await post("/api/v1/share-revocations", { shareId: allocation.shareId, deletionToken: allocation.deletionToken });
      await post("/api/v1/share-downloads", { shareId: allocation.shareId }, 404);
    }
  }
}

try {
  const html = await (await check("/")).text();
  if (production) {
    assert(!html.includes("Heritg Staging"));
    assert.equal(html, readFileSync(new URL("../.cloudflare-production/assets/index.html", import.meta.url), "utf8"), "Unexpected deployed Web build");
  } else assert.match(html, /Heritg Staging \| Test Data Only/);
  for (const path of ["/migration-check/deep-link", "/s/synthetic", "/auth/email"]) {
    assert.match(await (await check(path)).text(), /id="root"/);
  }
  await check("/assets/missing-migration-test.js", 404);
  assert.match(await (await check("/terms/")).text(), /HERITG Terms of Use/);
  const manifest = await (await check("/manifest.webmanifest")).json();
  if (production) assert(!manifest.name.includes("Staging")); else assert.match(manifest.name, /Staging/);
  assert.equal(manifest.scope, "/"); assert.equal(manifest.start_url, "/");
  for (const icon of manifest.icons) await check("/" + icon.src.replace(/^\//, ""));
  for (const path of ["/sw.js", "/registerSW.js", "/manifest.webmanifest"]) {
    assert.match((await check(path)).headers.get("cache-control") ?? "", /max-age=0|no-store/);
  }
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1]);
  assert(assets.length > 0);
  for (const path of new Set(assets)) assert.match((await check(path)).headers.get("cache-control") ?? "", /immutable/);
  console.log(`PASS ${environment} branding, security headers, deep links, missing-asset handling and PWA files`);
  if (!skipApi) {
    phase = "API readiness";
    assert.equal((await (await check("/health")).json()).status, "ok");
    assert.equal((await (await check("/ready")).json()).status, "ready");
    await check("/api/v1/auth/session", 401);
    const login = await check("/api/v1/auth/login-nonce");
    assert(login.headers.getSetCookie().some(cookie => cookie.startsWith("__Host-heritg_login_state=") && cookie.includes("Secure") && cookie.includes("HttpOnly") && cookie.includes("Path=/")));
    const catalog = await (await check("/api/v1/billing/plans")).json();
    assert.equal(catalog.purchasesEnabled, paid);
    if (!paid) assert.deepEqual(catalog.offers, []);
    else {
      assert.deepEqual(catalog.offers.map(p => [p.planId, p.price.amount, production ? p.accessMonths : p.stagingAccessMinutes]),
        production ? [["six_month", 49000, 6], ["yearly", 79000, 12], ["three_year", 199000, 36]] : [["six_month", 49000, 15], ["yearly", 79000, 20], ["three_year", 199000, 30]]);
      if (production) assert(catalog.offers.every(p => !("stagingAccessMinutes" in p)));
    }
    await post("/api/v1/billing/checkouts", { planId: "six_month" }, paid ? 401 : 503);
    await check("/api/v1/auth/session", 403, { headers: { origin: "https://untrusted.example" } });
    await post("/api/v1/share-uploads", {}, 400);
    console.log(`PASS ${environment} API, auth cookie, expected prices and anonymous/cross-origin denial`);
    phase = "synthetic encrypted-share lifecycle and cleanup";
    await shareSmoke();
    console.log("PASS encrypted upload, completion, download/decryption, tamper rejection, revocation and cleanup");
  }
  console.log(`Cloudflare ${environment} HTTP checks passed. No invoice or payment was created. Browser sign-in and payment acceptance are separate checks.`);
} catch {
  console.error(`Cloudflare ${environment} verification FAILED: ${phase}. Sensitive response details withheld. Do not switch DNS.`);
  process.exitCode = 1;
}
