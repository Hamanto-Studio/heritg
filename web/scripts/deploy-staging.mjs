#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateStagingAuthConfig } from "./staging-auth-config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const origin = process.env.HERITG_STAGING_API_ORIGIN;
const googleClientId = process.env.HERITG_GOOGLE_CLIENT_ID;
const turnstileSiteKey = process.env.HERITG_TURNSTILE_SITE_KEY;
const refusal = validateStagingAuthConfig(origin, googleClientId, turnstileSiteKey);
const shortCommit = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8"
}).trim();
const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], {
  cwd: repositoryRoot,
  encoding: "utf8"
}).trim());
const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
const buildVersion = `${shortCommit}${dirty ? "-dirty" : ""}-${timestamp}`;

if (refusal) {
  process.stderr.write(`Staging deployment refused: ${refusal}.\n`);
  process.exit(1);
}

execFileSync(process.execPath, [
  resolve(scriptDirectory, "render-vercel-config.mjs"),
  "--staging",
  origin
], { cwd: repositoryRoot, stdio: "inherit" });

process.stdout.write(`Deploying staging build ${buildVersion} directly from the current branch.\n`);

const deploymentRoot = mkdtempSync(join(tmpdir(), "heritg-staging-deploy-"));
try {
  cpSync(resolve(repositoryRoot, "web"), resolve(deploymentRoot, "web"), {
    recursive: true,
    filter: (source) => !["node_modules", "dist", ".vercel"].includes(basename(source))
  });
  execFileSync("npx", [
    "--yes",
    "vercel@58.4.4",
    "deploy",
    "--prod",
    "--cwd",
    deploymentRoot,
    "--local-config",
    "web/vercel.staging.json",
    "--project",
    "heritg-staging",
    "--build-env",
    "HERITG_DEPLOYMENT_ENV=staging",
    "--build-env",
    "HERITG_FAMILY_BILLING_ENABLED=true",
    "--build-env",
    `HERITG_BUILD_VERSION=${buildVersion}`,
    "--build-env",
    `HERITG_GOOGLE_CLIENT_ID=${googleClientId}`,
    "--build-env",
    `HERITG_TURNSTILE_SITE_KEY=${turnstileSiteKey}`
  ], { cwd: deploymentRoot, stdio: "inherit" });
} finally {
  rmSync(deploymentRoot, { force: true, recursive: true });
}
