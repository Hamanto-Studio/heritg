#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const origin = process.env.HERITG_STAGING_API_ORIGIN;
const expectedOrigin = "https://heritg-share-api-1079742937646.asia-southeast2.run.app";

if (!origin) {
  process.stderr.write(
    "Staging deployment refused: set HERITG_STAGING_API_ORIGIN to the isolated staging Cloud Run origin.\n"
  );
  process.exit(1);
}
if (new URL(origin).origin !== expectedOrigin) {
  process.stderr.write("Staging deployment refused: backend origin is not the isolated heritg-be-stg service.\n");
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
