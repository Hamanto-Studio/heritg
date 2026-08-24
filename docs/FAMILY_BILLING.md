# Heritg Web Family+ Integration

Status: UI and client boundaries implemented; production service disabled by default.

Heritg Family+ adds account-based encrypted synchronization and collaboration for up to 5 people. Local editing, import,
export, backup, sharing, deletion, and local family-tree access remain free. The
browser is never an entitlement authority.

## Deployment Configuration

Enable the client with this public build variable:

- `HERITG_FAMILY_BILLING_ENABLED=true`

Google sign-in is configured independently with `HERITG_GOOGLE_CLIENT_ID`.
Passwordless email uses the environment's existing account service and email
delivery configuration; it has no separate Web build flag.

Payment-provider credentials and webhook verification tokens, session-signing keys,
database credentials, and storage credentials must remain in backend secret
management. Staging uses its isolated provider configuration; production uses
independently scoped live credentials.

Checkout is created by the backend and opened on the returned hosted HTTPS page.
No payment-provider secret or SDK is included in the browser bundle.

## Required API

All routes are same-origin under `/api/v1`, use secure `HttpOnly` session
cookies, return `Cache-Control: private, no-store`, and reject cross-site
mutations.

- `GET /auth/session`: returns the opaque account ID and session expiry. The
  opaque account ID is used only by Heritg services; never derive a provider
  reference from an email address or family data.
- `POST /auth/google`: exchanges the environment-bound Google identity proof
  allocated through `GET /auth/login-nonce`.
- `POST /auth/email/request`: requests a single-use, short-lived email link
  without revealing whether an account exists.
- `POST /auth/email/verify`: consumes the link token and creates the same secure
  session used by Google sign-in.
- `POST /auth/logout`: revokes the session without deleting local data.
- `DELETE /account`: permanently deletes the hosted account without deleting
  the browser's local archive.
- `GET /entitlements/current`: returns the authoritative Family+ state and the
  server-owned offer amount, currency, and access duration used by the paywall.
- `POST /entitlements/refresh`: refreshes backend entitlement state after
  checkout and requires the session CSRF token.
- `POST /billing/checkouts`: accepts an empty body with CSRF, account, and
  idempotency headers, creates the one-time payment for the authenticated
  account, and returns `paymentLinkUrl`.
- Payment callbacks are verified and reconciled by the backend before they
  update the account entitlement projection.
- `/trees/*` and `/device-links/*`: provide revision-protected encrypted
  snapshot and same-owner device-key transfer primitives used by the automatic
  synchronization coordinator.

Every sync endpoint independently validates session, active server-side
entitlement, archive ownership, quota, and expected revision. Client claims such
as `isPro`, account IDs, and timestamps are untrusted.

## Payment Contract

- Internal entitlement: `family`.
- Access duration and price come from the entitlement response and are never
  client constants. The current offer is one payment for 24 months.
- Checkout uses a provider-hosted one-time payment. It never creates an automatic renewal.
- Available methods are determined by the hosted payment provider and customer
  eligibility; the Web client does not claim methods the backend cannot offer.
- Webhooks are authenticated, idempotent, replay-safe, and tolerant of delayed
  or out-of-order delivery. The backend authorizes sync.

## Launch Gates

1. Complete end-to-end encryption, second-device key transfer, recovery,
   rotation, and deletion design.
2. Use revisions or ETags; never silently use last-write-wins.
3. Add quotas, payload/rate limits, and revision-history limits.
4. Keep account and entitlement metadata out of `AppData`, exports, and shares.
5. Update `PRIVACY.md`, `docs/DATA_PROCESSING.md`, product copy, and subprocessors
   before enabling hosted processing.
6. Test modified clients claiming fake Family+ access; official APIs must reject them.
7. Test passwordless email delivery and callback handling in installed PWAs and
   Mobile Safari; keep Google as a working fallback.
8. Keep all `/api/v1/` service-worker traffic `NetworkOnly`.
9. Complete payment-provider business verification before enabling production
   checkout.

Expiration pauses hosted synchronization and never disables or
deletes the authoritative local archive.
