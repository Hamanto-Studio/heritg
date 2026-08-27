<p align="center">
  <img
    src="ios/Heritg/Assets.xcassets/AppIcon.appiconset/Heritg-AppIcon.png"
    alt="HERITG app icon"
    width="128"
  />
</p>

<h1 align="center">HERITG</h1>

<p align="center">
  <strong>A private, local-first home for your family history.</strong><br />
  No account required. No advertising. Your family tree stays on your device by default.
</p>

<p align="center">
  <a href="#platform-report">Platform Report</a> |
  <a href="#features">Features</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="docs/MVP_PRODUCT_SPEC.md">Draft Product Specification</a> |
  <a href="PRIVACY.md">Privacy</a> |
  <a href="SECURITY.md">Security</a> |
  <a href="CHANGELOG.md">Changelog</a> |
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="LICENSE">
    <img alt="HERITG is released under the MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  </a>
  <a href="CONTRIBUTING.md">
    <img alt="Pull requests are welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" />
  </a>
  <a href="https://github.com/Hamanto-Studio/heritg/actions/workflows/ios-ci.yml">
    <img alt="iOS build and test status" src="https://github.com/Hamanto-Studio/heritg/actions/workflows/ios-ci.yml/badge.svg" />
  </a>
  <a href="https://github.com/Hamanto-Studio/heritg/actions/workflows/android-ci.yml">
    <img alt="Android build and test status" src="https://github.com/Hamanto-Studio/heritg/actions/workflows/android-ci.yml/badge.svg" />
  </a>
  <a href="https://github.com/Hamanto-Studio/heritg/actions/workflows/web-ci.yml">
    <img alt="Web build and test status" src="https://github.com/Hamanto-Studio/heritg/actions/workflows/web-ci.yml/badge.svg" />
  </a>
  <a href="https://github.com/Hamanto-Studio/heritg/actions/workflows/secret-scan.yml">
    <img alt="Secret scanning status" src="https://github.com/Hamanto-Studio/heritg/actions/workflows/secret-scan.yml/badge.svg" />
  </a>
</p>

## Platform Report

This repository contains three local-first clients:

| Platform | What is included | Local storage | Verification |
| --- | --- | --- | --- |
| iOS | Native SwiftUI app in [`ios/`](ios) | Core Data | Unit and UI tests run in [iOS CI](.github/workflows/ios-ci.yml) |
| Android | Native Kotlin and Jetpack Compose app in [`android/`](android) | Room and DataStore | Unit tests, lint, and debug builds run in [Android CI](.github/workflows/android-ci.yml); instrumentation and release checks run locally |
| Web | Installable React progressive web app in [`web/`](web) | AES-GCM-encrypted IndexedDB | Release checks, lint, tests, and production builds run in [Web CI](.github/workflows/web-ci.yml) |

The repository also contains shared archive, privacy, analytics, security,
data-processing, and design contracts. The linked product specification is a
draft target and includes planned behavior that may not be implemented yet.

## Features

The native iOS and Android apps support:

- Private family trees stored locally with Core Data or Room
- People and family relationship editing
- An interactive visual family tree
- GEDCOM family-data import and GEDCOM 7 export
- Cross-platform `.heritg` backup and restore
- Always-encrypted `.heritg` archives with an optional password
- PNG and SVG tree export
- English and Bahasa Indonesia
- No required HERITG account, backend, advertising SDK, or network connection

Both platforms follow shared product, archive, privacy, layout, and behavior
contracts without sharing platform UI or persistence code.

GEDCOM is intended for genealogy-data portability, not as a lossless HERITG
backup. It may omit photos, detailed addresses, date precision, or unsupported
relationship extensions. Use `.heritg` to preserve the complete supported
family record.

The web app provides the same private, local-first family-tree workflow in a
React progressive web app. Family records are AES-256-GCM-encrypted in IndexedDB
with a non-extractable, origin-scoped browser key. After a successful production
load caches the application shell, editing local trees works offline; initial
loading, updates, and encrypted sharing require a network connection.

Web users may explicitly create password-protected encrypted snapshots that
expire after 7, 30, or 90 days. Encryption happens in the browser, and the
sharing service receives family data only as ciphertext. The URL contains a
share identifier, not an encryption key. Viewing is read-only, but a recipient
may explicitly save an independent editable copy in their browser.

Web users may also optionally create or access a Heritg account with Google.
The account service verifies a nonce-bound Google identity proof and returns a
secure session with the verified display name and email. Signing in does not
upload, back up, unlock, or synchronize the local family-tree database.

Web imports `.heritg`, legacy HERITG JSON, and GEDCOM files. It exports complete
`.heritg` backups, GEDCOM, PNG, and SVG.

## Trust by Design

Family data is unusually sensitive, so trust claims in this repository are
backed by inspectable policies and automated checks:

| Commitment | Repository evidence |
| --- | --- |
| Private by default | [Privacy Policy](PRIVACY.md) and [Data Processing Register](docs/DATA_PROCESSING.md) |
| Offline core experience | [Draft Product Specification](docs/MVP_PRODUCT_SPEC.md) |
| No behavioral tracking | [Analytics Policy](docs/ANALYTICS.md) |
| Portable family data | [Data and Archive Format](docs/DATA_FORMAT.md) |
| Separate public origins | [Public Site Deployment](docs/DEPLOYMENT.md) |
| Public vulnerability process | [Security Policy](SECURITY.md) |
| Review and verification | [iOS CI](.github/workflows/ios-ci.yml), [Android CI](.github/workflows/android-ci.yml), [Web CI](.github/workflows/web-ci.yml), [secret scanning](.github/workflows/secret-scan.yml), [security audit](docs/SECURITY_AUDIT.md), and [CODEOWNERS](.github/CODEOWNERS) |

The current applications do not integrate Firebase, product analytics,
advertising, Sentry, or a third-party crash-reporting SDK. Any future data
collection, network service, permission, or third-party SDK must be documented
before release.

### Encrypted Backup and Restore

When exporting a `.heritg` backup, users can optionally protect the family-data
payload with a password. HERITG encrypts and authenticates protected archives
with AES-256-GCM. The encryption key is derived from the password using
PBKDF2-HMAC-SHA256 with 600,000 iterations and a new random salt for every
archive. The exact, versioned envelope and portable ZIP payload are public in
the [data-format specification](docs/DATA_FORMAT.md).

During import, HERITG detects whether a `.heritg` archive is encrypted. An
encrypted archive must be unlocked with the same password before its contents
are decoded, validated, or restored. An incorrect password or modified archive
is rejected without importing partial family data.

The archive contains platform-neutral ZIP, JSON, JSONL, and media records.
Shared fixtures and cryptographic vectors verify encrypted transfers from iOS
to Android and from Android to iOS.

Every `.heritg` backup created by the current user-facing export flows uses the
authenticated encrypted envelope. The password is optional: an empty password
restores without a prompt but does not keep the file secret from someone who
obtains it. A non-empty password must contain at least 8 NFC Unicode code points,
including an uppercase letter, a lowercase letter, a decimal digit, and a
punctuation or symbol character. A longer unique password is safer. HERITG does
not store or recover archive
passwords, so a protected backup cannot be restored if its password is lost.
This protection applies only to `.heritg` backups; GEDCOM, PNG, and SVG exports
remain readable files.

## Project Status

| Platform | Status | Implementation |
| --- | --- | --- |
| iOS | Active development | Swift, SwiftUI, and Core Data |
| Android | Active development | Kotlin, Jetpack Compose, Room, and DataStore |
| Web | Active development | React, TypeScript, encrypted IndexedDB, and a native SVG canvas |

Each client versions and ships independently. HERITG remains under active
development, and interfaces or archive specifications may change; do not use it
as the only copy of important family records.

## Quick Start

### iOS

Requirements:

- macOS with Xcode 26.1 or later
- iOS 16.0 or later

Clone the repository, open `ios/Heritg.xcodeproj`, select the shared `HERITG`
scheme, and run the app in an iOS Simulator or on a connected device. No backend
account or external package installation is required.

Run the complete test suite from the repository root:

```sh
xcodebuild test \
  -project ios/Heritg.xcodeproj \
  -scheme HERITG \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO
```

See the [iOS development guide](ios/README.md) for project details.

### Android

Requirements:

- Java 17
- Android SDK 37
- Android 8.0 / API 26 or later

Run Android tests, lint checks, debug builds, the instrumentation-test build,
and a minified release build:

```sh
./android/gradlew \
  -p android \
  test assembleDebug lintDebug assembleDebugAndroidTest assembleRelease \
  --no-configuration-cache
```

The command builds, but does not run, the instrumentation tests. Run them on a
connected device or running emulator:

```sh
./android/gradlew \
  -p android \
  connectedDebugAndroidTest \
  --no-configuration-cache
```

See the [Android development guide](android/README.md) for architecture and test
details.

### Web

Requirements:

- Node.js 22.x and npm

The production app is at [heritg.us](https://heritg.us/), and the project site
is at [family.heritg.us](https://family.heritg.us/).

Run the web app from the repository root:

```sh
cd web
npm ci
npm run dev
```

For local debugging with an AI or other development tool, explicitly enable a
plaintext snapshot of the active Web family:

```sh
HERITG_DEBUG_CONTEXT=1 npm run dev
```

While that development server and the normal app route are open, the latest
active tree is written to `web/.heritg-debug-context.json`. The gitignored file
includes people, notes, addresses, selection, counts, and readable relationship
endpoints. Photo contents and inactive trees are omitted. Stop the server and
delete the file when it is no longer needed; never share or commit its contents.

Read the snapshot from another terminal with the local Web CLI:

```sh
cd web
npm run context
npm run context -- people
npm run context -- relationships --person selected
npm run context -- selected --json
npm run context -- context
```

The default `summary` command reports the active tree, selected person, people
count, and relationship counts by kind. Add `--json` to `summary`, `people`,
`relationships`, or `selected` for machine-readable output. Use `--file <path>`
to inspect a different snapshot. Every CLI command is read-only; the explicitly
enabled development server is what writes the snapshot. The CLI performs no
filesystem writes, network requests, or application-data mutations. See the
[Web Context CLI reference](docs/WEB_CONTEXT_CLI.md) for the complete command,
data-flow, privacy, and troubleshooting documentation.

Browser storage is isolated by origin, so localhost, preview deployments, and
production do not share trees or encryption keys. Export and import a backup to
move a tree between origins. The development server has no local sharing-service
proxy; run `HERITG_SHARING_ENABLED=false npm run dev` when testing without the
production sharing backend. Email delivery also requires the matching backend
environment to enable separately reviewed provider configuration; passwordless
email is disabled in the current Web release. Legacy `/auth/email` links are
scrubbed without attempting authentication.

Before shipping, run `npm run lint`, `npm test`, and `npm run build` from
`web/`. Once staging is stable, `npm --prefix web run deploy:production` stages,
verifies, promotes, and re-verifies the exact deployment with automatic rollback.
Versioned changelog and tag releases are optional product milestones.

## Repository Layout

```text
android/                    Native Compose application and tests
docs/                       Product, data, privacy, and design specifications
ios/                        Native SwiftUI application and tests
web/                        React progressive web application and tests
.github/                    CI, ownership, and contribution templates
CHANGELOG.md                Shared Web, iOS, and Android release notes
PRIVACY.md                  User-facing privacy policy
SECURITY.md                 Vulnerability and secret-handling policy
CONTRIBUTING.md             Contribution workflow
```

## Contributing

- Found a bug or missing behavior? [Open an issue](https://github.com/Hamanto-Studio/heritg/issues/new/choose).
- Want to contribute? Read the [contribution guide](CONTRIBUTING.md) before opening a pull request.
- Found a vulnerability? Follow the private reporting process in the [security policy](SECURITY.md).

Never include real family data, credentials, signing material, or production
configuration in an issue, commit, screenshot, test, or pull request. Commit
and pull-request titles follow the intent-first
[commit message guide](docs/COMMITS.md).

Web, iOS, and Android releases are independently versioned without a `v`
prefix and documented together in the [changelog](CHANGELOG.md).

## License and Trademark

The source code is released under the [MIT License](LICENSE).

HERITG and the HERITG logo are trademarks of Hamanto Studio. The MIT License
does not grant permission to use these trademarks or imply endorsement by
Hamanto Studio.
