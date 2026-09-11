# HERITG Privacy Policy

Effective date: September 12, 2026

HERITG is developed by Hamanto Studio. It is designed to let people create and
preserve family trees without creating an account. Web users may optionally
use Google for account features. Family information remains local unless the
user deliberately exports it, creates an encrypted share, or enables encrypted
Family+ synchronization.

This policy describes the official HERITG application represented by this
repository. A modified or redistributed build may behave differently and is the
responsibility of its distributor.

## Summary

- No HERITG account, email address, or sign-up is required.
- Optional Google sign-in creates or restores a Heritg account after Google
  proves the identity to the environment-specific account service.
- Family-tree data is stored locally on the user's device.
- Family+ users may enable client-encrypted synchronization to private storage
  in Jakarta. The service stores an encrypted recovery copy of each tree key.
- Web users may create expiring read-only links; encryption happens in the browser and the sharing service receives ciphertext without its viewing key.
- Core functionality does not require an internet connection.
- Optional Web usage statistics are off by default and require explicit consent.
- No analytics or crash-reporting SDK is used.
- HERITG does not use Firebase Analytics or Google Analytics.
- HERITG does not contain advertising SDKs or perform cross-app tracking.
- Family-tree content is not sold or used for advertising.

The current processing register is published in
[`docs/DATA_PROCESSING.md`](docs/DATA_PROCESSING.md).

## Family Data

HERITG may store information entered by the user, including names, family
relationships, dates, photographs, notes, and imported genealogy records. This
information is stored in the app's local container using Apple platform storage
technologies on iOS and IndexedDB in the user's browser on the web.

Hamanto Studio operates an optional Web account system and entitlement-gated
encrypted synchronization. The synchronization and sharing services receive
encrypted snapshots and lifecycle metadata, not family plaintext or viewing
keys. Deleting a person, tree, or the application
removes data according to the app, browser, and operating system behavior. Web
users can also remove local data by clearing the site's browser storage. Device
backups managed by Apple or browser-profile backup and synchronization features
may retain local app data according to the user's platform settings and provider
policies.

## Imports, Exports, and Sharing

When a user imports a file, HERITG processes it on the device. When a user
exports or shares a tree, the user chooses the destination through the Apple
system interface on iOS or the browser's download interface on the web. Web JSON
backups are identified as `.json`; the cross-platform `.heritg` archive format
is documented separately in [`docs/DATA_FORMAT.md`](docs/DATA_FORMAT.md).

After an export leaves HERITG, its handling is controlled by the selected app,
service, recipient, and the user's choices. Exported family information may be
sensitive, so users should share it only with trusted recipients.

### Encrypted Web Share Links

Web users can explicitly create an immutable, read-only snapshot that expires
after 7, 30, or 90 days. The browser derives an AES-256-GCM key from the
user-chosen share password and uploads only authenticated ciphertext to private
Cloud Storage in Jakarta. The password and derived key are not sent to Vercel,
Cloud Run, Firestore, Cloud Storage, or Hamanto Studio.

Anyone with the link and password can decrypt, view, forward, and save an
independent copy until the link expires or is revoked. Heritg stores the
revocation capability in encrypted browser storage but does not retain the
password or derived viewing key. Clearing site data can therefore remove the
sender's ability to revoke a link early.

## Network Access

The current app does not require network access for its core family-tree
features. Opening an external support link or using an Apple-provided service
may contact that service under its own terms.

Opening the web app downloads its public HTML, JavaScript, styles, fonts, and
images from Cloudflare Workers static hosting at `heritg.us`. Cloudflare also
provides DNS and proxies application API requests to Cloud Run, including
authentication, payment-status and encrypted-sharing requests. Cloudflare may
process HTTP metadata such as IP address, user agent, URL and request timing to
deliver and protect the service. The edge signs visitor-IP attribution for the
backend's HMAC-pseudonymized abuse limits; HERITG does not log that proof or IP.
Worker invocation logs and traces are disabled. A service worker may cache public
assets for offline use, but never API responses or shared ciphertext. HERITG does
not send plaintext family-tree content from IndexedDB to hosting providers. It sends encrypted
snapshots to private storage only after the user creates a share link or enables
Family+ synchronization.

The encrypted-sharing service uses Cloud Run, Firestore, and private Cloud
Storage in Jakarta. These services process ciphertext size, share state,
creation and expiration times, short-lived signed transfer capabilities, and
HMAC-pseudonymized rate-limit windows. Operational logs exclude request bodies,
share capabilities, viewing keys, and family plaintext.

### Family+ payments

Optional prepaid Family+ access uses DOKU's hosted production checkout. DOKU
processes the payment details entered on its page under its own privacy terms.
HERITG stores the selected plan, amount, currency, opaque invoice reference,
provider status, payment timestamps and resulting account entitlement. These
records support verification, duplicate-payment protection, recovery and access
duration. Family names, tree content, sharing passwords and encryption keys are
not payment inputs. HERITG does not receive bank login credentials. Signed
notifications and authenticated provider status checks confirm payment; a browser
redirect does not grant access. Payments are one-time, without automatic charges.

### Encrypted Family+ Synchronization

After Google sign-in and explicit Family+ activation, the user can enable
synchronization. The browser encrypts each snapshot with an owner-held tree key
before upload. Cloud Run, Firestore, and private Cloud Storage in Jakarta process
only ciphertext, opaque account/tree identifiers, revisions, sizes, timestamps,
and an encrypted recovery copy of the tree key. The backend can unwrap that key
for an authenticated owner, so this is not end-to-end encryption against the
service operator. Disabling synchronization is
stored on the device and stops automatic transfers after in-flight work ends.
Account or tree deletion removes the corresponding hosted synchronization data.

Browser storage and its encryption key are isolated by origin. The public
landing page is served at `family.heritg.us`, and the application is served
at `heritg.us`. These are separate origins, and the app's service
worker is limited to the app origin. Family data created on localhost, the
landing site, or a Vercel preview URL does not automatically appear in the
production app. Users must deliberately export and import a backup to move
data between origins.

If optional analytics, crash reporting, sync, backup, or another online feature
is introduced, it must:

1. Be documented in this policy and the processing register before release.
2. Keep core local functionality available without the service.
3. Request separate consent where required by the public analytics policy.
4. Never send family-tree content to analytics or diagnostics providers.

## Optional Google Sign-In

Web users may explicitly sign in with Google. The browser obtains a one-time
Google identity proof and sends it to the HERITG account service over the
same-origin API. Google may process the user's Google account and standard
network metadata under Google's terms. Opening Account Settings while signed
out loads Google Identity Services so its sign-in control is ready; no identity
proof is sent to HERITG until the user activates that control. HERITG verifies the proof for the exact
environment-specific client. The account service persists a pseudonymous
hash-derived Google subject, an opaque HERITG account identifier, the verified
Google name and email address used for account display, and expiring session
metadata. It does not persist the Google identity token, profile image, or
family-tree content as part of sign-in.

The browser stores the session in a secure host-only HttpOnly cookie and uses a
separate session-bound CSRF value for account changes. Signing out revokes the
current HERITG session. Users can permanently delete their HERITG account from
Settings without deleting family-tree data stored locally in the browser.
Deletion removes profile name/email, sessions, and hosted account content. A
deletion tombstone, opaque account identifier, and hash-derived Google subject
mapping remain to prevent reactivation of the deleted identity and enforce
security and abuse controls.
Google sign-in alone does not upload local trees, authorize anonymous shares, or
make local editing depend on network access. Family+ activation and the separate
synchronization control are required before encrypted snapshots are transferred.

## Analytics

Heritg Web includes a first-party, optional usage-statistics implementation. It
is disabled by default and is not yet enabled for production collection. Where
explicitly enabled, users may opt in from Settings and turn it off at any time
without losing features. Browser Global Privacy Control and Do Not Track keep
collection off. Consent is specific to this browser and expires after 180 days.
iOS and Android do not send these events.

The limited records describe task starts, milestones, and outcomes—not family
content. Each task has a new random identifier; there is no permanent user/device
identifier, account association, session replay, advertising, or cross-app tracking.
An unfinished checkout and its Family+ discovery journey may keep random analytics attempts in sessionStorage for
up to 24 hours to recognize a same-tab payment return. No checkout or account ID
is included. Withdrawal discards pending local work and stops future collection;
requests already received cannot be recalled or located by account identity.

Heritg's Cloud Run and private Firestore in Jakarta process the allowlisted
events and server timestamps. Records expire from reports at 30 days and are
deleted asynchronously by cleanup/TTL. Existing recovery copies may persist up
to seven additional days. Network providers still process standard transport
metadata; it is not added to product-event records. This telemetry is not
end-to-end encrypted against Heritg. Internal reports hide small counts and are
accessible only to authorized operators. No new analytics vendor is introduced.

The complete event catalog, retention details, consent controls, processors,
measurement limits, and rollout status are in
[`docs/ANALYTICS.md`](docs/ANALYTICS.md). Names, relationships, dates, photos,
notes, files, passwords, keys, account identifiers, URLs, raw errors, family size,
fingerprints, and all user-entered analytics values are prohibited.

Authorized operators may also summarize existing billing records by plan and
status to understand verified paid checkouts and gross completed amounts. These
are separate operational aggregates, not an identity join with browser events;
no family data, customer identity, invoice ID, or payment URL is printed.
They are not unique-user counts or a replacement for financial reconciliation.

## Crash Reporting

HERITG does not currently include Sentry, Firebase Crashlytics, or another
third-party crash-reporting SDK.

If optional crash reporting is introduced, it will use separate consent from
product analytics. Reports must be sanitized and limited to technical data
needed to diagnose failures, such as app version, operating-system version,
coarse device model, error code, and stack trace. Family data, exports,
screenshots, view hierarchy, user-entered text, and request bodies are
prohibited.

Apple may independently offer users the choice to share diagnostics with Apple
and developers. That operating-system service is controlled by Apple and the
user's device settings.

## Firebase

HERITG does not currently integrate Firebase services. If selected Firebase
services are added in the future, each service and its purpose will be listed
in the processing register.

Using Firebase infrastructure does not require Firebase Analytics. HERITG's
policy is not to include Firebase Analytics or Google Analytics. Firebase Admin
SDK credentials and service-account private keys must never be included in the
application.

## App Store and Purchases

For iOS distribution, Apple processes App Store downloads, payments, receipts, and related account
information under Apple's privacy policy. Hamanto Studio does not receive a
user's full payment-card details from Apple.

App Store Connect may provide Hamanto Studio with aggregate sales, download,
conversion, and performance reports. These platform reports are separate from
in-app behavioral analytics.

## Children and Family Members

A family tree may contain information about children or other people who are
not using HERITG. Users are responsible for having an appropriate basis to
record, export, and share information about other people. HERITG does not use
that information for profiling or advertising.

## Data Sale, Advertising, and Tracking

Hamanto Studio does not sell family-tree data. HERITG does not currently use
advertising SDKs, data brokers, device fingerprinting, or tracking across apps
and websites owned by other companies.

## Security

HERITG uses platform storage protections, but no software can guarantee
absolute security. Users should protect their device and browser profile,
maintain appropriate backups, and handle exported files carefully.

Repository security practices and vulnerability-reporting guidance are
documented in [`SECURITY.md`](SECURITY.md).

## Changes to This Policy

Material privacy changes will be published in this repository and reflected in
the effective date. A new provider, collected field, analytics event, or online
feature must update the relevant public documentation in the same change.

## Contact

For privacy questions, contact Hamanto Studio through
[Telegram](https://t.me/robihamanto). Do not include family-tree data, private
keys, credentials, or other sensitive information in the initial message.
