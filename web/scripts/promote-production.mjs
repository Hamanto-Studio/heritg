#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { URL } from "node:url";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(webDirectory, "..");
const verifier = resolve(repositoryRoot, ".agents/skills/release-heritg-web/scripts/verify-production.mjs");
const packageJson = JSON.parse(readFileSync(resolve(webDirectory, "package.json"), "utf8"));
const vercelConfig = JSON.parse(readFileSync(resolve(webDirectory, "vercel.json"), "utf8"));
const candidate = process.argv[2];
const production = "https://heritg.us/";
const vercelCli = ["--yes", "vercel@58.4.4"];

if (!candidate) {
  process.stderr.write("Usage: node web/scripts/promote-production.mjs <tested-vercel-deployment-url>\n");
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

const inspect = (target) => JSON.parse(execFileSync("npx", [
  ...vercelCli,
  "inspect",
  target,
  "--json",
  "--cwd",
  repositoryRoot
], {
  cwd: repositoryRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"]
}));

const verify = (target, expectedVersion = packageJson.version) => {
  const args = [verifier, target];
  if (expectedVersion) args.push("--expect-version", expectedVersion);
  args.push("--cors-origin", new URL(production).origin);
  execFileSync(process.execPath, args, { cwd: repositoryRoot, stdio: "inherit" });
};

const candidateDeployment = inspect(candidateUrl.href);
if (candidateDeployment.target !== "production") {
  process.stderr.write("Production promotion refused: deployment must target Production, not Preview.\n");
  process.exit(1);
}
if (candidateDeployment.readyState !== "READY") {
  process.stderr.write(`Production promotion refused: candidate is ${candidateDeployment.readyState ?? "not ready"}.\n`);
  process.exit(1);
}
if (candidateDeployment.url !== candidateUrl.hostname) {
  process.stderr.write("Production promotion refused: use the candidate's immutable Vercel deployment URL.\n");
  process.exit(1);
}

const buildConfig = candidateDeployment.builds?.find((build) => build.entrypoint === ".")?.config;
const configMatches = buildConfig?.framework === vercelConfig.framework &&
  buildConfig?.installCommand === vercelConfig.installCommand &&
  buildConfig?.buildCommand === vercelConfig.buildCommand &&
  buildConfig?.outputDirectory === vercelConfig.outputDirectory &&
  isDeepStrictEqual(buildConfig?.vercelConfig?.rewrites, vercelConfig.rewrites) &&
  isDeepStrictEqual(buildConfig?.vercelConfig?.headers, vercelConfig.headers);
if (!configMatches) {
  process.stderr.write("Production promotion refused: candidate does not contain the expected build, routing, and security configuration.\n");
  process.exit(1);
}

process.stdout.write("Running mandatory encrypted-sharing compatibility gate before production promotion...\n");
verify(candidateUrl.href);

const previousProduction = inspect(production);
process.stdout.write("Candidate passed. Pointing production traffic to the exact verified staged deployment...\n");

try {
  execFileSync("npx", [
    ...vercelCli,
    "promote",
    candidateDeployment.id,
    "--yes",
    "--cwd",
    repositoryRoot
  ], { cwd: repositoryRoot, stdio: "inherit" });

  const promotedDeployment = inspect(production);
  if (promotedDeployment.id !== candidateDeployment.id) {
    throw new Error(`Canonical hostname points to ${promotedDeployment.id}, expected ${candidateDeployment.id}.`);
  }

  process.stdout.write("Verifying the canonical production origin after promotion...\n");
  verify(production);
} catch (promotionError) {
  process.stderr.write(`Promotion verification failed. Rolling back to ${previousProduction.id}...\n`);
  try {
    execFileSync("npx", [
      ...vercelCli,
      "rollback",
      previousProduction.id,
      "--yes",
      "--cwd",
      repositoryRoot
    ], { cwd: repositoryRoot, stdio: "inherit" });
    const restoredDeployment = inspect(production);
    if (restoredDeployment.id !== previousProduction.id) {
      throw new Error(`Rollback points to ${restoredDeployment.id}, expected ${previousProduction.id}.`);
    }
    verify(production, null);
  } catch (rollbackError) {
    throw new AggregateError([promotionError, rollbackError], "Production promotion and automatic rollback verification both failed.");
  }
  throw promotionError;
}

process.stdout.write("Production promotion and encrypted-sharing verification completed successfully.\n");
