# Heritg Web Family Plan Integration

Status: UI and client boundaries implemented; production service disabled by default.

The Heritg Family Plan adds account-based encrypted synchronization. Local editing, import,
export, backup, sharing, deletion, and local family-tree access remain free. The
browser is never an entitlement authority.

## Deployment Configuration

Enable the client with this public build variable:

- `HERITG_FAMILY_BILLING_ENABLED=true`

Google sign-in is configured independently with `HERITG_GOOGLE_CLIENT_ID`.
Passwordless email uses the environment's existing account service and email
delivery configuration; it has no separate Web build flag.

Xendit secret keys and webhook verification tokens, session-signing keys,
database credentials, and storage credentials must remain in backend secret
management. Staging uses Xendit test mode; production uses independently scoped
live credentials.

Checkout is created by the backend and opened on Xendit's hosted HTTPS page. No
Xendit secret or SDK is included in the browser bundle.

## Required API

All routes are same-origin under `/api/v1`, use secure `HttpOnly` session
cookies, return `Cache-Control: private, no-store`, and reject cross-site
mutations.

- `GET /auth/session`: returns the opaque account ID and session expiry. The
  opaque account ID is used as the Xendit customer reference; never derive it
  from an email address or family data.
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
- `GET /billing/offers`: returns localized monthly and yearly IDR prices.
- `POST /billing/checkout`: accepts `monthly` or `yearly`, creates a Xendit
  `SUBSCRIPTION` payment session for the authenticated account, and returns its
  hosted checkout URL.
- `POST /billing/xendit/webhook`: verifies Xendit's callback token, processes
  payment-session, payment-token, subscription-plan, and subscription-cycle
  events idempotently, and updates the account entitlement projection.
- `/trees/*` and `/device-links/*`: provide revision-protected encrypted
  snapshot and same-owner device-key transfer primitives. The current Web UI
  does not yet activate automatic synchronization.

Every sync endpoint independently validates session, active server-side
entitlement, archive ownership, quota, and expected revision. Client claims such
as `isPro`, account IDs, and timestamps are untrusted.

## Xendit Contract

- Internal entitlement: `family`.
- Monthly price: IDR 19,900; yearly price: IDR 199,000.
- Checkout uses Xendit Payment Sessions with type `SUBSCRIPTION`.
- Initial recurring methods target GoPay, DANA, OVO, ShopeePay, BRI Direct
  Debit, and cards, subject to merchant-channel activation and customer
  eligibility.
- QRIS and virtual accounts may be offered later for manual renewal, but must
  not be represented as automatic-renewal methods.
- Webhooks are authenticated, idempotent, replay-safe, and tolerant of delayed
  or out-of-order delivery. The backend authorizes sync.

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
9. Complete Xendit business verification and activate every recurring payment
   channel before displaying it as available in production.

Cancellation or expiration pauses hosted synchronization and never disables or
deletes the authoritative local archive.
