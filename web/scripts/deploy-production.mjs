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
const refusal = validateProductionAuthConfig(origin, googleClientId);

if (refusal) {
  process.stderr.write(`Production deployment refused: ${refusal}.\n`);
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, {
  cwd: repositoryRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"]
}).trim();

if (git("status", "--porcelain")) {
  process.stderr.write("Production deployment refused: repository has uncommitted changes.\n");
  process.exit(1);
}

const shortCommit = git("rev-parse", "--short=7", "HEAD");
const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
const buildVersion = `${shortCommit}-${timestamp}`;

execFileSync(process.execPath, [
  resolve(scriptDirectory, "render-vercel-config.mjs"),
  origin
], { cwd: repositoryRoot, stdio: "inherit" });

if (git("status", "--porcelain")) {
  process.stderr.write("Production deployment refused: rendered web/vercel.json differs from the committed configuration.\n");
  process.exit(1);
}

process.stdout.write(`Deploying production build ${buildVersion} without assigning domains.\n`);
const deploymentOutput = execFileSync("npx", [
  "--yes",
  "vercel@58.4.4",
  "deploy",
  "--prod",
  "--skip-domain",
  "--cwd",
  repositoryRoot,
  "--local-config",
  "web/vercel.json",
  "--project",
  "heritg",
  "--build-env",
  "HERITG_DEPLOYMENT_ENV=production",
  "--build-env",
  `HERITG_BUILD_VERSION=${buildVersion}`,
  "--build-env",
  `HERITG_GOOGLE_CLIENT_ID=${googleClientId}`,
  "--build-env",
  "HERITG_FAMILY_BILLING_ENABLED=false"
], { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
process.stdout.write(deploymentOutput);

const deploymentUrls = deploymentOutput.match(/https:\/\/[^\s]+[.]vercel[.]app\/?/gu) ?? [];
const deploymentUrl = deploymentUrls.at(-1);
if (!deploymentUrl) {
  process.stderr.write("Production deployment refused: Vercel did not return an immutable deployment URL.\n");
  process.exit(1);
}

process.stdout.write("The production-targeted build is ready. Verifying and promoting it now.\n");
execFileSync(process.execPath, [
  resolve(scriptDirectory, "promote-production.mjs"),
  deploymentUrl
], { cwd: repositoryRoot, stdio: "inherit" });
