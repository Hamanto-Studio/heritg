#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// Two phases permit browser review of a production-configured candidate.
// No DOKU checkout or DNS deletion is performed by this tool.
const web = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(web, ".cloudflare-production");
const args = process.argv.slice(2);
const phase = args[0];
assert(["candidate", "publish"].includes(phase), "Choose candidate or publish");
assert(args.slice(1).every(arg => ["--dry-run", "--payments-disabled", "--initial-cutover"].includes(arg)));
const dry = args.includes("--dry-run");
const initial = args.includes("--initial-cutover");
const run = (command, argv, capture = false) => execFileSync(command, argv, { cwd: web, encoding: "utf8",
  stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
const wrangler = (...argv) => run("npx", ["--no-install", "wrangler", ...argv]);
const git = (...argv) => run("git", argv, true).trim();
const commit = git("rev-parse", "HEAD");
if (!dry) assert.equal(git("status", "--porcelain"), "", "Commit and review all release changes first");
const verify = target => run(process.execPath, ["scripts/verify-cloudflare-staging.mjs", target, "--production", ...(args.includes("--payments-disabled") ? ["--payments-disabled"] : [])]);
const digest = directory => {
  const hash = createHash("sha256");
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      assert(!item.isSymbolicLink());
      const path = join(dir, item.name);
      if (item.isDirectory()) walk(path); else { hash.update(path.slice(directory.length)); hash.update(readFileSync(path)); }
    }
  }
  walk(directory); return hash.digest("hex");
};
const config = JSON.parse(readFileSync(resolve(web, "cloudflare/wrangler.jsonc"), "utf8"));
const live = config.env.production;
assert.equal(live.name, "heritg");
assert.equal(live.vars.APP_ORIGIN, "https://heritg.us");
assert.equal(live.vars.API_ORIGIN, "https://heritg-share-api-ulvjjfvqpq-et.a.run.app");
const common = { ...config, env: undefined, ...live, main: resolve(web, "cloudflare/worker.ts"),
  assets: { ...live.assets, directory: resolve(root, "assets") } };
const candidate = { ...common, name: "heritg-production-candidate", workers_dev: true, preview_urls: false, routes: [] };
const canonical = { ...common, name: "heritg", workers_dev: false, preview_urls: false,
  routes: [{ pattern: "heritg.us", custom_domain: true, zone_id: "3b1bc5f974095fa0b5dcf72f9998d82d" }] };
const candidatePath = resolve(root, "candidate.jsonc");
const canonicalPath = resolve(root, "canonical.jsonc");
const secrets = process.env.HERITG_EDGE_SECRETS_FILE;
const secretArgs = !dry && secrets ? ["--secrets-file", resolve(secrets)] : [];

if (phase === "candidate") {
  run("npm", ["run", "cloudflare:build:production"]);
  run("npm", ["run", "cloudflare:check"]);
  writeFileSync(candidatePath, JSON.stringify(candidate, null, 2) + "\n");
  wrangler("deploy", "--config", candidatePath, ...(dry ? ["--dry-run"] : []), ...secretArgs);
  if (!dry) verify("https://heritg-production-candidate.heritg.workers.dev");
  writeFileSync(resolve(root, "candidate-evidence.json"), JSON.stringify({ commit, assets: digest(resolve(root, "assets")), verified: !dry }) + "\n");
  console.log("Candidate checks complete. Canonical production was not changed. Browser review is separate.");
} else {
  const evidence = JSON.parse(readFileSync(resolve(root, "candidate-evidence.json"), "utf8"));
  assert.equal(evidence.commit, commit, "Candidate must match the checked-out commit");
  assert.equal(evidence.assets, digest(resolve(root, "assets")), "Do not change or rebuild the tested assets");
  if (!dry) { assert(evidence.verified); verify("https://heritg-production-candidate.heritg.workers.dev"); }
  let previous;
  if (!dry && !initial) {
    const current = await fetch("https://heritg.us", { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(30_000) });
    assert.equal(current.headers.get("x-heritg-hosting"), "cloudflare-production", "Initial migration requires --initial-cutover and a reviewed DNS backup");
    const deployments = JSON.parse(run("npx", ["--no-install", "wrangler", "deployments", "list", "--name", "heritg", "--json"], true));
    const last = deployments.sort((a, b) => b.created_on.localeCompare(a.created_on))[0];
    assert(last?.versions.length === 1 && last.versions[0].percentage === 100);
    previous = last.versions[0].version_id;
    assert.match(previous, /^[a-f0-9-]{36}$/);
    writeFileSync(resolve(root, "previous-worker-version.json"), JSON.stringify({ version: previous }) + "\n");
  }
  if (!dry && initial) assert.equal(process.env.HERITG_INITIAL_CUTOVER_CONFIRM, "heritg.us", "Explicit initial domain migration approval required");
  writeFileSync(canonicalPath, JSON.stringify(canonical, null, 2) + "\n");
  try {
    wrangler("deploy", "--config", canonicalPath, ...(dry ? ["--dry-run"] : []), ...secretArgs);
    if (!dry) verify("https://heritg.us");
  } catch (error) {
    if (!dry && previous) { wrangler("rollback", previous, "--config", canonicalPath, "--yes"); }
    console.error(initial ? "Initial cutover failed. Restore the reviewed DNS target if canonical verification fails; do not enable payments." : "Publish failed; verify the recorded rollback version before retrying.");
    throw error;
  }
  if (!dry) {
    writeFileSync(candidatePath, JSON.stringify({ ...candidate, workers_dev: false }, null, 2) + "\n");
    wrangler("triggers", "deploy", "--config", candidatePath);
  }
  console.log(dry ? "Production publish dry run passed; no remote changes." : "Production Cloudflare app published and verified. No payment was created.");
}
