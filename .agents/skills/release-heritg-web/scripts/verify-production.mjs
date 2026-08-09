#!/usr/bin/env node

const args = process.argv.slice(2);
const target = args.find((argument) => !argument.startsWith("--")) ?? "https://heritg.us/";
const versionIndex = args.indexOf("--expect-version");
const expectedVersion = versionIndex >= 0 ? args[versionIndex + 1] : undefined;
const landingIndex = args.indexOf("--landing");
const landingTarget = landingIndex >= 0 ? args[landingIndex + 1] : "https://family.heritg.us/en/";

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
const request = async (path, options = {}) => {
  const url = path instanceof URL
    ? path
    : path.startsWith("/")
      ? new URL(path, appBase.origin)
      : new URL(path, appBase);
  const response = await fetch(url, { redirect: "follow", ...options });
  checked.push(`${response.status} ${url.pathname}`);
  if (!response.ok) failures.push(`${url.pathname} returned ${response.status}`);
  return response;
};

try {
  const landingUrl = new URL(landingTarget);
  const landing = await fetch(landingUrl, { redirect: "follow" });
  checked.push(`${landing.status} ${landingUrl.href}`);
  if (!landing.ok) failures.push(`${landingUrl.href} returned ${landing.status}`);
  const landingHtml = await landing.text();
  if (!landingHtml.includes('href="https://heritg.us/"')) {
    failures.push("landing page does not link to https://heritg.us/");
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

  const apiProbeUrl = new URL("/api/v1/share-uploads", appBase.origin);
  const apiProbe = await fetch(apiProbeUrl, {
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
