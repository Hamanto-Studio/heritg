export const STAGING_API_ORIGIN = "https://heritg-share-api-1079742937646.asia-southeast2.run.app";
export const STAGING_GOOGLE_CLIENT_ID = "1079742937646-76202p8a4fjf7hbef5cijvc003oauu3e.apps.googleusercontent.com";

export function validateStagingAuthConfig(origin, googleClientId, turnstileSiteKey) {
  if (!origin) return "set HERITG_STAGING_API_ORIGIN to the isolated staging Cloud Run origin";
  try {
    if (new URL(origin).origin !== STAGING_API_ORIGIN) {
      return "backend origin is not the isolated heritg-be-stg service";
    }
  } catch {
    return "backend origin is not a valid URL";
  }
  if (googleClientId !== STAGING_GOOGLE_CLIENT_ID) {
    return "use the approved staging-only Google Web client ID";
  }
  if (typeof turnstileSiteKey !== "string" || !turnstileSiteKey.trim()) {
    return "set HERITG_TURNSTILE_SITE_KEY to the staging Turnstile widget key";
  }
}
