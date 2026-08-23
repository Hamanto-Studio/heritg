# Heritg Family Integration

Status: staging implementation. Production checkout remains disabled by default.

Heritg Family adds long-lived encrypted sharing and account-based encrypted
synchronization. Local editing, import, export, backup, deletion, and access to
local family trees remain free. The browser is never the entitlement authority.

## Deployment Configuration

The Family client is enabled only when both variables are present at build time:

- `HERITG_FAMILY_ENABLED=true`
- `HERITG_REVENUECAT_PUBLIC_API_KEY=<RevenueCat Web public key>`

The Web SDK key is public. RevenueCat secret keys, webhook credentials, payment
provider secrets, session material, database credentials, and storage
credentials remain in backend secret management. Staging and production use
separate RevenueCat apps, webhook destinations, account data, and payment modes.

## Account and Entitlement Contract

- Google account routes remain under `/api/v1/auth/*`.
- `GET /api/v1/entitlements/current` returns the authoritative Family state.
- `POST /api/v1/entitlements/refresh` reconciles RevenueCat after checkout and
  requires the session CSRF token.
- The opaque backend `accountId` is the RevenueCat App User ID.
- The RevenueCat entitlement identifier is `family`.
- RevenueCat customer results provide immediate UI feedback only; hosted API
  authorization always uses backend state.

Active Family accounts can create one-year, three-year, or conditional
no-expiry links. No-expiry means no scheduled expiration while Family remains
active. All Family links are capped at the 90-day read-only grace deadline after
the paid entitlement expires.

Hosted synchronization writes require active Family access. Existing encrypted
snapshots remain downloadable during the 90-day read-only grace period. Local
family archives remain available regardless of subscription state.
