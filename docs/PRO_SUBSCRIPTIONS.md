# Heritg Web Family Plan Integration

Status: UI and client boundaries implemented; production service disabled by default.

The Heritg Family Plan adds account-based encrypted synchronization. Local editing, import,
export, backup, sharing, deletion, and local family-tree access remain free. The
browser is never an entitlement authority.

## Deployment Configuration

Enable the client only when both build variables are present:

- `HERITG_PRO_ENABLED=true`
- `HERITG_REVENUECAT_PUBLIC_API_KEY=<RevenueCat Web public key>`

Google sign-in is configured independently with `HERITG_GOOGLE_CLIENT_ID`.
Passwordless email uses the environment's existing account service and email
delivery configuration; it has no separate Web build flag.

The Web key is public. RevenueCat secret keys, webhook credentials, payment
secrets, session-signing keys, database credentials, and storage credentials
must remain in backend secret management. Staging and production require
separate RevenueCat apps, account data, sync storage, and payment modes.

Validate the CSP against the exact RevenueCat Billing/payment-provider setup
before enabling production. Do not add broad wildcard sources.

## Required API

All routes are same-origin under `/api/v1`, use secure `HttpOnly` session
cookies, return `Cache-Control: private, no-store`, and reject cross-site
mutations.

- `GET /auth/session`: returns the opaque account ID and session expiry. The
  opaque account ID is also the RevenueCat App User ID; never derive it from an
  email address or family data.
- `POST /auth/google`: exchanges the environment-bound Google identity proof
  allocated through `GET /auth/login-nonce`.
- `POST /auth/email/request`: requests a single-use, short-lived email link
  without revealing whether an account exists.
- `POST /auth/email/verify`: consumes the link token and creates the same secure
  session used by Google sign-in.
- `POST /auth/logout`: revokes the session without deleting local data.
- `DELETE /account`: permanently deletes the hosted account without deleting
  the browser's local archive.
- `GET /entitlements/current`: returns the authoritative Family Plan state.
- `POST /entitlements/refresh`: refreshes backend entitlement state after
  checkout and requires the session CSRF token.
- `/trees/*` and `/device-links/*`: provide revision-protected encrypted
  snapshot and same-owner device-key transfer primitives. The current Web UI
  does not yet activate automatic synchronization.

Every sync endpoint independently validates session, active server-side
entitlement, archive ownership, quota, and expected revision. Client claims such
as `isPro`, account IDs, and timestamps are untrusted.

## RevenueCat Contract

- Entitlement: `family`.
- Current offering contains RevenueCat `monthly` and `annual` packages.
- Prices, currencies, trials, and discounts come from RevenueCat offerings.
- Webhooks update backend state and are authenticated, idempotent, replay-safe,
  and tolerant of out-of-order delivery.
- Client customer information is UI feedback only. The server authorizes sync.

## Launch Gates

1. Complete end-to-end encryption, second-device key transfer, recovery,
   rotation, and deletion design.
2. Use revisions or ETags; never silently use last-write-wins.
3. Add quotas, payload/rate limits, and revision-history limits.
4. Keep account and subscription metadata out of `AppData`, exports, and shares.
5. Update `PRIVACY.md`, `docs/DATA_PROCESSING.md`, product copy, and subprocessors
   before enabling hosted processing.
6. Test modified clients claiming fake Family Plan access; official APIs must reject them.
7. Test passwordless email delivery and callback handling in installed PWAs and
   Mobile Safari; keep Google as a working fallback.
8. Keep all `/api/v1/` service-worker traffic `NetworkOnly`.

Cancellation or expiration pauses hosted synchronization and never disables or
deletes the authoritative local archive.
