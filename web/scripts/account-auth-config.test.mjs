import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STAGING_API_ORIGIN,
  STAGING_GOOGLE_CLIENT_ID,
  validateStagingAuthConfig
} from "./staging-auth-config.mjs";
import {
  PRODUCTION_API_ORIGIN,
  validateProductionAuthConfig
} from "./production-auth-config.mjs";

const readJson = (name) => JSON.parse(readFileSync(resolve(process.cwd(), name), "utf8"));

describe("account authentication deployment policy", () => {
  for (const name of ["vercel.template.json", "vercel.json"]) {
    it(`allows only the required identity and verification resources in ${name}`, () => {
      const config = readJson(name);
      const headers = config.headers.find(({ source }) => source === "/(.*)").headers;
      const csp = headers.find(({ key }) => key === "Content-Security-Policy").value;
      const coop = headers.find(({ key }) => key === "Cross-Origin-Opener-Policy").value;
      const directives = Object.fromEntries(csp.split(";").map((directive) => {
        const [key, ...sources] = directive.trim().split(/\s+/u);
        return [key, sources];
      }));

      expect(directives["script-src"]).toEqual(["'self'", "https://accounts.google.com/gsi/client", "https://challenges.cloudflare.com"]);
      expect(directives["style-src"]).toEqual(["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style"]);
      expect(directives["connect-src"]).toEqual([
        "'self'",
        "https://api.github.com",
        "https://accounts.google.com/gsi/",
        "https://challenges.cloudflare.com",
        "https://storage.googleapis.com",
        "https://*.storage.googleapis.com"
      ]);
      expect(directives["frame-src"]).toEqual(["https://accounts.google.com/gsi/", "https://challenges.cloudflare.com"]);
      expect(csp).not.toContain("*.google");
      expect(csp.toLowerCase()).not.toContain("resend");
      expect(csp).not.toContain("script-src 'self' https:;");
      expect(coop).toBe("same-origin-allow-popups");
      expect(config.rewrites[0].source).toBe("/api/v1/:path*");
    });
  }

  it("passes an explicit environment-specific client ID into staging builds", () => {
    const deploy = readFileSync(resolve(process.cwd(), "scripts/deploy-staging.mjs"), "utf8");
    expect(deploy).toContain("HERITG_GOOGLE_CLIENT_ID");
    expect(deploy).toContain("HERITG_TURNSTILE_SITE_KEY");
    expect(deploy).toContain("validateStagingAuthConfig(origin, googleClientId, turnstileSiteKey)");
    expect(deploy).toContain("`HERITG_GOOGLE_CLIENT_ID=${googleClientId}`");
    expect(deploy).toContain("HERITG_DEPLOYMENT_ENV=staging");
    expect(deploy).toContain("HERITG_FAMILY_BILLING_ENABLED=true");
    expect(deploy).toContain("HERITG_BUILD_VERSION");
    expect(deploy).toContain('"--prod"');
    expect(deploy).toContain('git", ["rev-parse", "--short=7", "HEAD"]');
    expect(deploy).toContain('mkdtempSync(join(tmpdir(), "heritg-staging-deploy-")');
    expect(deploy).toContain('["node_modules", "dist", ".vercel"]');
  });

  it("allows the signed multipart synchronization upload from staging", () => {
    const cors = readJson("deploy/staging-storage-cors.json");
    expect(cors).toEqual([expect.objectContaining({
      origin: ["https://staging.heritg.us"],
      method: expect.arrayContaining(["GET", "HEAD", "POST"])
    })]);
  });

  it("guards production candidate auth configuration and deployment inputs", () => {
    const deploy = readFileSync(resolve(process.cwd(), "scripts/deploy-production.mjs"), "utf8");
    const vercelIgnore = readFileSync(resolve(process.cwd(), "../.vercelignore"), "utf8");
    expect(deploy).toContain("validateProductionAuthConfig(origin, googleClientId, turnstileSiteKey)");
    expect(deploy).toContain('git("status", "--porcelain")');
    expect(deploy).toContain('"vercel@58.4.4"');
    expect(deploy).toContain('"--prod"');
    expect(deploy).toContain('"--skip-domain"');
    expect(deploy).toContain('"web/vercel.json"');
    expect(deploy).toContain("HERITG_DEPLOYMENT_ENV=production");
    expect(deploy).not.toContain("HERITG_FAMILY_BILLING_ENABLED=true");
    expect(deploy).toContain("HERITG_BUILD_VERSION");
    expect(deploy).toContain("`HERITG_GOOGLE_CLIENT_ID=${googleClientId}`");
    expect(deploy).toContain("`HERITG_TURNSTILE_SITE_KEY=${turnstileSiteKey}`");
    expect(vercelIgnore.trim().split(/\r?\n/u)).toContain("secrets/");
  });

  it("keeps every account API request network-only in the service worker", () => {
    const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    expect(viteConfig).toContain("urlPattern: /\\/api\\/v1\\//");
    expect(viteConfig).toContain('handler: "NetworkOnly"');
    expect(viteConfig).toContain("navigateFallbackDenylist: [/^\\/(?:api\\/|health$|ready$)/, /^\\/auth\\/email\\/?$/]");
  });

  it("activates the updated worker immediately and excludes email callbacks from navigation fallback", () => {
    const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
    expect(viteConfig).toContain('registerType: "autoUpdate"');
    expect(viteConfig).toContain("skipWaiting: true");
    expect(viteConfig).toContain("clientsClaim: true");
    expect(viteConfig).toContain("/^\\/auth\\/email\\/?$/");
    expect(main).toContain('navigator.serviceWorker.addEventListener("controllerchange"');
    expect(main).toContain("window.location.reload()");
  });

  it("rejects missing, malformed, and non-staging deployment identity config", () => {
    expect(validateStagingAuthConfig(undefined, undefined, undefined)).toContain("HERITG_STAGING_API_ORIGIN");
    expect(validateStagingAuthConfig("not-a-url", STAGING_GOOGLE_CLIENT_ID, "site-key")).toContain("valid URL");
    expect(validateStagingAuthConfig("https://production.example", STAGING_GOOGLE_CLIENT_ID, "site-key")).toContain("heritg-be-stg");
    expect(validateStagingAuthConfig(STAGING_API_ORIGIN, "production.apps.googleusercontent.com", "site-key")).toContain("staging-only");
    expect(validateStagingAuthConfig(STAGING_API_ORIGIN, STAGING_GOOGLE_CLIENT_ID, undefined)).toContain("TURNSTILE");
    expect(validateStagingAuthConfig(STAGING_API_ORIGIN, STAGING_GOOGLE_CLIENT_ID, "site-key")).toBeUndefined();
  });

  it("accepts only production-shaped auth configuration for the approved backend", () => {
    const productionClientId = `123456789012-${"a".repeat(32)}.apps.googleusercontent.com`;
    expect(validateProductionAuthConfig(undefined, undefined, undefined)).toContain("HERITG_API_ORIGIN");
    expect(validateProductionAuthConfig(`${PRODUCTION_API_ORIGIN}/`, productionClientId, "site-key")).toContain("approved production");
    expect(validateProductionAuthConfig(PRODUCTION_API_ORIGIN, STAGING_GOOGLE_CLIENT_ID, "site-key")).toContain("staging");
    expect(validateProductionAuthConfig(PRODUCTION_API_ORIGIN, "production.apps.googleusercontent.com", "site-key")).toContain("production Google Web client ID");
    expect(validateProductionAuthConfig(PRODUCTION_API_ORIGIN, productionClientId, "  ")).toContain("TURNSTILE");
    expect(validateProductionAuthConfig(PRODUCTION_API_ORIGIN, productionClientId, "site-key")).toBeUndefined();
  });
});
