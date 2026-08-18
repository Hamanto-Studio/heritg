# HERITG iOS Release Process

This runbook covers the complete HERITG iOS release lifecycle: version and
changelog preparation, build verification, TestFlight qualification, App Store
submission, production release, and post-release monitoring.

Run every command in this document from `ios/` unless a command explicitly says
otherwise.

## Project Details

- Project: `Heritg.xcodeproj`
- Scheme: `HERITG`
- Bundle ID: `tech.robihamanto.heritg.ios`
- App Store Connect app ID: `6796645792`
- Internal TestFlight group ID: `0327bcc6-e745-4b2f-8b06-aa8787f3d0ca`
- Apple Developer team: `CKURCPC7GF`
- Deployment target: iOS 16.0
- Signing: Automatic
- Required Xcode: 26.1 or later
- Current marketing version: `1.0.1`
- Current build number: `13`
- Storage: local Core Data store in the app container
- Portable data: encrypted `.heritg` archives, GEDCOM, PNG, and SVG
- Localizations: English and Indonesian
- Dependencies: no external packages, backend, or HERITG account

## Release Sources Of Truth

The repository-wide policy in [`../docs/RELEASES.md`](../docs/RELEASES.md) and
the shared [`../CHANGELOG.md`](../CHANGELOG.md) apply to every iOS release.

| Item | Required format | Example |
| --- | --- | --- |
| Release branch | `release/ios/<version>` | `release/ios/1.0.1` |
| Git tag | `ios-<version>` | `ios-1.0.1` |
| Changelog heading | `[ios-<version>]` | `[ios-1.0.1]` |

Versions use semantic versioning without a `v` prefix. Release branches remain
available after release. Tags are immutable; a correction requires a new patch
version and build.

### Beta Contract

For HERITG, an iOS beta means distribution only through the internal TestFlight
group `Internal Testers`. Keep `MARKETING_VERSION` unchanged for iterations of
the same open candidate, increment `CURRENT_PROJECT_VERSION` to a number greater
than every previous upload, and leave changes under `Unreleased > iOS` in
`CHANGELOG.md`. If that marketing version is already released on the App Store,
increment it before uploading because App Store Connect closes the released
pre-release train. A beta does not create a production release branch, tag, App
Store version submission, or GitHub Release.

For a beta export, add `testFlightInternalTestingOnly = true` to the export
options and use `destination = export` so the internal-only IPA can be uploaded
with `asc builds upload`. After processing reaches `VALID`, assign the exact
build to group `0327bcc6-e745-4b2f-8b06-aa8787f3d0ca` with `asc builds
add-groups`. Do not use `--submit`; that option is for external Beta App Review.

## Prerequisites

- Use Xcode 26.1 or later with the required iOS simulator runtimes.
- Sign in to the authorized Apple Developer account in Xcode, or obtain an App
  Store Connect API key with the minimum required upload access.
- Confirm a valid Apple Distribution certificate and automatic provisioning for
  team `CKURCPC7GF`.
- The App Store Connect app record is confirmed as app ID `6796645792` for
  `tech.robihamanto.heritg.ios`.
- Release owner TODO: confirm App Store Connect role access, agreements, legal
  and trader status, and any tax or banking requirements that apply.
- Have at least one physical device running the minimum supported iOS 16 release
  for TestFlight qualification.
- Have representative, non-sensitive GEDCOM and `.heritg` fixtures available for
  import and export checks.

Check local signing identities:

```sh
security find-identity -v -p codesigning
```

## 1. Prepare The Release

Set the intended version and a build number that has never been uploaded for
that marketing version:

```sh
VERSION='1.0.1'
: "${BUILD_NUMBER:?set BUILD_NUMBER to a greater unused integer}"
```

Create the release branch from the verified source commit:

```sh
git switch main
git pull --ff-only
git switch -c "release/ios/${VERSION}"
```

Update both HERITG application build configurations in
`Heritg.xcodeproj/project.pbxproj`:

- `MARKETING_VERSION`: public semantic version, such as `1.0.1`.
- `CURRENT_PROJECT_VERSION`: monotonically increasing build number, such as the
  next unused number after the current build `13`.

Do not change archive schema or format versions merely because the application
version changes. Those are independent compatibility identifiers.

In `../CHANGELOG.md`:

1. Move only the shipped iOS entries from `Unreleased > iOS` into a dated
   `## [ios-<version>] - YYYY-MM-DD` section.
2. Use only the applicable `Added`, `Changed`, `Fixed`, `Security`, and `Removed`
   headings.
3. Include at least one meaningful user-facing bullet.
4. Add or update the reference link for `ios-<version>`.
5. Keep family information, credentials, and raw diagnostics out of the notes.

Build App Store notes and the eventual GitHub Release body from that exact iOS
changelog section, not from a raw commit list.

Confirm the effective Release settings:

```sh
xcodebuild \
  -project Heritg.xcodeproj \
  -scheme HERITG \
  -configuration Release \
  -showBuildSettings
```

Verify at least:

- `MARKETING_VERSION` equals `$VERSION`.
- `CURRENT_PROJECT_VERSION` equals `$BUILD_NUMBER`.
- `PRODUCT_BUNDLE_IDENTIFIER` is `tech.robihamanto.heritg.ios`.
- `DEVELOPMENT_TEAM` is `CKURCPC7GF`.
- `IPHONEOS_DEPLOYMENT_TARGET` is `16.0`.
- `CODE_SIGN_STYLE` is `Automatic`.

Record the candidate as `MARKETING_VERSION (CURRENT_PROJECT_VERSION)`, for
example `1.0.1 (14)` only after confirming that build number is unused.

## 2. Verify The Build

List available simulators and select a stable device UDID:

```sh
xcrun simctl list devices available
```

Run the complete shared-scheme simulator suite. The `HERITG` scheme includes
both `HERITGTests` and `HERITGUITests`:

```sh
xcodebuild \
  -project Heritg.xcodeproj \
  -scheme HERITG \
  -destination 'platform=iOS Simulator,id=<SIMULATOR_UDID>' \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Check the complete release diff and whitespace errors:

```sh
git status --short
git diff --check
git diff -- Heritg.xcodeproj/project.pbxproj ../CHANGELOG.md
```

Review all release-branch changes, not only version files. Do not release a
confirmed regression. Isolate any suspected flaky test, record the evidence,
and rerun it before making a go/no-go decision.

## 3. Authenticate App Store Connect

Use either an authorized account under Xcode Settings > Accounts or an App
Store Connect API key. Keep the API key ID, issuer ID, and private `.p8` file
outside the repository.

Append these flags to archive or export commands when API-key authentication is
required:

```sh
-allowProvisioningUpdates \
-authenticationKeyPath '/secure/path/AuthKey_KEYID.p8' \
-authenticationKeyID 'KEYID' \
-authenticationKeyIssuerID 'ISSUER_ID'
```

Never commit the key or credentials. Release owner TODO: confirm the authorized
App Store Connect account or API-key owner and role.

## 4. Create The Archive

Keep generated artifacts outside the repository:

```sh
VERSION='1.0.1'
: "${BUILD_NUMBER:?set BUILD_NUMBER to the verified candidate build}"
ARCHIVE_PATH="/tmp/Heritg-${VERSION}-${BUILD_NUMBER}.xcarchive"
```

Create the signed Release archive:

```sh
xcodebuild \
  -project Heritg.xcodeproj \
  -scheme HERITG \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  archive
```

The command must finish with `ARCHIVE SUCCEEDED`. In Xcode Organizer, verify the
archive identity, version, build, team, bundle ID, entitlements, and signing
certificate before upload. If source changes after archiving, discard the
candidate, increment the build number, and repeat verification and archiving.

## 5. Export And Upload

Create `/tmp/Heritg-ExportOptions.plist` with this content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>destination</key>
    <string>upload</string>
    <key>method</key>
    <string>app-store-connect</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>teamID</key>
    <string>CKURCPC7GF</string>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
```

Export and upload the existing archive:

```sh
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "/tmp/Heritg-${VERSION}-${BUILD_NUMBER}-upload" \
  -exportOptionsPlist '/tmp/Heritg-ExportOptions.plist' \
  -allowProvisioningUpdates
```

Append the API-key flags from step 3 when needed. Because the export destination
is `upload`, this operation performs distribution signing and sends the build to
App Store Connect. Preserve the exact archive until the release is complete.

## 6. Qualify The Build In TestFlight

After upload:

1. Open the confirmed HERITG app record in App Store Connect.
2. Open TestFlight and verify the expected version and build.
3. Wait for Apple processing to finish.
4. Resolve all metadata, compliance, or processing warnings.
5. Add the build to the intended internal testing group.
6. Complete Beta App Review information before external distribution.
7. Add English and Indonesian `What to Test` notes derived from the changelog.

Release owner TODO: provide the feedback email and Beta App Review contact
details. No reviewer credentials are needed because HERITG has no login.

### TestFlight Exit Criteria

Qualify the exact uploaded build, not a local Debug build. Do not promote it
until every applicable check passes:

- Install, first launch, upgrade, relaunch, and local persistence work.
- Install the 1.0.0 SwiftData build, create synthetic trees with people,
  relationships, dates, notes, and photos, then upgrade in place and verify the
  same records open from the migrated Core Data store.
- A real device on the minimum supported iOS 16 release can create, edit,
  navigate, and delete a family tree without a network connection.
- English and Indonesian switching updates the full interface correctly.
- Core Data persists multiple trees, people, dates, notes, photos, and
  relationships across termination and relaunch.
- Export a `.heritg` archive without a user password and restore it into a clean
  app state; compare tree names, people, relationships, dates, notes, and photos.
- Export a password-protected `.heritg` archive and restore it with the correct
  password; verify that a wrong password fails without importing partial data.
- Import a representative archive from the previous production version and
  confirm compatibility before shipping an update.
- Import representative GEDCOM data, inspect people and relationships, export
  GEDCOM again, and open the output with an independent compatible reader.
- Export PNG and SVG from small and large representative trees, then inspect
  readability, completeness, language, dates, relationships, and image bounds.
- Share-sheet cancellation and file-provider failure leave local data intact.
- VoiceOver, larger text, light and dark appearance, and reduced motion have no
  release-blocking issue.
- No family names, relationships, dates, photos, notes, imported files, archive
  passwords, or exported content appear in logs or diagnostics.
- TestFlight feedback is triaged and every release blocker is closed.
- The release owner records approval of the exact version and build.

Use synthetic family information in test fixtures and screenshots. Never use a
real family's private data for release qualification.

## 7. Prepare The App Store Product Page

TestFlight does not publish a build. Create or open the App Store version whose
version matches `MARKETING_VERSION`, then select the same processed build that
passed the exit criteria. Do not create another archive when that binary is
unchanged.

### Product Metadata

| Item | Value |
| --- | --- |
| App name | `HERITG` |
| Bundle ID | `tech.robihamanto.heritg.ios` |
| Privacy policy URL | `https://family.heritg.us/privacy/` |
| Marketing URL | `https://family.heritg.us/` |
| Support URL | `https://t.me/robihamanto` |
| App Store Connect app | `6796645792` (confirmed) |
| SKU | `TODO: release-owner confirmation; do not invent or replace an existing immutable value` |
| Primary language | `TODO: release-owner decision` |
| Category | `TODO: release-owner decision` |
| Price | `TODO: release-owner decision` |
| Countries and regions | `TODO: release-owner decision` |
| App Review contact | `TODO: release-owner name, phone, and email` |
| Copyright | `TODO: release-owner year and legal owner` |

Also complete the current age-rating questionnaire, content-rights declaration,
platform availability choices, and regional/trader requirements. These are
release-owner decisions; do not copy assumptions from another application.

Confirm current App Store Connect length and localization requirements before
submission. Do not use unsupported claims, rankings, competitor names, stale
features, or placeholder values.

### Draft English Listing

Review every line against the submitted build before use.

**Name:** `HERITG`

**Subtitle:** `Private family trees`

**Promotional Text:** `Create and preserve your family tree privately with local storage and portable family-data and chart exports.`

**Keywords:** `family tree,genealogy,ancestry,heritage,GEDCOM,offline,archive`

**Description**

```text
HERITG is a private, local-first family tree app for creating and preserving family history.

Create family trees, add people and relationships, and navigate your family visually. Your family data is stored locally on your device with Core Data, and the core experience works without an account or backend.

FEATURES
- Create and manage multiple family trees
- Add and edit people and family relationships
- Navigate an interactive family tree
- Import and export GEDCOM family data
- Export family-tree charts as PNG and SVG
- Create encrypted portable .heritg archives for backup and restore
- Use the app in English or Indonesian

PRIVATE BY DEFAULT
Family information stays in the app container unless you deliberately export it through the system share interface. HERITG does not require a HERITG account.

Exported family data can be sensitive. Protect archive passwords and share files only with people and services you trust.
```

**What's New**

Use a concise localized rendering of the exact `[ios-<version>]` changelog
section. For the initial shipped feature set only, the copy may be:

```text
- Create and navigate private family trees stored on your device.
- Import and export GEDCOM family data.
- Export charts as PNG and SVG, or preserve your data in an encrypted .heritg archive.
- Use HERITG in English or Indonesian.
```

### Draft Indonesian Listing

Review every line against the submitted build before use.

**Name:** `HERITG`

**Subtitle:** `Silsilah keluarga privat`

**Promotional Text:** `Buat dan lestarikan silsilah keluarga secara privat dengan penyimpanan lokal serta ekspor data dan bagan yang portabel.`

**Keywords:** `silsilah,keluarga,genealogi,leluhur,warisan,GEDCOM,offline,arsip`

**Description**

```text
HERITG adalah aplikasi silsilah keluarga yang privat dan mengutamakan penyimpanan lokal untuk membuat serta melestarikan riwayat keluarga.

Buat silsilah keluarga, tambahkan orang dan hubungan, lalu jelajahi keluarga Anda secara visual. Data keluarga disimpan secara lokal di perangkat dengan Core Data, dan fitur utama dapat digunakan tanpa akun atau backend.

FITUR
- Buat dan kelola beberapa silsilah keluarga
- Tambah dan edit orang serta hubungan keluarga
- Jelajahi silsilah keluarga interaktif
- Impor dan ekspor data keluarga GEDCOM
- Ekspor bagan silsilah sebagai PNG dan SVG
- Buat arsip .heritg portabel yang terenkripsi untuk pencadangan dan pemulihan
- Gunakan aplikasi dalam bahasa Inggris atau Indonesia

PRIVAT SEJAK AWAL
Informasi keluarga tetap berada di dalam kontainer aplikasi kecuali Anda sengaja mengekspornya melalui antarmuka berbagi sistem. HERITG tidak memerlukan akun HERITG.

Data keluarga yang diekspor dapat bersifat sensitif. Lindungi kata sandi arsip dan hanya bagikan file kepada orang serta layanan yang Anda percaya.
```

**Yang Baru**

Gunakan versi lokal yang ringkas dari bagian changelog `[ios-<version>]` yang
sama. Hanya untuk kumpulan fitur rilis awal, teksnya dapat berupa:

```text
- Buat dan jelajahi silsilah keluarga privat yang tersimpan di perangkat Anda.
- Impor dan ekspor data keluarga GEDCOM.
- Ekspor bagan sebagai PNG dan SVG, atau simpan data dalam arsip .heritg terenkripsi.
- Gunakan HERITG dalam bahasa Inggris atau Indonesia.
```

Verify all three public URLs over HTTPS on a mobile device without
authentication. Do not submit while a URL is unavailable or its content does
not match the production application.

## 8. Prepare Screenshots

HERITG has a Fastlane screenshot lane and snapshot configuration for English
and Indonesian. Run the existing automation from `ios/`:

```sh
bundle exec fastlane ios screenshots
```

No `Gemfile` is committed. The checkout cannot install or pin Ruby tooling by
itself; compatible Ruby dependencies, Bundler, and Fastlane must already be
installed locally, with a local Bundler context available for `bundle exec`.
Record the versions used. Do not add release-only dependency files or generated
screenshots to the repository unless separately reviewed and requested.

The current lane captures the family tree, all-people view, and person details
on configured simulators. Review the generated files under
`fastlane/screenshots/` before upload.

Screenshot requirements:

- Confirm Apple's current required iPhone display sizes and accepted formats.
- Use only the exact submitted UI and synthetic family data.
- Verify both English and Indonesian text, clipping, status bars, and ordering.
- Keep the first screenshots focused on creating and navigating a family tree.
- Do not expose real names, dates, photos, relationships, files, or passwords.
- Do not imply sync, collaboration, hosted backup, or any unshipped capability.
- Keep captions consistent with the approved product-page wording.
- Confirm the App Store icon meets Apple's current size and transparency rules.

Release owner TODO: confirm whether any manually composed captions, additional
device sets, or optional app previews are required.

## 9. Privacy, Compliance, And Encryption

Audit the production binary, not only the intended design. Reconcile App Store
answers with [`../PRIVACY.md`](../PRIVACY.md),
[`../docs/DATA_PROCESSING.md`](../docs/DATA_PROCESSING.md), the app's imports,
and the final dependency and entitlement list.

The current iOS implementation stores family content locally in Core Data,
processes imports on-device, exports only after user action, has no HERITG
account or backend, and has no external package dependencies. Revalidate all of
those facts for the release candidate before selecting any App Privacy answer.

At minimum, verify:

- App Privacy accurately covers local family content, user-selected files,
  system sharing, Apple distribution, and any diagnostics Apple provides.
- No new SDK, network endpoint, entitlement, background mode, analytics,
  diagnostics, account, sync, or purchase behavior was added without updating
  public documentation and disclosures.
- Family content and exported files never enter application logs or test
  attachments retained for distribution.
- The privacy policy and support contact remain public and accurate.
- Age rating, content rights, and regional compliance answers are current.

### Export Encryption Review

`INFOPLIST_KEY_ITSAppUsesNonExemptEncryption` is currently `NO`. Do not treat
that value as a final legal conclusion. HERITG encrypts portable `.heritg`
archives, so the release owner must obtain the appropriate legal/export
compliance determination and revalidate both the build setting and App Store
Connect answers for every release.

Confirm the actual cryptography, distribution regions, Apple's current
questions, and any required documentation before upload or submission. If the
determination changes, update the binary metadata and App Store Connect answer,
increment the build number, rebuild, and requalify the new archive. Release
owner TODO: record who approved the encryption classification and when.

## 10. Prepare App Review Information

Provide a reachable review contact. No login or test credentials are required.

Suggested review notes:

```text
HERITG is a local-first family tree application. It does not require a login, account, subscription, or backend connection. Family trees are stored locally in the app container with Core Data.

To review the primary experience:
1. Launch HERITG and create a family tree.
2. Add people and family relationships.
3. Navigate the visual tree and edit person or relationship information.
4. Open Export to create GEDCOM, PNG, SVG, or an encrypted .heritg archive through the iOS share interface.
5. Open a supported GEDCOM or .heritg file with HERITG to test import and restore.

The .heritg format is a portable encrypted archive for user-directed backup and restore. A user may protect an archive with a password. Imports and exports are processed on-device; the user chooses any external destination through Apple's system interface.

No reviewer login or credentials are required. Synthetic family information may be used for all review steps.
```

If the reviewed import flow needs a fixture, provide a synthetic file through an
approved App Review attachment or accessible HTTPS URL and document its format
and password. Never provide real family information or reuse a personal archive.

## 11. Promote TestFlight To Production

Use the exact TestFlight-qualified build unless code or compliance metadata in
the binary changed. There is no need to upload the same binary again.

1. Open the App Store version matching `MARKETING_VERSION`.
2. Complete English and Indonesian metadata from shipped features only.
3. Upload and arrange the reviewed localized screenshots.
4. Select the exact processed build that passed TestFlight qualification.
5. Complete export compliance and App Privacy answers.
6. Complete age rating, content rights, pricing, availability, and regional
   requirements using release-owner decisions.
7. Enter the App Review contact and the no-login, local-data review notes.
8. Remove every placeholder and resolve every warning.
9. Choose a release option.
10. Add the version for review and submit it to App Review.

TestFlight approval and production App Review are separate. Approval for one
does not guarantee approval for the other.

### Release Options

- **Manual release:** preferred for an initial or coordinated launch; release
  only after a final go/no-go check.
- **Automatic release:** Apple releases after approval and processing.
- **Automatic no earlier than a date:** Apple releases after approval at or
  after the configured date; propagation timing still varies.
- **Phased release:** consider for updates when Apple offers it; users may still
  update manually, and the rollout can be paused if a severe issue appears.

Release owner TODO: select and record the release option and, for updates,
whether phased release is enabled.

## 12. Release And Record

Before production release, confirm the approved version/build, URLs, metadata,
screenshots, support coverage, compliance decisions, and release owner. Confirm
that no TestFlight blocker remains.

For manual release, select `Release This Version` only after the go/no-go check.
Do not announce availability until the public App Store product page installs
the expected version in a confirmed region.

After production availability is verified, create the immutable source record
from the exact commit used for the archive:

```sh
git status --short
git tag -a "ios-${VERSION}" -m "Heritg iOS ${VERSION}"
git push origin "release/ios/${VERSION}"
git push origin "ios-${VERSION}"
```

Publish a GitHub Release titled `Heritg iOS <version>` from the immutable tag.
Use the exact `[ios-<version>]` changelog section as its body, then verify the
published tag and release URL. Do not move or replace a published tag.

Release owner TODO: confirm who may push the release branch/tag and publish the
GitHub Release.

## 13. Monitor After Release

Monitor closely for at least the first 24 hours and through any phased release:

- App Store Connect status, availability, downloads, and update adoption
- Xcode Organizer crashes, hangs, launch performance, and energy regressions
- App Store ratings, reviews, Telegram support, and TestFlight follow-up
- Reports of Core Data loss, upgrade failures, or unexpected local resets
- `.heritg` and GEDCOM import failures or compatibility regressions
- Incorrect, incomplete, or unreadable PNG and SVG exports
- English and Indonesian localization issues

HERITG has no in-app backend or external diagnostics dependency to use as a
kill switch or telemetry source. Use Apple-provided aggregate reports and
privacy-safe support reproduction. Never request a user's real family archive
unless strictly necessary, explicitly consented to, and handled under an
approved secure process.

## 14. Rollback And Hotfix

The App Store cannot roll installed users back to an older binary.

If a severe issue appears:

1. Pause a phased release immediately, if active.
2. Remove the version from sale only if preventing new installs outweighs the
   disruption; this does not remove it from existing devices.
3. Publish a privacy-safe support notice and workaround when one exists.
4. Prepare a hotfix with a new `CURRENT_PROJECT_VERSION` and, when appropriate,
   a new patch `MARKETING_VERSION`.
5. Use a new `release/ios/<version>` branch and `[ios-<version>]` changelog
   section when the marketing version changes.
6. Repeat tests, archive import compatibility, TestFlight qualification,
   compliance review, and production submission.
7. Request expedited review only when Apple's criteria are met and the impact
   can be stated accurately.

Never reuse an uploaded build number or retag an older commit.

## Production Checklist

- [ ] Release owner and go/no-go approver recorded
- [ ] Release branch, versions, build number, and `[ios-<version>]` changelog confirmed
- [ ] Release settings, complete test suite, diff, and `git diff --check` passed
- [ ] Signed archive reviewed and uploaded build finished processing
- [ ] Exact candidate passed TestFlight and real-device minimum-iOS qualification
- [ ] Passwordless and password-protected `.heritg` round trips passed
- [ ] Previous-production `.heritg` compatibility passed
- [ ] GEDCOM import/export and PNG/SVG export checks passed
- [ ] English/Indonesian UI, metadata, screenshots, and public URLs reviewed
- [ ] App Privacy answers audited against the production binary
- [ ] Encryption classification and `ITSAppUsesNonExemptEncryption` revalidated
- [ ] Age rating, content rights, agreements, and regional duties completed
- [ ] SKU, category, price, regions, contacts, and copyright confirmed by owner
- [ ] App Review notes state no login and explain local import/export behavior
- [ ] Correct build and release/phased-release options selected
- [ ] Production approval and public installation of the expected version verified
- [ ] `ios-<version>` tag and GitHub Release published and verified
- [ ] Monitoring and support ownership active

## Troubleshooting

- **Authentication failure:** Sign in to the correct Xcode account or append
  valid API-key flags. Retry export/upload with the existing valid archive.
- **Build number already used:** Increment `CURRENT_PROJECT_VERSION`, rerun
  tests, archive, and upload. An uploaded build cannot be replaced.
- **Signing failure:** Confirm team `CKURCPC7GF`, the bundle ID, distribution
  certificate, automatic signing, capabilities, and authentication.

For a test failure, rerun the failing test in isolation:

```sh
xcodebuild \
  -project Heritg.xcodeproj \
  -scheme HERITG \
  -destination 'platform=iOS Simulator,id=<SIMULATOR_UDID>' \
  CODE_SIGNING_ALLOWED=NO \
  -only-testing:HERITGTests/<TestClass>/<testMethod> \
  test
```

Use `HERITGUITests/<TestClass>/<testMethod>` for a UI test. Document genuine
flakiness; never waive a failure caused by release changes.

- **Screenshot failure:** Confirm local Ruby, Bundler, Fastlane, Bundler context,
  and simulator names in `fastlane/Snapfile`; no committed `Gemfile` provisions
  these tools.
- **Unclear export compliance:** Stop submission and obtain a current legal
  determination. Update binary metadata and App Store Connect answers as needed,
  then rebuild with a new build number if the binary changed.

## Security

- Never commit App Store Connect keys, `.p8` files, passwords, app-specific
  passwords, certificates, provisioning profiles, or exported credentials.
- Keep archives, export plists, uploaded artifacts, fixtures, and review
  attachments outside the repository unless explicitly approved.
- Use synthetic family data for tests, screenshots, and App Review fixtures.
- Never print archive passwords or family content in terminal, CI, test, or
  support logs.
- Treat GEDCOM, `.heritg`, PNG, and SVG files as sensitive user data.
- Verify release commits and tags contain no generated private data or secrets.
