#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { STAGING_GOOGLE_CLIENT_ID } from "./staging-auth-config.mjs";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(web, "..");
const production = process.argv.includes("--production");
if (process.argv.slice(2).some(arg => arg !== "--production")) throw new Error("Unsupported build option");
const environment = production ? "production" : "staging";
const hash = createHash("sha256");
// Fingerprint the actual worktree, including pending changes, without .git or secrets.
function fingerprint(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (item.name === ".wrangler") continue;
    const path = join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error("Refusing symlink in deployment sources");
    if (item.isDirectory()) fingerprint(path);
    else { hash.update(path.slice(web.length)); hash.update(readFileSync(path)); }
  }
}
for (const name of ["src", "public", "cloudflare"]) fingerprint(join(web, name));
for (const name of ["package.json", "package-lock.json", "index.html", "vite.config.ts", "vercel.template.json", "scripts/build-cloudflare-staging.mjs"]) {
  hash.update(name); hash.update(readFileSync(join(web, name)));
}
const commit = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
const build = `${commit}-cf-${hash.digest("hex").slice(0, 12)}`;
const root = join(web, `.cloudflare-${environment}`);
const assets = join(root, "assets");
const env = { ...process.env, HERITG_DEPLOYMENT_ENV: environment, HERITG_BUILD_VERSION: build,
  HERITG_GOOGLE_CLIENT_ID: production ? "428519514749-n3quv8he4ja8h9lpc498v7r76t1vua09.apps.googleusercontent.com" : STAGING_GOOGLE_CLIENT_ID, HERITG_FAMILY_BILLING_ENABLED: "true",
  HERITG_ANALYTICS_ENABLED: "false", HERITG_DEBUG_CONTEXT: "0", HERITG_SHARING_ENABLED: "true" };
execFileSync("npx", ["--no-install", "tsc", "--noEmit", "-p", "tsconfig.app.json"], { cwd: web, env, stdio: "inherit" });
execFileSync("npx", ["--no-install", "tsc", "--noEmit", "-p", "tsconfig.node.json"], { cwd: web, env, stdio: "inherit" });
execFileSync("npx", ["--no-install", "vite", "build", "--outDir", assets], { cwd: web, env, stdio: "inherit" });
const config = JSON.parse(readFileSync(join(web, "vercel.template.json"), "utf8"));
const lines = ["/*", ...config.headers[0].headers.map(({ key, value }) => `  ${key}: ${value}`),
  "  X-Robots-Tag: noindex, nofollow, noarchive", `  X-Heritg-Hosting: cloudflare-${environment}`, "  Cache-Control: public, max-age=0, must-revalidate", "",
  "/assets/*", "  Cache-Control: public, max-age=31536000, immutable", ""];
writeFileSync(join(assets, "_headers"), lines.join("\n"));
writeFileSync(join(assets, "robots.txt"), "User-agent: *\nDisallow: /\n");
writeFileSync(join(assets, ".assetsignore"), "*.map\n*.heritg\n*.ged\n.env*\n");
mkdirSync(root, { recursive: true });
writeFileSync(join(root, "build.json"), JSON.stringify({ build, commit, environment, analytics: false }, null, 2) + "\n");
// Bundle verification metadata is deliberately outside public assets.
cpSync(join(web, "cloudflare/wrangler.jsonc"), join(root, "reviewed-config.jsonc"));
console.log(`Cloudflare ${environment} build prepared: ${build}. No deployment was performed.`);
