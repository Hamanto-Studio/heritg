#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Only create an isolated candidate here. Attaching the canonical domain is a
// separate operation after HTTP/browser checks and an exact DNS backup.
if (process.argv.slice(2).some(arg => arg !== "--dry-run")) throw new Error("Only --dry-run is supported; this command never changes DNS.");
const dryRun = process.argv.includes("--dry-run");
const run = (command, args) => execFileSync(command, args, { cwd: web, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
if (!dryRun) run("npx", ["--no-install", "wrangler", "whoami"]);
run("npm", ["run", "cloudflare:build:staging"]);
run("npm", ["run", "cloudflare:check"]);
const config = JSON.parse(readFileSync(resolve(web, "cloudflare/wrangler.jsonc"), "utf8"));
const staging = config.env.staging;
if (staging.name !== "heritg-staging" || staging.vars.APP_ORIGIN !== "https://staging.heritg.us" || staging.routes.length) {
  throw new Error("Staging candidate configuration has unexpected deployment targets");
}
const candidate = { ...config, main: resolve(web, "cloudflare/worker.ts"), env: undefined,
  name: "heritg-staging-candidate", workers_dev: true, preview_urls: false, routes: [], vars: staging.vars,
  assets: { ...staging.assets, directory: resolve(web, ".cloudflare-staging/assets") } };
const path = resolve(web, ".cloudflare-staging/candidate.jsonc");
writeFileSync(path, JSON.stringify(candidate, null, 2) + "\n");
run("npx", ["--no-install", "wrangler", "deploy", "--config", path, ...(dryRun ? ["--dry-run"] : [])]);
console.log(dryRun ? "Candidate dry run passed; no cloud resources or DNS changed." :
  "Candidate deployed. Verify its workers.dev URL, then follow docs/CLOUDFLARE_STAGING.md before attaching staging.heritg.us. Production was not targeted.");
