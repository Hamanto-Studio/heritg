import { STAGING_GOOGLE_CLIENT_ID } from "./staging-auth-config.mjs";

export const PRODUCTION_API_ORIGIN = "https://heritg-share-api-ulvjjfvqpq-et.a.run.app";

export function validateProductionAuthConfig(origin, googleClientId, turnstileSiteKey) {
  if (!origin) return "set HERITG_API_ORIGIN to the approved production Cloud Run origin";
  try {
    if (new URL(origin).origin !== PRODUCTION_API_ORIGIN) {
      return "backend origin is not the approved production service";
    }
  } catch {
    return "backend origin is not a valid URL";
  }
  if (!googleClientId || googleClientId === STAGING_GOOGLE_CLIENT_ID ||
    !/^[0-9]+-[A-Za-z0-9_-]+[.]apps[.]googleusercontent[.]com$/u.test(googleClientId)) {
    return "set a valid production-only Google Web client ID";
  }
  if (!turnstileSiteKey) return "set HERITG_TURNSTILE_SITE_KEY to the production Turnstile widget key";
}
