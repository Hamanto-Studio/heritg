# HERITG Privacy Policy

Effective date: August 4, 2026

HERITG is developed by Hamanto Studio. It is designed to let people create and
preserve family trees without creating an account. Family information remains
local unless the user deliberately exports it or creates an encrypted share.

This policy describes the official HERITG application represented by this
repository. A modified or redistributed build may behave differently and is the
responsibility of its distributor.

## Summary

- No HERITG account, email address, or sign-up is required.
- Family-tree data is stored locally on the user's device.
- Web users may create expiring read-only links; encryption happens in the browser and the sharing service receives ciphertext without its viewing key.
- Core functionality does not require an internet connection.
- HERITG does not currently include product analytics or crash-reporting SDKs.
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

Hamanto Studio does not operate an account system or hosted editable family
database. The optional Web sharing service receives encrypted snapshots and
lifecycle metadata, not plaintext or the URL-fragment viewing key. Deleting a person, tree, or the application
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
after 7, 30, or 90 days. The browser encrypts the selected family tree with a
new AES-256-GCM key and uploads only the authenticated ciphertext to private
Cloud Storage in Jakarta. The key is placed after `#` in the share URL and is
not sent to Vercel, Cloud Run, Firestore, Cloud Storage, or Hamanto Studio.

Anyone with the complete link can decrypt, view, forward, and save an independent
copy until the link expires or is revoked. Heritg stores the revocation capability
in encrypted browser storage but does not retain the secret viewing key. Clearing
site data can therefore remove the sender's ability to revoke a link early.

## Network Access

The current app does not require network access for its core family-tree
features. Opening an external support link or using an Apple-provided service
may contact that service under its own terms.

Opening the web app downloads its public HTML, JavaScript, styles, fonts, and
images from Vercel's static hosting infrastructure. Vercel may process standard
HTTP request metadata, such as IP address, user agent, requested URL, and
request timing, to deliver and protect those public files under its terms.
Cloudflare provides authoritative DNS for `hamanto.com`; the HERITG hostname is
configured as DNS-only, so Cloudflare resolves the hostname but does not proxy
family-tree content or application traffic. A service worker may cache public
assets in browser Cache Storage for offline use. HERITG does not send
family-tree content from IndexedDB to Vercel or Cloudflare. It sends an encrypted
snapshot to the sharing service only after the user creates a share link.

The encrypted-sharing service uses Cloud Run, Firestore, and private Cloud
Storage in Jakarta. These services process ciphertext size, share state,
creation and expiration times, short-lived signed transfer capabilities, and
HMAC-pseudonymized rate-limit windows. Operational logs exclude request bodies,
share capabilities, viewing keys, and family plaintext.

Browser storage and its encryption key are isolated by origin. The public
landing page is served at `heritg.hamanto.com`, and the application is served
at `heritgapp.hamanto.com`. These are separate origins, and the app's service
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

## Analytics

HERITG does not currently send product analytics. Any future product analytics
must be optional and follow the public event and property allowlist in
[`docs/ANALYTICS.md`](docs/ANALYTICS.md).

That contract prohibits collection of names, family relationships, dates,
photos, notes, search terms, files, exact family size, advertising identifiers,
session replay, and user-entered analytics values.

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
