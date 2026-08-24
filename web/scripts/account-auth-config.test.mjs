import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_GOOGLE_CLIENT_ID,
  validateProductionAuthConfig
} from "./production-auth-config.mjs";
import {
  STAGING_API_ORIGIN,
  STAGING_GOOGLE_CLIENT_ID,
  validateStagingAuthConfig
} from "./staging-auth-config.mjs";

const read = (name) => readFileSync(resolve(process.cwd(), name), "utf8");
const readJson = (name) => JSON.parse(read(name));

describe("account authentication deployment policy", () => {
  for (const name of ["vercel.template.json", "vercel.json"]) {
    it(`allows only the required Google Identity resources in ${name}`, () => {
      const config = readJson(name);
      const headers = config.headers.find(({ source }) => source === "/(.*)").headers;
      const csp = headers.find(({ key }) => key === "Content-Security-Policy").value;
      const coop = headers.find(({ key }) => key === "Cross-Origin-Opener-Policy").value;
      const directives = Object.fromEntries(csp.split(";").map((directive) => {
        const [key, ...sources] = directive.trim().split(/\s+/u);
        return [key, sources];
      }));

      expect(directives["script-src"]).toEqual(["'self'", "https://accounts.google.com/gsi/client"]);
      expect(directives["style-src"]).toEqual(["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style"]);
      expect(directives["connect-src"]).toEqual([
        "'self'",
        "https://api.github.com",
        "https://accounts.google.com/gsi/",
        "https://storage.googleapis.com",
        "https://*.storage.googleapis.com"
      ]);
      expect(directives["frame-src"]).toEqual(["https://accounts.google.com/gsi/"]);
      expect(csp).not.toContain("challenges.cloudflare.com");
      expect(csp.toLowerCase()).not.toContain("resend");
      expect(coop).toBe("same-origin-allow-popups");
      expect(config.rewrites[0].source).toBe("/api/v1/:path*");
    });
  }

  it("passes an explicit environment-specific client ID into staging builds", () => {
    const deploy = read("scripts/deploy-staging.mjs");
    expect(deploy).toContain("HERITG_GOOGLE_CLIENT_ID");
    expect(deploy).toContain("validateStagingAuthConfig(origin, googleClientId)");
    expect(deploy).toContain("`HERITG_GOOGLE_CLIENT_ID=${googleClientId}`");
    expect(deploy).toContain("HERITG_DEPLOYMENT_ENV=staging");
  });

  it("guards a clean Google-only production candidate", () => {
    const deploy = read("scripts/deploy-production.mjs");
    const accountSettings = read("src/AccountSettings.tsx");
    const main = read("src/main.tsx");
    const vercelIgnore = read("../.vercelignore");
    expect(deploy).toContain("validateProductionAuthConfig(origin, googleClientId)");
    expect(deploy).toContain('git("status", "--porcelain")');
    expect(deploy).toContain('"vercel@58.4.4"');
    expect(deploy).toContain('"--prod"');
    expect(deploy).toContain('"--skip-domain"');
    expect(deploy).toContain('"web/vercel.json"');
    expect(deploy).toContain("HERITG_DEPLOYMENT_ENV=production");
    expect(deploy).toContain("`HERITG_GOOGLE_CLIENT_ID=${googleClientId}`");
    expect(deploy).not.toContain("TURNSTILE");
    expect(deploy).toContain('"HERITG_FAMILY_BILLING_ENABLED=false"');
    expect(deploy).not.toContain("HERITG_FAMILY_BILLING_ENABLED=true");
    expect(deploy).toContain('resolve(scriptDirectory, "promote-production.mjs")');
    expect(deploy).toContain("Vercel did not return an immutable deployment URL");
    expect(read("scripts/promote-production.mjs")).toContain('"rollback"');
    expect(read("scripts/rollback-production.mjs")).toContain('"rollback"');
    expect(accountSettings).not.toContain("requestEmailLogin");
    expect(main).not.toContain("EmailAuthCallback");
    expect(main).not.toContain("verifyEmailLogin");
    expect(main).toContain('/^\\/auth\\/email\\/?$/u');
    expect(vercelIgnore.trim().split(/\r?\n/u)).toContain("secrets/");
  });

  it("keeps every account API request network-only in the service worker", () => {
    const viteConfig = read("vite.config.ts");
    expect(viteConfig).toContain("urlPattern: /\\/api\\/v1\\//");
    expect(viteConfig).toContain('handler: "NetworkOnly"');
    expect(viteConfig).toContain("/^\\/auth\\/email\\/?$/");
  });

  it("rejects missing, malformed, and non-staging deployment identity config", () => {
    expect(validateStagingAuthConfig(undefined, undefined)).toContain("HERITG_STAGING_API_ORIGIN");
    expect(validateStagingAuthConfig("not-a-url", STAGING_GOOGLE_CLIENT_ID)).toContain("valid URL");
    expect(validateStagingAuthConfig("https://production.example", STAGING_GOOGLE_CLIENT_ID)).toContain("heritg-be-stg");
    expect(validateStagingAuthConfig(STAGING_API_ORIGIN, "production.apps.googleusercontent.com")).toContain("staging-only");
    expect(validateStagingAuthConfig(STAGING_API_ORIGIN, STAGING_GOOGLE_CLIENT_ID)).toBeUndefined();
  });

  it("accepts only a production-shaped Google client for the approved backend", () => {
    expect(validateProductionAuthConfig(undefined, undefined)).toContain("HERITG_API_ORIGIN");
    expect(validateProductionAuthConfig(`${PRODUCTION_API_ORIGIN}/`, PRODUCTION_GOOGLE_CLIENT_ID)).toContain("approved production");
    expect(validateProductionAuthConfig(PRODUCTION_API_ORIGIN, STAGING_GOOGLE_CLIENT_ID)).toContain("staging");
    expect(validateProductionAuthConfig(PRODUCTION_API_ORIGIN, "production.apps.googleusercontent.com")).toContain("production Google Web client ID");
    expect(validateProductionAuthConfig(PRODUCTION_API_ORIGIN, `123456789012-${"a".repeat(32)}.apps.googleusercontent.com`)).toContain("approved production Google Web client ID");
    expect(validateProductionAuthConfig(PRODUCTION_API_ORIGIN, PRODUCTION_GOOGLE_CLIENT_ID)).toBeUndefined();
  });
});
