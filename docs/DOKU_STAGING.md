# DOKU sandbox checkout

This integration targets `https://staging.heritg.us` only. Production at
`https://heritg.us` keeps its existing free Family+ access and has no DOKU keys.
The four-plan catalog is deployed to staging. Its deployment receipt below is
separate from the previous single-plan verification; provider success and actual
expiry must be verified, not inferred from a successful build.

The September 9 target supersedes auto-charge: **DOKU-managed subscription
invoices paid manually**, with monthly Rp15.000, six-month Rp49.000, yearly
Rp79.000 and three-year Rp199.000. Planned new staging access is 10/15/20/30
minutes respectively, no grace. These are entitlement-test timers, not DOKU's
real invoice intervals. This subscription integration is **not yet enabled**;
the receipt and browser flow below describe the existing VA deployment.
See the [backend subscription integration gate](https://github.com/Hamanto-Studio/heritg-be/blob/feat/family-plan-options/docs/DOKU_RECURRING.md)
for catalog creation, invoice-contact disclosure, authenticated paid-cycle
reconciliation and cancellation requirements. Preserve all existing checkout
attempts and saved terms, including the current monthly 15-minute term.

For the new picker use **Monthly / 6 months / 1 year / 3 years**, showing the full
amount due each period. Explain “DOKU sends an invoice each period. Pay it manually
to renew. No automatic charges.” Do not expose these offers through the old
one-off Checkout adapter or treat registration as paid access. Required contact
data must be disclosed before it is sent to DOKU; never silently transmit family
members' data or the user's Google profile. Backend verification precedes UI enablement.

## Public pricing preview

The staging paywall now presents the September 9 proposal before sign-in:
Rp15.000 monthly, Rp49.000 per six months, Rp79.000 yearly and Rp199.000 per
three years. Prices are a display-only build-time proposal, **not** a fallback
checkout catalog or entitlement authority. They remain visible when auth is
loading, signed out, signed in or unavailable, without an anonymous entitlement
API or any customer data. Both English and Indonesian are supported.
Family+ benefits are expanded above pricing by default, before sign-in as well
as afterward. Only staging test-duration guidance remains collapsible.

The preview explicitly says subscriptions cannot be purchased yet. It has no
checkout action and does not pass proposed plans or amounts to the existing
one-off VA service. Test timers are in a separate expandable section. “Back to
tree” returns to free local editing. Existing pending checkout status and
scheduled backend recovery remain unchanged. Production keeps its existing
server-owned free-access offer and is not deployed by this change.

The following browser flow and September 8 receipt describe the **previous**
staging VA purchase UI, not currently available purchases in the new preview.

### September 9 public-preview deployment

- Benefits-first follow-up: source `795a3ad`, build `795a3ad-202609090038`,
  deployment `dpl_56NdALbmCwfmc2EtED6TRrPKKEDE`. All 38 focused paywall,
  provider and update-safeguard tests passed, plus lint/build/source secret scan.
  Desktop/mobile and the deployed DOM confirm one expanded benefits section
  before prices; exact-build, health/readiness and PWA asset checks passed.
- Source commit `d694ed6`; build `d694ed6-202609082356`.
- Vercel project `heritg-staging`, deployment
  `dpl_6Xf8i37v5tihPzsWyWcN6QVFbMig`, alias `https://staging.heritg.us/`.
- 902 tests passed, one existing skip; lint, staging build and source secret
  scan passed. Local desktop/phone review confirmed readable prices and no
  horizontal overflow, expandable test guidance and return to the canvas.
- The deployed Family+ dialog shows all four prices and its preview-only notice.
  This does not qualify the unfinished DOKU subscription/payment lifecycle.
- Public HTTP verification passed for the exact build, security headers, SPA
  deep links, manifest, service worker, registration script, immutable assets,
  API health/readiness and anonymous session denial.
- No backend deployment or production change. Existing backend purchase terms
  and recovery remain unchanged.

The install audit reports development-tool advisories in Vitest/@vitest/mocker
and lint-time js-yaml. Patched versions are Vitest 4.1.11 and js-yaml 4.3.2:
[Vitest advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9),
[js-yaml advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
The attempted patch resolution failed with npm's `edgesOut` resolver error;
manifest edits were reverted and the verified lockfile was preserved. Resolve
the dependency-install issue and rerun the suite before claiming an audit-clean
build. This is not evidence of payment-service or browser-runtime exploitation.

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

- Initial catalog: web commit `574ff3f`, build `574ff3f-202609081410`, deployment
  `dpl_8nU5LS26CsuF4aS1eD2re2cB7JUD`. Current follow-up: commit `320d3c9`, build
  `320d3c9-202609081458`, deployment `dpl_Gb3F7sxmBwneWVXmE1WTH5yBQYJD`,
  at `https://staging.heritg.us/`.
- Backend commit `9d9f8fd5c987484fabfd29b31c0bdfee69cd8722`, successful isolated
  [staging run 34235931427](https://github.com/Hamanto-Studio/heritg-be/actions/runs/34235931427).
- Initial web catalog: 893 tests passed, one existing skip; lint/build/audit/secret
  scan and PR CI passed. Follow-up [CI 34240887582](https://github.com/Hamanto-Studio/heritg/actions/runs/34240887582)
  passed 897 tests with one existing skip, lint, build, and secret scans.
  Desktop/mobile review confirmed all four plans and the selected-price
  action remain visible, with the staging banner clear of the modal header.
- All four DOKU VA simulator payments succeeded at the selected amounts. The
  public API and Firestore confirmed completed purchases with exactly
  10/15/20/30-minute access and no grace. Full wall-clock expiry passed for all
  four plans: cloud read/write became unavailable and the local add-person action
  remained available. The fixture exited successfully and cleaned its four
  synthetic accounts/sessions; only minimal terminal provider correlation remains.
  The lifecycle uses disposable server-created sessions and public API checkout
  requests; it does not qualify Google sign-in or a flawless browser-only
  four-plan checkout run. Production was not deployed or enabled for payments.
- The follow-up prevents first-install service-worker reloads and defers update
  reloads while a payment record exists (including unreadable storage). The next
  navigation uses the new worker. A fresh deployed browser submitted weekly,
  received 201, and reached DOKU without interruption; retry returned the same
  invoice. No simulator payment was necessary for that separate navigation check.

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
