# Heritg Web Family+ Integration

Status: production synchronization and renewable one-month free access enabled; payments disabled.

Heritg Family+ adds account-based encrypted synchronization across connected devices. Local editing, import,
export, backup, sharing, deletion, and local family-tree access remain free. The
browser is never an entitlement authority.

## Deployment Configuration

Enable the client with this public build variable:

- `HERITG_FAMILY_BILLING_ENABLED=true`

Google sign-in is configured independently with `HERITG_GOOGLE_CLIENT_ID`.
Passwordless email is disabled in the current production release.

Payment-provider credentials and webhook verification tokens, session-signing keys,
database credentials, and storage credentials must remain in backend secret
management. Staging uses its isolated mock provider configuration. Production
does not deploy payment-provider credentials, checkout, or callbacks.

Production free access is granted by the backend without opening a checkout.
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
- `POST /auth/logout`: revokes the session without deleting local data.
- `DELETE /account`: permanently deletes the hosted account without deleting
  the browser's local archive.
- `GET /entitlements/current`: returns the authoritative Family+ state and the
  server-owned offer amount, currency, and access duration used by the paywall.
- `POST /entitlements/refresh`: refreshes backend entitlement state after
  checkout and requires the session CSRF token.
- `POST /entitlements/free-access`: atomically grants one calendar month in
  production. Repeated active claims keep the existing expiry; another month can
  be claimed after expiry.
- `POST /billing/checkouts`: accepts an empty body with CSRF, account, and
  idempotency headers in approved staging payment tests. Production returns
  `503 service_unavailable`.
- Payment callbacks are verified and reconciled by the backend before they
  update the account entitlement projection.
- `/trees/*` and `/device-links/*`: provide revision-protected encrypted
  snapshot and same-owner device-key transfer primitives used by the automatic
  synchronization coordinator.

Every sync endpoint independently validates session, active server-side
entitlement, archive ownership, quota, and expected revision. Client claims such
as `isPro`, account IDs, and timestamps are untrusted.

## Access Contract

- Internal entitlement: `family`.
- Access duration and price come from the entitlement response and are never
  client constants. The current production offer is one free calendar month.
- Active free claims do not stack. After expiry, the user can claim another
  month. No read-only grace or automatic renewal is created.
- Production does not call a hosted checkout or payment provider.
- Available methods are determined by the hosted payment provider and customer
  eligibility; the Web client does not claim methods the backend cannot offer.
- Webhooks are authenticated, idempotent, replay-safe, and tolerant of delayed
  or out-of-order delivery. The backend authorizes sync.

## Launch Gates

1. Document and test client encryption, server-managed key escrow, second-device
   recovery, rotation, and deletion behavior without claiming operator-blind encryption.
2. Use revisions or ETags; never silently use last-write-wins.
3. Add quotas, payload/rate limits, and revision-history limits.
4. Keep account and entitlement metadata out of `AppData`, exports, and shares.
5. Update `PRIVACY.md`, `docs/DATA_PROCESSING.md`, product copy, and subprocessors
   before enabling hosted processing.
6. Test modified clients claiming fake Family+ access; official APIs must reject them.
7. Test Google sign-in, profile restoration, retry, logout, and deletion in
   installed PWAs and Mobile Safari.
8. Keep all `/api/v1/` service-worker traffic `NetworkOnly`.
9. Complete payment-provider business verification before enabling production
   checkout.

Expiration pauses hosted synchronization and never disables or
deletes the authoritative local archive.
