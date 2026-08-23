# HERITG Privacy Policy

Effective date: August 23, 2026

HERITG is developed by Hamanto Studio. It is designed to let people create and
preserve family trees without creating an account. Web users may optionally
use an emailed sign-in link or Google for account features. Family information remains local
unless the user deliberately exports it or creates an encrypted share.

This policy describes the official HERITG application represented by this
repository. A modified or redistributed build may behave differently and is the
responsibility of its distributor.

## Summary

- No HERITG account, email address, or sign-up is required.
- Optional email sign-in uses the same private flow for signup and signin; a new account is created only after the emailed link is proved.
- Google remains a separate migration fallback. Email and Google identities are not automatically linked.
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
information is stored in the app's local container using platform storage
technologies on iOS and Android and IndexedDB in the user's browser on the web.

Hamanto Studio operates an optional pseudonymous Web account system but does
not currently operate hosted editable family-tree sync. The optional Web
sharing service receives encrypted snapshots and lifecycle metadata, not
plaintext, the share password, or its derived viewing key. Deleting a person, tree, or the application
removes data according to the app, browser, and operating system behavior. Web
users can also remove local data by clearing the site's browser storage. Device
backups managed by the operating system or browser-profile backup and
synchronization features may retain local app data according to the user's
platform settings and provider policies. HERITG disables Android application
backup and device-to-device transfer for its local family database.

## Imports, Exports, and Sharing

When a user imports a file, HERITG processes it on the device. When a user
exports or shares a tree, the user chooses the destination through the system
share interface on iOS or Android or the browser's download interface on the
web. Web JSON backups are identified as `.json`; the cross-platform `.heritg`
archive format is documented separately in
[`docs/DATA_FORMAT.md`](docs/DATA_FORMAT.md).

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
features. Opening an external support link or using an operating-system service
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

## Optional Email and Google Sign-In

Web users may submit an email address to receive a single-use sign-in link. The
request and response are deliberately generic and do not reveal whether an
account already exists. Following a valid link signs in an existing account or
creates a new account only after control of the address has been proved. The
link credential is carried in the URL fragment, removed from browser history
before verification, and is not placed in a query, path, browser storage, or
application log.

HERITG's account service processes the submitted address and short-lived,
single-use verification records. It sends the message through Resend, which
processes the recipient address, message content, delivery status, and standard
email/network metadata under Resend's terms. Unproved verification records are
kept only until their configured expiry; consumed records cannot be reused.
HERITG persists only a keyed hash of the normalized email for account lookup,
not the raw address. Account metadata and that keyed hash are deleted through
the account-deletion process, subject to security, abuse-prevention, backup, and
provider retention obligations.

The browser does not persist the submitted address. It may keep the raw address
only in component memory while Account Settings remains open so the user can
resend the message. It renders only a masked form after acceptance and clears
the raw value when Settings closes, the component unmounts, or a session is
established.

Web users may explicitly sign in with Google. The browser obtains a one-time
Google identity proof and sends it to the HERITG account service over the
same-origin API. Google may process the user's Google account and standard
network metadata under Google's terms. HERITG verifies the proof for the exact
environment-specific client and persists only a pseudonymous hash-derived
Google subject, an opaque HERITG account identifier, and expiring session
metadata. It does not persist the Google identity token, name, email address,
profile image, or family-tree content as part of sign-in.

The browser stores the session in a secure host-only HttpOnly cookie and uses a
separate session-bound CSRF value for account changes. Signing out revokes the
current HERITG session. Users can permanently delete their HERITG account from
Settings without deleting family-tree data stored locally in the browser.
Google is retained as a migration fallback. A Google identity and an email
identity are separate account methods and are not automatically linked.
Either sign-in method is optional and does not recover
encryption keys, upload local trees, authorize anonymous shares, or make local
editing depend on network access.

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

## Platform Stores and Purchases

Apple and Google process App Store and Google Play downloads, payments,
receipts, device information, and related account information under their own
privacy policies. Hamanto Studio does not receive a user's full payment-card
details from either platform.

App Store Connect and Google Play Console may provide Hamanto Studio with
aggregate sales, download, conversion, device, and performance reports. These
platform reports are separate from in-app behavioral analytics.

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

For privacy questions, email [robi@hamanto.com](mailto:robi@hamanto.com) or
contact Hamanto Studio through [Telegram](https://t.me/robihamanto). Do not
include family-tree data, private keys, credentials, or other sensitive
information in the initial message.
