#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Routine releases after the initial, manually reviewed DNS migration. This
// command refuses to perform the initial cutover or to repair unexpected DNS.
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(web, ".cloudflare-staging");
const canonicalOrigin = "https://staging.heritg.us";
const candidateOrigin = "https://heritg-staging-candidate.heritg.workers.dev";
const args = process.argv.slice(2);
assert(args.every(arg => arg === "--dry-run"), "Only --dry-run is supported");
const dryRun = args.includes("--dry-run");
const run = (command, argv, capture = false) => execFileSync(command, argv, {
  cwd: web, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" }
});
const wrangler = (...argv) => run("npx", ["--no-install", "wrangler", ...argv]);
const verify = origin => run(process.execPath, ["scripts/verify-cloudflare-staging.mjs", origin]);
mkdirSync(root, { recursive: true });
const lock = resolve(root, "publish.lock");
const lockFd = openSync(lock, "wx", 0o600);
let priorVersion;
try {
  writeFileSync(lockFd, String(process.pid));
  if (!dryRun) {
    // Fail before any cloud mutation if the current domain is unreachable or
    // is not already the expected Cloudflare staging app.
    verify(canonicalOrigin);
    const deployments = JSON.parse(run("npx", ["--no-install", "wrangler", "deployments", "list", "--name", "heritg-staging", "--json"], true));
    const latest = deployments.sort((a, b) => b.created_on.localeCompare(a.created_on))[0];
    assert(latest?.versions.length === 1 && latest.versions[0].percentage === 100, "Expected one active staging version for rollback");
    priorVersion = latest.versions[0].version_id;
    assert.match(priorVersion, /^[a-f0-9-]{36}$/);
    writeFileSync(resolve(root, "previous-worker-version.json"), JSON.stringify({ version: priorVersion, origin: canonicalOrigin }) + "\n");
  }
  run(process.execPath, ["scripts/deploy-cloudflare-staging.mjs", ...(dryRun ? ["--dry-run"] : [])]);
  const candidatePath = resolve(root, "candidate.jsonc");
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
  assert(candidate.name === "heritg-staging-candidate" && candidate.routes.length === 0);
  assert(candidate.vars.APP_ORIGIN === canonicalOrigin && candidate.vars.DEPLOYMENT_ENV === "staging");
  if (!dryRun) verify(candidateOrigin);
  const canonicalPath = resolve(root, "canonical.jsonc");
  writeFileSync(canonicalPath, JSON.stringify({ ...candidate, name: "heritg-staging", workers_dev: false,
    routes: [{ pattern: "staging.heritg.us", custom_domain: true, zone_id: "3b1bc5f974095fa0b5dcf72f9998d82d" }] }, null, 2) + "\n");
  try {
    // Reuse the exact built assets; do not rebuild between verification and publishing.
    wrangler("deploy", "--config", canonicalPath, ...(dryRun ? ["--dry-run"] : []));
    if (!dryRun) verify(canonicalOrigin);
  } catch (error) {
    if (!dryRun && priorVersion) {
      console.error("Staging publish failed; restoring the recorded Cloudflare version.");
      wrangler("rollback", priorVersion, "--config", canonicalPath, "--yes");
      verify(canonicalOrigin);
    }
    throw error;
  }
  if (!dryRun) {
    writeFileSync(candidatePath, JSON.stringify({ ...candidate, workers_dev: false }, null, 2) + "\n");
    wrangler("triggers", "deploy", "--config", candidatePath);
  }
  console.log(dryRun ? "Cloudflare staging publish dry run passed; no remote changes." : "Cloudflare staging published and verified. Production was not targeted.");
} finally {
  closeSync(lockFd);
  unlinkSync(lock);
}
