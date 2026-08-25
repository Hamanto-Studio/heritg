#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateProductionAuthConfig } from "./production-auth-config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const origin = process.env.HERITG_API_ORIGIN;
const googleClientId = process.env.HERITG_GOOGLE_CLIENT_ID;
const turnstileSiteKey = process.env.HERITG_TURNSTILE_SITE_KEY;
const refusal = validateProductionAuthConfig(origin, googleClientId, turnstileSiteKey);

if (refusal) {
  process.stderr.write(`Production deployment refused: ${refusal}.\n`);
  process.exit(1);
}

const shortCommit = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8"
}).trim();
const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], {
  cwd: repositoryRoot,
  encoding: "utf8"
}).trim());
const timestamp = new Date().toISOString().replace(/\D/gu, "").slice(0, 12);
const buildVersion = `${shortCommit}${dirty ? "-dirty" : ""}-${timestamp}`;

execFileSync(process.execPath, [
  resolve(scriptDirectory, "render-vercel-config.mjs"),
  origin
], { cwd: repositoryRoot, stdio: "inherit" });

process.stdout.write(`Staging production-targeted build ${buildVersion} without assigning domains.\n`);
execFileSync("npx", [
  "--yes",
  "vercel@58.4.4",
  "deploy",
  "--prod",
  "--skip-domain",
  "--cwd",
  repositoryRoot,
  "--local-config",
  "web/vercel.json",
  "--build-env",
  "HERITG_DEPLOYMENT_ENV=production",
  "--build-env",
  `HERITG_BUILD_VERSION=${buildVersion}`,
  "--build-env",
  `HERITG_GOOGLE_CLIENT_ID=${googleClientId}`,
  "--build-env",
  `HERITG_TURNSTILE_SITE_KEY=${turnstileSiteKey}`
], { cwd: repositoryRoot, stdio: "inherit" });
