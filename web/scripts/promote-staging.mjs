#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(webDirectory, "..");
const verifier = resolve(repositoryRoot, ".agents/skills/release-heritg-web/scripts/verify-production.mjs");
const packageJson = JSON.parse(readFileSync(resolve(webDirectory, "package.json"), "utf8"));
const candidate = process.argv[2];
const staging = "https://staging.heritg.us/";

if (!candidate) {
  process.stderr.write("Usage: npm --prefix web run deploy:staging:promote -- <tested-vercel-deployment-url>\n");
  process.exit(1);
}

let candidateUrl;
try {
  candidateUrl = new URL(candidate);
} catch {
  process.stderr.write("Staging promotion refused: candidate deployment URL is invalid.\n");
  process.exit(1);
}
if (candidateUrl.protocol !== "https:") {
  process.stderr.write("Staging promotion refused: candidate deployment must use HTTPS.\n");
  process.exit(1);
}

const verify = (target) => execFileSync(process.execPath, [
  verifier,
  target,
  "--expect-version",
  packageJson.version,
  "--cors-origin",
  new URL(staging).origin,
  "--skip-landing"
], { cwd: repositoryRoot, stdio: "inherit" });

process.stdout.write("Running the encrypted-sharing compatibility gate for staging...\n");
verify(candidateUrl.href);

process.stdout.write("Candidate passed. Promoting the exact verified staging deployment...\n");
const promotion = spawnSync("npx", [
  "--yes",
  "vercel@58.4.4",
  "promote",
  candidateUrl.href,
  "--cwd",
  repositoryRoot,
  "--local-config",
  "web/vercel.staging.json"
], { cwd: repositoryRoot, encoding: "utf8" });
process.stdout.write(promotion.stdout ?? "");
process.stderr.write(promotion.stderr ?? "");
const alreadyCurrent = `${promotion.stdout ?? ""}${promotion.stderr ?? ""}`
  .includes("already the current production deployment");
if (promotion.status !== 0 && !alreadyCurrent) {
  throw new Error(`Staging promotion failed with status ${promotion.status ?? "unknown"}.`);
}

execFileSync("npx", [
  "--yes",
  "vercel@58.4.4",
  "alias",
  "set",
  candidateUrl.href,
  new URL(staging).hostname
], { cwd: repositoryRoot, stdio: "inherit" });

process.stdout.write("Verifying staging.heritg.us after promotion...\n");
verify(staging);
process.stdout.write("Staging promotion and encrypted-sharing verification completed successfully.\n");
