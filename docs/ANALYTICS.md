# Optional product analytics

Reviewed September 12, 2026. Web implementation: first-party, opt-in, no vendor
SDK. Collection is **off by default and has not been enabled in production**.
The current production pricing deployment is separate from this analytics work.

This is the allowlist and public data contract for official Heritg Web. iOS and
Android do not send these events. Adding a journey, field, destination, or purpose
requires a policy and test update in the same change.

## Choice and purpose

Settings → Optional usage statistics offers “Keep off” and “Share usage
statistics” with equal prominence. No feature, account, price, or entitlement
depends on this choice. There is no startup consent wall. Consequently initial
visits and pre-consent onboarding are deliberately not measured.

Consent is off until explicitly enabled, lasts at most 180 days in this browser,
and is not synchronized to an account or another device. Turning it off aborts
in-flight requests where possible and discards pending local work. A request
already received cannot be recalled. Clearing site storage resets consent.
Global Privacy Control and Do Not Track override an opt-in. These are product
privacy choices, not a claim that all analytics is exempt from privacy law.
Crash diagnostics would require separate consent and are not included.

Only an explicitly enabled official production build at `https://heritg.us`
can send real-user events. Explicitly enabled stable staging at
`https://staging.heritg.us` is for synthetic verification only. Development,
tests, preview domains, localhost, offline sessions, and community origins are
no-op. There is no retroactive collection or durable offline queue.

## Journeys and start/end definitions

| Journey | Ordered steps (first = start, last = success) | Question |
| --- | --- | --- |
| App visit | Ready editor opened after consent | How many opted-in editor visits complete loading? |
| View change | Full/Focus/Fan requested → selected | Which presentation is chosen? |
| Onboarding | Empty canvas → first-person editor opened → person added | Does an opted-in visitor get started? |
| Import | File selected → decoded → persisted locally | Where do imports fail? |
| Export | Export requested → generated download handed to browser | Can people prepare a backup/chart? |
| Create share | Create requested → encrypted → uploaded → active link and revocation record saved | Where does encrypted sharing fail? |
| Open share | Password submitted → tree decrypted and opened in memory | Can recipients unlock a share? |
| Sign-in | Identity proof submitted → server authentication validated | Does authentication complete? |
| Family+ discovery | Paywall opened → valid signed-in continue → checkout ready → backend-confirmed access observed | Where does an upgrade attempt drop off? |
| Checkout | Purchase/claim requested → checkout ready → backend-confirmed active access | Does intent become access? |
| Sync setup | User enables sync → reconciliation reaches up-to-date | Does opt-in sync setup complete? |

The wire names and exact step indices are frozen in
[`analyticsContract.ts`](../web/src/analyticsContract.ts); the backend owns an
identical `src/analytics-contract.ts`. Both must change together.

Each attempt starts at step 0 and has one terminal outcome: `success`,
`failed`, or `cancelled`. Intermediate steps use `in_progress`. Failure
and explicit cancellation preserve the last reached step. An unfinished attempt
becomes **abandoned after 24 hours**, calculated by the report; closing a tab is
not a fabricated success or cancellation. A retry is a new attempt.

Important measurement limits:

- Counts represent attempts, **not unique people**, visitors, accounts, or revenue.
- There is no cross-journey identity or long-term retention/cohort tracking.
- Onboarding “person added” means accepted by the editor, not a guarantee that
  browser storage will remain available. Import success requires a persisted import.
- Export success means handed to the browser; the browser cannot prove the
  user saved the file. Share success is a usable link, not proof it was delivered.
- Open-share starts at password submission, not a page view. No shared URL,
  password, fragment, or sender/recipient relationship is captured.
- Google sign-in starts after a Google proof is returned. Abandoning Google's
  own interface is not observed. Email verification is measured separately.
- Paywall closure is a discovery cancellation, never a cancelled payment.
- Paid checkout success requires authenticated backend status `completed`
  and refreshed active access. An existing subscription, redirect, button click,
  or return query string is not payment evidence. Free claims are separate.
- Staging sandbox conversions are not real charges. Analytics does not change payment reconciliation or entitlement logic.
- Lost requests, blockers, offline work, expired consent, cancelled navigation,
  or confirmations after the 24-hour window cause undercounting. There are no
  silent retries to bypass these choices.
- These are browser-reported product metrics, not financial audit records.
  A public collector can be spoofed despite validation and rate limits.

## Exact transmitted fields

A POST to `/api/v1/analytics/journeys` contains only:

| Field | Allowed value |
| --- | --- |
| `schemaVersion` | Integer `1` |
| `attemptId` | Fresh random UUIDv4 for this attempt only |
| `journey` | One of the eleven fixed wire journey names |
| `variant` | An allowed format, identity method, fixed plan category, or `default` |
| `step` | Valid ordered integer index for that journey |
| `outcome` | `in_progress`, `success`, `failed`, `cancelled` |

Import variants: `heritg`, `gedcom`, `json`, `default` (unsupported file).
Export: `heritg`, `gedcom`, `png`, `pdf`, `svg` (PDF reserved for its separate feature PR).
Sign-in: `google`, `email`.
Checkout: `free`, `six_month`, `yearly`, `three_year`, and legacy `weekly`, `monthly`, `two_year`.
View choices: `full`, `focus`, `fan`.
Family+ discovery: `free_user` (known free/expired access at opening),
`existing_access` (active/read-only at opening), or `default` (unknown/signed-out).
Other journeys use `default`. No arbitrary property dictionaries exist.
The contract also accepts `default` for unspecified export/sign-in variants;
the current Web controls always send the concrete format or identity method.

The browser omits cookies, authorization, referrer, and URL parameters from the
collector request. The server validates the same allowlist again, rejects
unknown fields and unsafe context, enforces 1 KiB bodies, and returns no content.
API and service-worker caching are prohibited. No GET beacon or sendBeacon is used.

## Never collected

No names, dates, notes, search text, relationships, family structure or size
(including size buckets), photos, files, filenames, hashes of family content,
archive contents, addresses, email, account IDs, Google proofs, session/CSRF
tokens, checkout/invoice IDs, payment instruments, share IDs, passwords, keys,
viewing/deletion capabilities, URLs, fragments, page titles, raw errors,
device fingerprints, persistent user/device IDs, advertising IDs, precise
location, screenshots, heatmaps, or session replay.

## Storage and processors

The first-party collector reuses Heritg's Cloud Run and private Firestore in
Jakarta. This replaces the earlier proposal to select a hosted analytics vendor;
there is **no new third-party analytics SDK or advertising provider**. Existing
Cloudflare and Google Cloud processing terms still apply (Vercel only for retained
legacy hosting paths). The current first-party proxy runs at Cloudflare's global
edge; private analytics records remain in the existing Jakarta database.

Firestore stores a hash of the random attempt ID, the last validated allowlisted
event (without the raw ID), and server start/update/expiry timestamps. Transactional
updates deduplicate retries; reached steps cannot go backwards or change variant.
Records are never joined to accounts, payment tables, shares, family data, or
abuse-prevention windows. Operators can technically read these limited records;
this telemetry is **not end-to-end encrypted** and “no permanent ID” is not a
promise that all records are legally anonymous.

An attempt is memory-only except for unfinished checkout and Family+ discovery, whose random
analytics records can live in **sessionStorage for up to 24 hours** to bridge the
payment-page round trip in the same tab. It contains no payment or account ID.
Completion and withdrawal clear them. Account-session changes clear purchases
already in progress; the anonymous pre-purchase paywall step survives sign-in.
Expired attempts are never sent and are cleared on the next restore check. Separate
tabs or devices are not linked. The consent choice and “last sent” timestamp are
local browser preferences, not transmitted fields.

Records expire 30 days after the first event. Reports immediately exclude
expired records. The scheduled cleanup deletes expired records in bounded
batches and Firestore TTL provides a safety net. Physical deletion is asynchronous;
Firestore generally processes TTL within 24 hours, not at an exact deadline.
Existing point-in-time recovery may retain recovery versions for up to seven
additional days; they are not used for analytics.
See [Firestore TTL](https://firebase.google.com/docs/firestore/ttl) and
[recovery retention](https://firebase.google.com/docs/firestore/use-pitr).

No permanent identity is retained to look up all historical events for a person.
Withdrawal stops future collection; previous records expire under this schedule.
Clearing local data does not send a deletion identifier to the backend.

The network providers necessarily process IP address and standard transport
metadata to deliver requests. Heritg never adds that metadata to journey records.
Separate short-lived HMAC rate-limit windows prevent abuse and are not joined to
analytics. Before enabling collection, apply the collector-specific Cloud Run
request-log exclusion and review Cloudflare, any retained Vercel paths, organization-level logging sinks, and
provider retention. Do not claim that infrastructure never sees an IP address.

## Analysis and access

Use the backend's private, read-only operator report described in
[backend analytics operations](https://github.com/Hamanto-Studio/heritg-be/blob/main/docs/ANALYTICS.md).
It shows started/reached/success/failed/cancelled/abandoned/in-progress counts and
completion rates by journey and approved variant. Cells below five attempts are
suppressed; that is a presentation safeguard, not formal anonymization.
Reports are not exposed through a public API and must not be published as raw data.
Do not export raw journey records. Saved aggregate reports require an owner and
a deletion date; default to the same 30-day window.

Completion rate = successes / starts in the selected start-time window. Recent
cohorts still contain in-progress attempts. Compare equal, mature periods; do
not treat in-progress work as failure or compare sandbox and real-user counts.
Use period comparisons around releases; this version intentionally does not
collect browser/device/geographic or release identifiers.

## Activation and rollback gates

1. Review this contract, translations, processing registers, and privacy notice.
2. Verify matching frontend/backend contracts and all tests using synthetic data.
3. Review/apply the environment-specific TTL and request-log exclusion Terraform
   additions with explicit infrastructure approval. Check other log sinks and
   provider terms, Jakarta processing, cleanup, IAM, retention and expected cost.
4. Enable backend `ANALYTICS_ENABLED=true` on a staged revision and verify the
   synthetic start/milestone/end lifecycle, duplicates, denial and cleanup.
5. Build the official staged web app with `HERITG_ANALYTICS_ENABLED=true`.
   Verify zero requests before opt-in, after withdrawal, on privacy signals,
   offline, and on preview/local origins. Verify actual task outcomes.
6. Review jurisdiction-specific consent/data-processing obligations before real
   collection; these engineering controls do not certify universal legal compliance.
7. Only then enable the approved production backend and web release. Do not
   bypass normal exact-artifact staging, promotion, or rollback gates.

Both flags default false. The current Cloudflare build explicitly passes the
selected analytics flag, includes it in its build fingerprint, and records it in
private build metadata. The proxy forwards consent, DNT and GPC headers without
adding cookies to cookie-free requests. Routine deploys must not accidentally turn analytics
on through inherited Vercel or cloud configuration. Rollback: turn the collector
off, publish a web build with collection off, keep retention cleanup running.
No schema migration, family data migration, payment-provider change, or DNS
change is required.

Design references: [CNIL analytics guidance](https://www.cnil.fr/fr/node/677),
[consent design](https://design.cnil.fr/en/concepts/consent/), and
[W3C Global Privacy Control](https://www.w3.org/TR/gpc/).

## Reading the free-to-paid funnel

The Family+ discovery journey has one attempt ID from paywall through confirmation,
including the same-tab payment return. Free/expired-at-opening attempts are shown
separately from existing-access and unknown visitors. A retry after an explicit
failure or closure is a new attempt; resuming the same pending checkout is not a
new payment. This is **attempt conversion**, not unique free users converted.
Existing access can include a free grant, so it is not a paid-subscriber segment.

Use the backend report with `--payments --markdown` for two clearly separated views:

- Browser funnels: each milestone, per-step conversion, failures, unfinished work,
  abandoned attempts after 24 hours, mature-cohort conversion and p50/p90 completion
  time measured from server receipts. View-change success means the view was selected,
  not a rendering/performance measurement; app visits start only once the editor is ready.
- Backend payment outcomes: existing invoice states, verified completed payments,
  gross completed IDR, paid/created and paid/resolved rates, grouped by provider,
  catalog environment and plan. A durable completed checkout also proves the
  entitlement transaction committed, even if the browser never returned.

These populations are deliberately **not joined**. Do not divide all paid invoices
by opted-in browser visits or claim unique-user conversion, attribution, retention,
LTV, first purchase vs renewal, net revenue, refunds, or settlement reconciliation.
Free claims and mock grants are never counted as paid. Legacy/production/sandbox
catalog groups stay separate. Reports require read-only operator access; there is
no public admin endpoint, third-party SDK, family-content collection or new billing
record storage. Small cells below five are suppressed, not anonymized guarantees.
