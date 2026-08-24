#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flags = new Set(args.filter((argument) => argument.startsWith("--")));
const identifier = args.find((argument) => !argument.startsWith("--"));
const ci = flags.has("--ci");
const allowDirty = flags.has("--allow-dirty");
const printNotes = flags.has("--print-release-notes");

if (flags.has("--help")) {
  console.log("Usage: release-preflight.mjs [version|release/web/version|web-version] [--ci] [--allow-dirty] [--dry-run] [--print-release-notes]");
  process.exit(0);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const webDirectory = resolve(repositoryRoot, "web");
const packagePath = resolve(webDirectory, "package.json");
const lockPath = resolve(webDirectory, "package-lock.json");
const changelogPath = resolve(repositoryRoot, "CHANGELOG.md");

const fail = (message) => {
  console.error(`Release preflight failed: ${message}`);
  process.exit(1);
};

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const runGit = (...gitArgs) => {
  try {
    return execFileSync("git", gitArgs, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    fail(`git ${gitArgs.join(" ")} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const webPackage = readJson(packagePath);
const lock = readJson(lockPath);
const requested = identifier ?? webPackage.version;
const semver = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?";
const versionPattern = new RegExp(`^${semver}$`);
const branchPattern = new RegExp(`^release/web/(${semver})$`);
const tagPattern = new RegExp(`^web-(${semver})$`);

if (requested.startsWith("v") || requested.includes("/v") || requested.includes("-v")) {
  fail("versions, release branches, and tags must not use a v prefix");
}

let version;
if (versionPattern.test(requested)) {
  version = requested;
} else {
  const branchMatch = requested.match(branchPattern);
  const tagMatch = requested.match(tagPattern);
  version = branchMatch?.[1] ?? tagMatch?.[1];
}
if (!version || !versionPattern.test(version)) {
  fail(`invalid Web release identifier: ${requested}`);
}

if (webPackage.version !== version) {
  fail(`web/package.json is ${webPackage.version}, expected ${version}`);
}
if (lock.version !== version || lock.packages?.[""]?.version !== version) {
  fail(`web/package-lock.json does not consistently use ${version}`);
}
if (webPackage.engines?.node !== "22.x" || lock.packages?.[""]?.engines?.node !== "22.x") {
  fail("Web package metadata must require Node.js 22.x");
}

const changelog = readFileSync(changelogPath, "utf8");
const releaseHeading = `## [web-${version}] - `;
const headingMatches = changelog.split(releaseHeading).length - 1;
if (headingMatches !== 1) {
  fail(`CHANGELOG.md must contain exactly one ${releaseHeading}YYYY-MM-DD heading`);
}
const sectionStart = changelog.indexOf(releaseHeading);
const sectionEnd = changelog.indexOf("\n## ", sectionStart + releaseHeading.length);
const releaseSection = changelog.slice(sectionStart, sectionEnd === -1 ? changelog.length : sectionEnd).trim();
if (!/^## \[web-[^\]]+\] - \d{4}-\d{2}-\d{2}$/m.test(releaseSection)) {
  fail("the Web changelog heading must include an ISO date");
}
if (!/^### (Added|Changed|Fixed|Security|Removed)$/m.test(releaseSection)) {
  fail("the Web changelog section needs a supported change category");
}
const meaningfulBullets = releaseSection.match(/^- (?!No (?:unreleased )?changes(?: yet)?\.?$).+/gmi) ?? [];
if (meaningfulBullets.length === 0) {
  fail("the Web changelog section needs at least one meaningful bullet");
}

const requiredFiles = [
  ".github/workflows/web-ci.yml",
  ".github/workflows/secret-scan.yml",
  ".github/workflows/commit-policy.yml",
  ".vercelignore",
  "web/vercel.json",
  "web/scripts/deploy-production.mjs",
  "web/scripts/production-auth-config.mjs",
  "web/scripts/promote-production.mjs"
];
for (const file of requiredFiles) {
  if (!existsSync(resolve(repositoryRoot, file))) fail(`required release file is missing: ${file}`);
}

const vercel = readJson(resolve(webDirectory, "vercel.json"));
if (webPackage.scripts?.["deploy:promote"] !== "node scripts/promote-production.mjs") {
  fail("Web production promotion must use the guarded promotion script");
}
if (webPackage.scripts?.["deploy:stage"] !== "node scripts/deploy-production.mjs") {
  fail("Web staging must use the guarded production candidate deployment script");
}
if (vercel.framework !== "vite" || vercel.outputDirectory !== "web/dist" ||
    vercel.installCommand !== "npm --prefix web ci" || vercel.buildCommand !== "npm --prefix web run build") {
  fail("web/vercel.json must build the Web package from the repository deployment root");
}
const appRewrite = (vercel.rewrites ?? []).find((rule) => rule.source === "/(.*)");
if (appRewrite?.destination !== "/index.html") {
  fail("web/vercel.json must route app deep links to /index.html");
}
const viteConfig = readFileSync(resolve(webDirectory, "vite.config.ts"), "utf8");
if (!viteConfig.includes('base: "/"') || !viteConfig.includes('outDir: "dist"')) {
  fail("web/vite.config.ts must build the application at the app origin root");
}
const headers = (vercel.headers ?? []).flatMap((rule) => rule.headers ?? []);
const headerNames = new Set(headers.map((header) => String(header.key).toLowerCase()));
for (const header of [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy"
]) {
  if (!headerNames.has(header)) fail(`web/vercel.json is missing ${header}`);
}

if (!ci) {
  const currentBranch = runGit("branch", "--show-current");
  if (currentBranch !== `release/web/${version}`) {
    fail(`current branch is ${currentBranch || "detached"}, expected release/web/${version}`);
  }
  if (!allowDirty && runGit("status", "--porcelain")) {
    fail("repository has uncommitted changes; commit or safely preserve them first");
  }
  if (runGit("tag", "--list", `web-${version}`)) {
    fail(`tag web-${version} already exists locally`);
  }
}

if (printNotes) {
  console.log(releaseSection.replace(/^##[^\n]*\n+/, ""));
} else {
  console.log(`Release preflight passed for web-${version}${flags.has("--dry-run") ? " (dry run)" : ""}.`);
}
