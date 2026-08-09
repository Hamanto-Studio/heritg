#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(webDirectory, "..");
const verifier = resolve(repositoryRoot, ".agents/skills/release-heritg-web/scripts/verify-production.mjs");
const packageJson = JSON.parse(readFileSync(resolve(webDirectory, "package.json"), "utf8"));
const candidate = process.argv[2];
const production = "https://heritg.us/";

if (!candidate) {
  process.stderr.write("Usage: npm --prefix web run deploy:promote -- <tested-vercel-deployment-url>\n");
  process.exit(1);
}

let candidateUrl;
try {
  candidateUrl = new URL(candidate);
} catch {
  process.stderr.write("Production promotion refused: candidate deployment URL is invalid.\n");
  process.exit(1);
}
if (candidateUrl.protocol !== "https:") {
  process.stderr.write("Production promotion refused: candidate deployment must use HTTPS.\n");
  process.exit(1);
}

const verify = (target) => execFileSync(process.execPath, [
  verifier,
  target,
  "--expect-version",
  packageJson.version,
  "--cors-origin",
  new URL(production).origin
], { cwd: repositoryRoot, stdio: "inherit" });

process.stdout.write("Running mandatory encrypted-sharing compatibility gate before production promotion...\n");
verify(candidateUrl.href);

process.stdout.write("Candidate passed. Promoting the exact verified Vercel deployment with repository routing attached...\n");
execFileSync("npx", [
  "--yes",
  "vercel@58.4.4",
  "promote",
  candidateUrl.href,
  "--cwd",
  repositoryRoot,
  "--local-config",
  "web/vercel.json"
], { cwd: repositoryRoot, stdio: "inherit" });

process.stdout.write("Verifying the canonical production origin after promotion...\n");
verify(production);
process.stdout.write("Production promotion and encrypted-sharing verification completed successfully.\n");
