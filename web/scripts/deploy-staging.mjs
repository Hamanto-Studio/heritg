#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(webDirectory, "..");
const origin = process.env.HERITG_STAGING_API_ORIGIN;

if (!origin) {
  process.stderr.write(
    "Staging deployment refused: set HERITG_STAGING_API_ORIGIN to the isolated staging Cloud Run origin.\n"
  );
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
  "HERITG_DEPLOYMENT_ENV=staging"
], { cwd: repositoryRoot, stdio: "inherit" });
