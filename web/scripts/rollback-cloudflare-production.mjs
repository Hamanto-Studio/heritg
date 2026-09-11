#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const version = process.argv[2];
assert.match(version ?? "", /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, "Supply an exact known-good production Worker version");
const run = args => execFileSync("npx", ["--no-install", "wrangler", ...args], { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
// Viewing the target verifies it belongs to this Worker before any mutation.
run(["versions", "view", version, "--name", "heritg", "--json"]);
run(["rollback", version, "--name", "heritg", "--yes"]);
const deployments = JSON.parse(run(["deployments", "list", "--name", "heritg", "--json"]));
const current = deployments.sort((a, b) => b.created_on.localeCompare(a.created_on))[0];
assert.deepEqual(current.versions.map(v => [v.version_id, v.percentage]), [[version, 100]]);
for (const path of ["/", "/health", "/ready", "/manifest.webmanifest", "/sw.js", "/api/v1/billing/plans"]) {
  const response = await fetch(`https://heritg.us${path}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-heritg-hosting"), "cloudflare-production");
  if (path.startsWith("/api/") || ["/health", "/ready"].includes(path)) assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  await response.body?.cancel();
}
console.log("Exact Cloudflare production version restored and public readiness verified. Payment recovery and data were not changed.");
