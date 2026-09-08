# DOKU sandbox checkout

This integration targets `https://staging.heritg.us` only. Production at
`https://heritg.us` keeps its existing free Family+ access and has no DOKU keys.
The single-plan DOKU VA integration is deployed and verified. This branch adds a
multi-plan catalog; its new deployment and four-plan simulator acceptance must be
recorded separately before calling that change live.

## Browser flow

1. Sign in with a disposable staging account. Local tree editing remains available
   without signing in or buying anything.
2. Choose a server-owned plan: weekly Rp9.000 / 10 minutes, monthly Rp15.000 /
   15 minutes, yearly Rp79.000 / 20 minutes, or two-year one-time Rp120.000 /
   30 minutes. These are shortened sandbox periods with no grace. All renew
   manually; no automatic billing mandate is created. Existing access is not shortened.
3. Save a random checkout idempotency key in session storage, then call
   `POST /api/v1/billing/checkouts` with `{ "planId": "monthly" }`, the session cookie, CSRF token,
   Idempotency-Key, and expected account header. Retry that same key after a
   network failure; retain the plan ID with that attempt. Never automatically
   create a fresh invoice or replace a pending invoice with another plan.
4. Redirect to the returned HTTPS `sandbox.doku.com` payment page. The DOKU
   Secret Key stays in the backend's staging Secret Manager; it is never a Vite
   variable or frontend build secret.
5. On `/billing/return`, poll `POST /api/v1/billing/checkouts/status` with the
   original key and authenticated account. The body stays `{}`. Polling reads
   durable status and never creates or queries a provider payment.
6. Only `completed` plus a fresh `GET /api/v1/entitlements/current` confirms the
   purchase. Existing active access or callback URL parameters do not prove that
   a new renewal payment succeeded.

Confirmation appears in a dismissible, non-modal notice in English or Indonesian.
Automatic polling is bounded to three minutes; users may check again manually.
The backend's scheduled recovery continues independently if the browser closes.
Do not pay again while a payment is awaiting confirmation. If session storage is
unavailable, checkout stops before creating a bill.

## Deployment and acceptance

Use the repo-local web release skill and the existing pinned Vercel staging
script. Never deploy this work through the production script. Deploy and verify
the backend status route and scheduled recovery job first; then deploy the web
staging project. The same-origin `/api/v1/*` rewrite must target only `heritg-be-stg`.
Service workers must not cache API responses or payment-provider traffic.

Before calling the multi-plan integration ready, complete a DOKU VA simulation
for every plan, verify its exact minute duration and expiry, resend the callback,
and prove access is not extended twice. QRIS remains separately unavailable.
Also test failed/pending payments, provider
outages, account changes, manual renewal, return-page reloads, mobile widths, and
local editing/import/export. Never use real payment money or real family data.

Backend protocol, safe setup, deployment prerequisites, and recovery operations:
[DOKU integration guide](https://github.com/Hamanto-Studio/heritg-be/blob/main/docs/DOKU.md).

Pricing sources, cost assumptions, and live-launch risks:
[Family pricing model](https://github.com/Hamanto-Studio/heritg-be/blob/feat/family-plan-options/docs/PRICING.md).
