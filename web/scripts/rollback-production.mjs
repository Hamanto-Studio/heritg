#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const verifier = resolve(repositoryRoot, ".agents/skills/release-heritg-web/scripts/verify-production.mjs");
const target = process.argv[2];
const production = "https://heritg.us/";
const vercelCli = ["--yes", "vercel@58.4.4"];

if (!target) {
  process.stderr.write("Usage: npm --prefix web run rollback:production -- <deployment-id-or-url>\n");
  process.exit(1);
}

const inspect = (value) => JSON.parse(execFileSync("npx", [
  ...vercelCli,
  "inspect",
  value,
  "--json",
  "--cwd",
  repositoryRoot
], { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));

const deployment = inspect(target);
if (deployment.target !== "production" || deployment.readyState !== "READY" || !deployment.id) {
  process.stderr.write("Production rollback refused: target must be an exact ready Production deployment.\n");
  process.exit(1);
}

execFileSync("npx", [
  ...vercelCli,
  "rollback",
  deployment.id,
  "--yes",
  "--cwd",
  repositoryRoot
], { cwd: repositoryRoot, stdio: "inherit" });

const restored = inspect(production);
if (restored.id !== deployment.id) {
  throw new Error(`Production points to ${restored.id}, expected ${deployment.id}.`);
}
execFileSync(process.execPath, [
  verifier,
  production,
  "--cors-origin",
  new URL(production).origin
], { cwd: repositoryRoot, stdio: "inherit" });
process.stdout.write(`Production rollback to ${deployment.id} completed and passed verification.\n`);
