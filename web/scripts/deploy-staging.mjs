#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateStagingAuthConfig } from "./staging-auth-config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const origin = process.env.HERITG_STAGING_API_ORIGIN;
const googleClientId = process.env.HERITG_GOOGLE_CLIENT_ID;
const refusal = validateStagingAuthConfig(origin, googleClientId);

if (refusal) {
  process.stderr.write(`Staging deployment refused: ${refusal}.\n`);
  process.exit(1);
}

execFileSync(process.execPath, [
  resolve(scriptDirectory, "render-vercel-config.mjs"),
  "--staging",
  origin
], { cwd: repositoryRoot, stdio: "inherit" });

execFileSync("npx", [
  "--yes",
  "vercel@58.4.4",
  "deploy",
  "--cwd",
  repositoryRoot,
  "--local-config",
  "web/vercel.staging.json",
  "--project",
  "heritg-staging",
  "--build-env",
  "HERITG_DEPLOYMENT_ENV=staging",
  "--build-env",
  `HERITG_GOOGLE_CLIENT_ID=${googleClientId}`
], { cwd: repositoryRoot, stdio: "inherit" });
