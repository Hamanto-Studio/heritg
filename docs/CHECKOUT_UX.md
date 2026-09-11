# Family+ checkout recovery

## Product decision

Keep the three prepaid periods (six months, one year, three years), public prices,
visible benefits, and one explicit payment. No recurring charges or invoices.
Google sign-in belongs inside the paywall; signing in must not purchase anything.
Preserve the selected plan while the popup opens, closes, fails or succeeds.

## Research and application

[Baymard's checkout research](https://baymard.com/learn/checkout-flow-ux-optimization)
recommends a linear path, clear action labels, safe backward navigation and
preserving selections through errors. Applied here: remove the Settings detour,
keep the chosen plan, and separate “Resume payment” from “Check payment”. Account
sign-in remains necessary for this account-bound entitlement; this is not a
proposal to add anonymous paid access.

[DOKU cancellation](https://developers.doku.com/accept-payments/doku-checkout/order-and-notification-handling/cancel-order-api)
supports unpaid eligible VA/QRIS orders and requires activation in Checkout
Appearance → System Settings → Order Cancellation. It requires the original
checkout request ID. A failed channel attempt is not necessarily a closed order.
[Order status](https://developers.doku.com/accept-payments/doku-checkout/order-and-notification-handling/order-status-for-checkout-page)
also exists before a channel is selected. These distinctions determine whether
another payment may be created, rather than the browser return URL.

## Interaction contract

Plan choices lead with the full upfront total in bold, followed by the one-time
payment label. A smaller, muted monthly equivalent underneath is supporting
comparison information, not the main price. Round IDR monthly equivalents to the
nearest Rp100 and label them “About” / “Sekitar”: Rp49.000 / 6 → about Rp8.200
per month; Rp79.000 / 12 → about Rp6.600; Rp199.000 / 36 → about Rp5.500.
Preserve smaller-than-Rp100 equivalents rather than rounding them to zero; do
not apply rupiah rounding to other currencies or to the actual payment total.
These comparisons use the server-owned calendar-month term, never accelerated staging minutes. The copy
explicitly says payment is upfront, not monthly. The purchase button continues
to show the exact full charge; selecting a plan still submits only its ID.
English and Indonesian copy, before-sign-in visibility, missing/invalid durations,
and server-price changes have regression coverage. Phone/tablet, 320px and 200%
text-size checks preserve readable pricing without horizontal overflow.

| Situation | User experience | Safety rule |
| --- | --- | --- |
| Signed out | Real Continue with Google button inside Family+ | Same nonce/session exchange as Settings; no invoice until explicit payment click |
| Popup closed or sign-in fails | Selected plan remains; retry is available | No automatic charge or navigation to Settings |
| Back from DOKU without paying | Payment-not-completed reminder links to Family+ | Return/query parameters never prove success or cancellation |
| Pending order | Resume payment, Check payment, Cancel payment | Resume returns the same server-saved URL, never creates an invoice |
| Wants one year instead of three | Choose one year; cancel the old checkout with confirmation; click the new payment button | Never auto-purchase after cancellation |
| Already paid during cancellation | Refresh entitlement and show confirmation | Verified completion wins; retries do not extend access twice |
| Cancellation unavailable or uncertain | Keep the pending order and show a recoverable error | Do not discard the retry key or create a replacement |
| Reminder dismissed | Stays hidden after page reload; order remains in Family+ | Hiding is not cancelling; local family data is untouched |
| Provider waiting | At most three initial checks, then user-controlled status check | Do not present an indefinite “checking” spinner |
| Browser restores page from back-forward cache | Refresh session/entitlement | Do not leave the purchase button permanently loading |
| Different account / session expires | Sign in to the original account | No foreign-account resume, cancellation, or entitlement mutation |
| Two tabs / rapid clicks | Backend refuses another pending reservation | Browser disabling alone is not duplicate-charge prevention |
| New tab or browser storage lost | Family+ rediscovers the account's pending invoice quietly | Stable owner-bound recovery alias; no new invoice; no intrusive reminder |

## Verification status

The component tests below are distinct from the deployed runtime receipt that follows.
Component tests exercise direct Google callback/session exchange, preserved plan
selection, no automatic checkout, dismissal across provider remount, and a failed
then confirmed cancellation while switching plans. These use synthetic Google and
payment responses, not a claim of real Google or DOKU end-to-end qualification.

The full frontend suite passed 912 tests with one existing skip; lint and build
passed. Phone (390px) and tablet/desktop (832px) layouts were inspected together.
The backend receipt in `heritg-be/docs/CHECKOUT_RECOVERY.md` records real provider
cancellation before and after VA issuance, legacy Request-Id recovery and real
Firestore transaction-race qualification. DOKU sandbox cancellation is enabled;
abandoned-cart recovery remains off. No real payment or family data was used.

## Staging deployment receipt — September 9, 2026

Frontend commit `f416989` is deployed as build `f416989-202609091625`, Vercel
deployment `dpl_CrwzHxP1a2pb77SJoEh6twLaSsob`, at https://staging.heritg.us/.
[Web CI 34375827119](https://github.com/Hamanto-Studio/heritg/actions/runs/34375827119)
passed; secret-scan and commit-title checks also passed. The deployed asset and
build string, `/billing/return` fallback, manifest, security headers, backend
health and readiness were verified after deployment.

In a fresh private Safari window, the deployed paywall displayed all three prices
without sign-in. Selecting three years and clicking the real Google button
opened Google's sign-in window directly, with no Settings navigation. Closing
that window retained the Family+ dialog and selected three-year plan. No real
Google account was signed in or charged for this check; successful callback and
session exchange are covered by the component integration tests above.

Backend staging was deployed and verified first. The public authenticated API
smoke passed with a disposable session: reopening the same URL, account-based
pending recovery, wrong-account/CSRF denial, duplicate prevention, actual DOKU
cancellation, then a new one-year invoice at Rp79.000. Both orders were cancelled,
and the test account/session were removed. See
[the backend receipt](https://github.com/Hamanto-Studio/heritg-be/blob/feat/family-plan-options/docs/CHECKOUT_RECOVERY.md).

Production is unchanged. Runtime dependency audit reports no vulnerabilities;
the full build-tool audit reports existing Vitest/mocker and js-yaml advisories
(two moderate, one high). These are not shipped runtime dependencies and were
not changed by this checkout patch; review their patches before a production
release. Never clear website data to test refresh: it can erase local trees.

### Reload race follow-up

A real isolated Chrome test reached DOKU and returned through Back to Merchant.
Opening Family+ immediately after a dismissed-reminder reload exposed a session
restoration race: pending actions stayed in the signed-out state. Session loading
is now distinct from signed out; the saved plan is preserved, actions wait for
authentication, and an open pending panel refreshes when the session is restored
without reviving its dismissed reminder. The regression test deliberately delays
the session response. Separate fake-clock tests prove automatic status checks stop
after three attempts, both normally and during provider errors; manual checking
remains available.

Follow-up commit `df021b0` is deployed as build `df021b0-202609091649`, Vercel
deployment `dpl_GzvLtmBe9sMTRbHavZ2CCDchmGCJ`, at https://staging.heritg.us/.
The exact built JavaScript, billing-return route, manifest, service worker,
registration script and security headers were rechecked. Backend revision and
production remain unchanged.

The isolated Chrome browser smoke passed against this deployed build using a
disposable server-created session (not Google credentials):

1. Select three years in the actual paywall and open DOKU.
2. Use DOKU Back to Merchant, hide the reminder, reload and immediately reopen
   Family+. The three-year choice and pending actions remain available.
3. Close the paywall: the dismissed reminder stays hidden. Reopen and resume:
   the exact original DOKU URL opens, with only one checkout-creation request.
4. Return again, choose one year and confirm cancellation of the old order.
   DOKU confirms closure before another purchase becomes available. The one-year
   selection remains; no replacement is purchased automatically.
5. Respect the rate window, then explicitly purchase one year. Exactly two
   invoices exist with the original Rp199.000 and new Rp79.000 amounts.

No payment was simulated or money transferred during this recovery test; no
entitlement was granted. Both orders were confirmed cancelled and the disposable
account/session removed. The reproducible browser smoke lives in
`heritg-be/scripts/smoke-checkout-browser.mjs`. The Safari Google-popup check above
is separate evidence; this browser fixture does not independently qualify Google
credential exchange or every device.
