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

Implementation is in the working trees; this document is not a deployment receipt.
Component tests exercise direct Google callback/session exchange, preserved plan
selection, no automatic checkout, dismissal across provider remount, and a failed
then confirmed cancellation while switching plans. These use synthetic Google and
payment responses, not a claim of real Google or DOKU end-to-end qualification.

The full frontend suite passed 909 tests with one existing skip; lint and build
passed. Phone (390px) and tablet/desktop (832px) layouts were inspected together.
The backend receipt in `heritg-be/docs/CHECKOUT_RECOVERY.md` records real provider
cancellation before and after VA issuance, legacy Request-Id recovery and real
Firestore transaction-race qualification. DOKU sandbox cancellation is enabled;
abandoned-cart recovery remains off. No real payment or family data was used.

Before declaring rollout complete, verify the deployed Google popup, public
authenticated recovery and a real browser return/resume. Keep production unchanged. Deploy backend
support before the frontend exposes these actions. Never clear website data to
test refresh behavior: that can erase locally saved trees.
