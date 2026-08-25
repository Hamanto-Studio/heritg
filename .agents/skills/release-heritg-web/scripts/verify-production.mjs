#!/usr/bin/env node

const args = process.argv.slice(2);
const target = args.find((argument) => !argument.startsWith("--")) ?? "https://heritg.us/";
const versionIndex = args.indexOf("--expect-version");
const expectedVersion = versionIndex >= 0 ? args[versionIndex + 1] : undefined;
const landingIndex = args.indexOf("--landing");
const landingTarget = landingIndex >= 0 ? args[landingIndex + 1] : "https://family.heritg.us/en/";
const corsOriginIndex = args.indexOf("--cors-origin");
const expectedCorsOrigin = corsOriginIndex >= 0 ? args[corsOriginIndex + 1] : "https://heritg.us";
const skipShareSmoke = args.includes("--skip-share-smoke");
const skipLanding = args.includes("--skip-landing");

const SHARE_VERSION = "HTGSHR02";
const SHARE_MAGIC = new TextEncoder().encode(SHARE_VERSION);
const SHARE_PASSWORD_ITERATIONS = 600_000;
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GENERATION_PATTERN = /^[1-9][0-9]{0,30}$/;
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

let appBase;
try {
  appBase = new URL(target);
  if (!appBase.pathname.endsWith("/")) appBase.pathname += "/";
} catch {
  console.error(`Production verification failed: invalid URL ${target}`);
  process.exit(1);
}
if (appBase.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(appBase.hostname)) {
  console.error("Production verification failed: the target must use HTTPS");
  process.exit(1);
}

const failures = [];
const checked = [];
const fetchWithContext = async (url, options) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error
      ? `: ${error.cause.message}` : "";
    throw new Error(`fetch failed for ${url}${cause}`);
  }
};
const request = async (path, options = {}) => {
  const url = path instanceof URL
    ? path
    : path.startsWith("/")
      ? new URL(path, appBase.origin)
      : new URL(path, appBase);
  const response = await fetchWithContext(url, { redirect: "follow", ...options });
  checked.push(`${response.status} ${url.pathname}`);
  if (!response.ok) failures.push(`${url.pathname} returned ${response.status}`);
  return response;
};

const postJson = async (path, body) => {
  const url = new URL(path, appBase.origin);
  const response = await fetchWithContext(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer"
  });
  checked.push(`${response.status} ${url.pathname}`);
  let value;
  try { value = await response.json(); } catch { value = undefined; }
  if (!response.ok) {
    const code = value?.error?.code ?? "unreadable_error";
    throw new Error(`${url.pathname} rejected the ${SHARE_VERSION} release smoke test with ${response.status} ${code}`);
  }
  return value;
};

const assertString = (object, field, pattern) => {
  const value = object?.[field];
  if (typeof value !== "string" || (pattern && !pattern.test(value))) {
    throw new Error(`sharing API returned an invalid ${field}`);
  }
  return value;
};

const shareAad = (shareId) => {
  const id = new TextEncoder().encode(shareId);
  const aad = new Uint8Array(SHARE_MAGIC.byteLength + 1 + id.byteLength);
  aad.set(SHARE_MAGIC);
  aad.set(id, SHARE_MAGIC.byteLength + 1);
  return aad;
};

const runEncryptedShareSmoke = async () => {
  const plaintext = new TextEncoder().encode("Synthetic HERITG production release smoke payload");
  const envelopeBytes = plaintext.byteLength + 52;
  let shareId;
  let deletionToken;
  try {
    const allocation = await postJson("/api/v1/share-uploads", {
      envelopeVersion: SHARE_VERSION,
      ciphertextBytes: envelopeBytes,
      expiryDays: 1
    });
    shareId = assertString(allocation, "shareId", SHARE_ID_PATTERN);
    deletionToken = assertString(allocation, "deletionToken", TOKEN_PATTERN);
    const uploadUrl = assertString(allocation, "uploadUrl");
    const requiredHeaders = allocation?.requiredHeaders;
    if (!requiredHeaders || typeof requiredHeaders !== "object" || Array.isArray(requiredHeaders) ||
        Object.values(requiredHeaders).some((value) => typeof value !== "string")) {
      throw new Error("sharing API returned invalid required upload headers");
    }

    const password = "SyntheticRelease9Password";
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: SHARE_PASSWORD_ITERATIONS },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: shareAad(shareId), tagLength: 128 },
      key,
      plaintext
    ));
    const envelope = new Uint8Array(envelopeBytes);
    envelope.set(SHARE_MAGIC);
    envelope.set(salt, 8);
    envelope.set(nonce, 24);
    envelope.set(ciphertext, 36);

    const requestedHeaderNames = Object.keys(requiredHeaders).join(", ");
    const preflight = await fetch(uploadUrl, {
      method: "OPTIONS",
      headers: {
        origin: expectedCorsOrigin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": requestedHeaderNames
      },
      redirect: "error"
    });
    checked.push(`${preflight.status} signed upload CORS preflight`);
    if (!preflight.ok || preflight.headers.get("access-control-allow-origin") !== expectedCorsOrigin) {
      throw new Error(`encrypted upload CORS does not allow ${expectedCorsOrigin}`);
    }

    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: { ...requiredHeaders, origin: expectedCorsOrigin },
      body: envelope,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
    checked.push(`${upload.status} signed encrypted upload`);
    if (!upload.ok) throw new Error(`signed encrypted upload returned ${upload.status}`);
    if (upload.headers.get("access-control-allow-origin") !== expectedCorsOrigin) {
      throw new Error(`encrypted upload response does not allow ${expectedCorsOrigin}`);
    }
    const objectGeneration = upload.headers.get("x-goog-generation");
    if (!objectGeneration || !GENERATION_PATTERN.test(objectGeneration)) {
      throw new Error("signed upload did not expose a valid object generation");
    }

    await postJson("/api/v1/share-uploads/complete", { shareId, deletionToken, objectGeneration });
    const grant = await postJson("/api/v1/share-downloads", { shareId });
    if (grant?.envelopeVersion !== SHARE_VERSION || grant?.ciphertextBytes !== envelopeBytes) {
      throw new Error("download grant did not preserve the release share protocol");
    }
    const downloadUrl = assertString(grant, "downloadUrl");
    const download = await fetch(downloadUrl, {
      headers: { origin: expectedCorsOrigin },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
    checked.push(`${download.status} signed encrypted download`);
    if (!download.ok) throw new Error(`signed encrypted download returned ${download.status}`);
    if (download.headers.get("access-control-allow-origin") !== expectedCorsOrigin) {
      throw new Error(`encrypted download response does not allow ${expectedCorsOrigin}`);
    }
    const downloaded = new Uint8Array(await download.arrayBuffer());
    const opened = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: downloaded.slice(24, 36), additionalData: shareAad(shareId), tagLength: 128 },
      key,
      downloaded.slice(36)
    ));
    if (opened.byteLength !== plaintext.byteLength || !opened.every((byte, index) => byte === plaintext[index])) {
      throw new Error("encrypted share round trip changed the synthetic payload");
    }
  } finally {
    if (shareId && deletionToken) {
      try {
        await postJson("/api/v1/share-revocations", { shareId, deletionToken });
      } catch {
        failures.push("synthetic share cleanup failed; production verification must not pass");
      }
    }
  }
};

try {
  if (!skipLanding) {
    const landingUrl = new URL(landingTarget);
    const landing = await fetchWithContext(landingUrl, { redirect: "follow" });
    checked.push(`${landing.status} ${landingUrl.href}`);
    if (!landing.ok) failures.push(`${landingUrl.href} returned ${landing.status}`);
    const landingHtml = await landing.text();
    if (!landingHtml.includes('href="https://heritg.us/"')) {
      failures.push("landing page does not link to https://heritg.us/");
    }
  }

  const home = await request("");
  const html = await home.text();
  const requiredHeaders = {
    "content-security-policy": ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'"],
    "strict-transport-security": ["max-age="],
    "x-content-type-options": ["nosniff"],
    "x-frame-options": ["DENY"],
    "referrer-policy": ["no-referrer"],
    "permissions-policy": ["camera=()", "microphone=()"],
    "cross-origin-opener-policy": ["same-origin"],
    "cross-origin-resource-policy": ["same-origin"]
  };
  for (const [name, fragments] of Object.entries(requiredHeaders)) {
    const value = home.headers.get(name) ?? "";
    for (const fragment of fragments) {
      if (!value.includes(fragment)) failures.push(`${name} is missing ${fragment}`);
    }
  }
  const contentSecurityPolicy = home.headers.get("content-security-policy") ?? "";
  if (expectedVersion && (!contentSecurityPolicy.includes("https://accounts.google.com/gsi/client") ||
      contentSecurityPolicy.includes("challenges.cloudflare.com"))) {
    failures.push("content-security-policy is not restricted to Google account authentication");
  }

  const manifest = await request("manifest.webmanifest");
  try {
    const manifestBody = await manifest.json();
    if (!manifestBody.name || manifestBody.start_url !== "/" || manifestBody.scope !== "/" || !Array.isArray(manifestBody.icons)) {
      failures.push("manifest.webmanifest is missing required PWA fields");
    }
    for (const icon of manifestBody.icons ?? []) await request(icon.src);
  } catch {
    failures.push("manifest.webmanifest is not valid JSON");
  }

  await request("sw.js");
  await request("registerSW.js");
  const deepRoute = await request("release-verification/deep-link");
  const deepHtml = await deepRoute.text();
  if (!deepHtml.includes('<div id="root"></div>')) failures.push("SPA deep-link fallback did not return the app shell");
  const health = await request("health");
  try {
    const healthBody = await health.json();
    if (healthBody.status !== "ok") failures.push("health endpoint did not report ok");
  } catch {
    failures.push("health endpoint did not return JSON");
  }
  const ready = await request("ready");
  try {
    const readyBody = await ready.json();
    if (readyBody.status !== "ready") failures.push("ready endpoint did not report ready");
  } catch {
    failures.push("ready endpoint did not return JSON");
  }

  const sessionUrl = new URL("/api/v1/auth/session", appBase.origin);
  const anonymousSession = await fetchWithContext(sessionUrl, {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer"
  });
  checked.push(`${anonymousSession.status} ${sessionUrl.pathname} (expected anonymous denial)`);
  let anonymousSessionBody;
  try { anonymousSessionBody = await anonymousSession.json(); } catch { anonymousSessionBody = undefined; }
  if (anonymousSession.status !== 401 || anonymousSessionBody?.error?.code !== "unauthenticated") {
    failures.push("anonymous account session did not return 401 unauthenticated");
  }

  for (const [path, expectedStatus, label] of [
    ["/api/v1/entitlements/free-access", 401, "free Family access"],
    ["/api/v1/billing/checkouts", 503, "disabled payment checkout"]
  ]) {
    const endpoint = new URL(path, appBase.origin);
    const response = await fetchWithContext(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", origin: expectedCorsOrigin },
      body: "{}",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
    checked.push(`${response.status} ${endpoint.pathname} (expected ${label})`);
    if (response.status !== expectedStatus) failures.push(`${label} returned ${response.status}; expected ${expectedStatus}`);
  }

  const nonceUrl = new URL("/api/v1/auth/login-nonce", appBase.origin);
  const nonceResponse = await fetchWithContext(nonceUrl, {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer"
  });
  checked.push(`${nonceResponse.status} ${nonceUrl.pathname}`);
  let nonceBody;
  try { nonceBody = await nonceResponse.json(); } catch { nonceBody = undefined; }
  if (nonceResponse.status !== 200 || !exactKeys(nonceBody, ["nonce", "state", "expiresAt"]) ||
      !TOKEN_PATTERN.test(nonceBody?.nonce) || !TOKEN_PATTERN.test(nonceBody?.state) ||
      typeof nonceBody?.expiresAt !== "string" || !Number.isFinite(Date.parse(nonceBody.expiresAt))) {
    failures.push("account login nonce did not return the strict public response contract");
  }

  for (const [path, body] of [
    ["/api/v1/auth/email/request", { email: "release-check@example.com", turnstileToken: "disabled" }],
    ["/api/v1/auth/email/verify", { token: "a".repeat(43) }]
  ]) {
    const emailUrl = new URL(path, appBase.origin);
    const disabledEmail = await fetchWithContext(emailUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: expectedCorsOrigin,
        "sec-fetch-site": "same-origin"
      },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
    checked.push(`${disabledEmail.status} ${emailUrl.pathname} (expected disabled provider)`);
    let disabledEmailBody;
    try { disabledEmailBody = await disabledEmail.json(); } catch { disabledEmailBody = undefined; }
    if (disabledEmail.status !== 503 || disabledEmailBody?.error?.code !== "service_unavailable") {
      failures.push(`${emailUrl.pathname} is not disabled`);
    }
  }

  const apiProbeUrl = new URL("/api/v1/share-uploads", appBase.origin);
  const apiProbe = await fetchWithContext(apiProbeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer"
  });
  checked.push(`${apiProbe.status} ${apiProbeUrl.pathname} (expected validation response)`);
  if (apiProbe.status !== 400) {
    failures.push(`${apiProbeUrl.pathname} returned ${apiProbe.status}; expected backend validation status 400`);
  } else {
    try {
      const apiProbeBody = await apiProbe.json();
      if (apiProbeBody?.error?.code !== "invalid_request") {
        failures.push("sharing API validation probe returned an unexpected error code");
      }
    } catch {
      failures.push("sharing API validation probe did not return JSON");
    }
  }

  if (!skipShareSmoke) await runEncryptedShareSmoke();

  const assetPaths = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((match) => match[1]);
  if (assetPaths.length === 0) failures.push("no hashed Vite assets were found in the app shell");
  const assetBodies = [];
  for (const assetPath of [...new Set(assetPaths)]) {
    const asset = await request(assetPath);
    if (!/max-age=31536000/i.test(asset.headers.get("cache-control") ?? "") ||
        !/immutable/i.test(asset.headers.get("cache-control") ?? "")) {
      failures.push(`${assetPath} is missing immutable one-year caching`);
    }
    if (assetPath.endsWith(".js")) assetBodies.push(await asset.text());
  }
  if (expectedVersion && !assetBodies.some((body) => body.includes(expectedVersion))) {
    failures.push(`built JavaScript does not contain expected version ${expectedVersion}`);
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (failures.length) {
  console.error("Production verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Production verification passed for ${appBase.href}.`);
for (const item of checked) console.log(`- ${item}`);
console.log("Manual checks still required: protected preview access, responsive interaction, .heritg import/export, install, and offline restart.");
