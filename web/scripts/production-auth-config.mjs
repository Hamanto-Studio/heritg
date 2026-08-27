import { STAGING_GOOGLE_CLIENT_ID } from "./staging-auth-config.mjs";

export const PRODUCTION_API_ORIGIN = "https://heritg-share-api-ulvjjfvqpq-et.a.run.app";
export const PRODUCTION_GOOGLE_CLIENT_ID = "428519514749-n3quv8he4ja8h9lpc498v7r76t1vua09.apps.googleusercontent.com";

const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9]{32}\.apps\.googleusercontent\.com$/u;

export function validateProductionAuthConfig(origin, googleClientId) {
  if (origin !== PRODUCTION_API_ORIGIN) {
    return "HERITG_API_ORIGIN must be the approved production Cloud Run origin";
  }
  if (googleClientId === STAGING_GOOGLE_CLIENT_ID) {
    return "the staging Google Web client ID cannot be used in production";
  }
  if (typeof googleClientId !== "string" || !GOOGLE_CLIENT_ID_PATTERN.test(googleClientId) ||
      googleClientId !== PRODUCTION_GOOGLE_CLIENT_ID) {
    return "HERITG_GOOGLE_CLIENT_ID must be the approved production Google Web client ID";
  }
}
