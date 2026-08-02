# HERITG Privacy Policy

Effective date: August 2, 2026

HERITG is developed by Hamanto Studio. It is designed to let people create and
preserve family trees without creating an account or sending family information
to Hamanto Studio.

This policy describes the official HERITG application represented by this
repository. A modified or redistributed build may behave differently and is the
responsibility of its distributor.

## Summary

- No HERITG account, email address, or sign-up is required.
- Family-tree data is stored locally on the user's device.
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

Hamanto Studio does not operate an account system or server that receives this
family data in the current version. Deleting a person, tree, or the application
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

## Network Access

The current app does not require network access for its core family-tree
features. Opening an external support link or using an Apple-provided service
may contact that service under its own terms.

Opening the web app downloads its public HTML, JavaScript, styles, fonts, and
images from the configured hosting origin. Standard request metadata may be
processed by that host under its terms. A service worker may cache those public
assets in browser Cache Storage for offline use. HERITG does not send family-tree
content from IndexedDB to the hosting origin.

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
