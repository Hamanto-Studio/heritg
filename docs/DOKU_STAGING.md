# DOKU sandbox checkout

This integration targets `https://staging.heritg.us` only. Production at
`https://heritg.us` keeps its existing free Family+ access and has no DOKU keys.
The four-plan catalog is deployed to staging. Its deployment receipt below is
separate from the previous single-plan verification; provider success and actual
expiry must be verified, not inferred from a successful build.

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
4. Redirect to the returned HTTPS `sandbox.doku.com` or `staging.doku.com` payment page. The DOKU
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

September 8, 2026 staging deployment:

- Web commit `574ff3f`, build `574ff3f-202609081410`, deployment
  `dpl_8nU5LS26CsuF4aS1eD2re2cB7JUD`, at `https://staging.heritg.us/`.
- Backend commit `9d9f8fd5c987484fabfd29b31c0bdfee69cd8722`, successful isolated
  [staging run 34235931427](https://github.com/Hamanto-Studio/heritg-be/actions/runs/34235931427).
- Web: 893 tests passed, one existing skip; lint/build/audit/secret scan and PR CI
  passed. Desktop/mobile review confirmed all four plans and the selected-price
  action remain visible, with the staging banner clear of the modal header.
- All four DOKU VA simulator payments succeeded at the selected amounts. The
  public API and Firestore confirmed completed purchases with exactly
  10/15/20/30-minute access and no grace. Wall-clock expiry observation is ongoing.
  The lifecycle uses disposable server-created sessions and public API checkout
  requests; it does not qualify Google sign-in or a flawless browser-only
  four-plan checkout run. Production was not deployed or enabled for payments.

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
