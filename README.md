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
  No account. No advertising. Your family tree stays on your device by default.
</p>

<p align="center">
  <a href="#features">Features</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="docs/MVP_PRODUCT_SPEC.md">Product Specification</a> |
  <a href="PRIVACY.md">Privacy</a> |
  <a href="SECURITY.md">Security</a> |
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
  <a href="https://github.com/Hamanto-Studio/heritg/actions/workflows/secret-scan.yml">
    <img alt="Secret scanning status" src="https://github.com/Hamanto-Studio/heritg/actions/workflows/secret-scan.yml/badge.svg" />
  </a>
</p>

## Features

The native iOS and Android apps support:

- Private family trees stored locally with SwiftData or Room
- People and family relationship editing
- An interactive visual family tree
- GEDCOM family-data import and export
- Cross-platform `.heritg` backup and restore
- Optional password encryption for `.heritg` archives
- Image and SVG tree export
- English and Bahasa Indonesia
- No required HERITG account, backend, advertising SDK, or network connection

Both platforms follow shared product, archive, privacy, layout, and behavior
contracts without sharing platform UI or persistence code.

The web app provides the same private, local-first family-tree workflow in a
React progressive web app. Family data is stored in IndexedDB, and the core
experience works offline after installation.

## Trust by Design

Family data is unusually sensitive, so trust claims in this repository are
backed by inspectable policies and automated checks:

| Commitment | Repository evidence |
| --- | --- |
| Private by default | [Privacy Policy](PRIVACY.md) and [Data Processing Register](docs/DATA_PROCESSING.md) |
| Offline core experience | [Product Specification](docs/MVP_PRODUCT_SPEC.md) |
| No behavioral tracking | [Analytics Policy](docs/ANALYTICS.md) |
| Portable family data | [Data and Archive Format](docs/DATA_FORMAT.md) |
| Public vulnerability process | [Security Policy](SECURITY.md) |
| Review and verification | [Manual iOS CI](.github/workflows/ios-ci.yml), local Android verification, [Web CI](.github/workflows/web-ci.yml), [secret scanning](.github/workflows/secret-scan.yml), and [CODEOWNERS](.github/CODEOWNERS) |

The current source does not include Firebase, product analytics, advertising,
Sentry, or a third-party crash-reporting SDK. Any future data collection,
network service, permission, or third-party SDK must be documented before
release.

### Encrypted Backup and Restore

When exporting a `.heritg` backup, users can optionally protect the family-data
payload with a password. HERITG encrypts and authenticates protected archives
with AES-256-GCM. The encryption key is derived from the password using
PBKDF2-HMAC-SHA256 with 600,000 iterations and a new random salt for every
archive.

During import, HERITG detects whether a `.heritg` archive is encrypted. An
encrypted archive must be unlocked with the same password before its contents
are decoded, validated, or restored. An incorrect password or modified archive
is rejected without importing partial family data.

The archive contains platform-neutral ZIP, JSON, JSONL, and media records.
Shared fixtures and cryptographic vectors verify encrypted transfers from iOS
to Android and from Android to iOS.

Password protection is optional. An unencrypted `.heritg` backup can be read by
anyone who obtains the file. HERITG does not store or recover archive passwords,
so a protected backup cannot be restored if its password is lost. This
protection applies only to `.heritg` backups; GEDCOM, PNG, and SVG exports are
not encrypted by this option.

## Project Status

| Platform | Status | Implementation |
| --- | --- | --- |
| iOS | Active development | Swift, SwiftUI, and SwiftData |
| Android | Active development | Kotlin, Jetpack Compose, and Room |
| Web | Active development | React, TypeScript, IndexedDB, and Excalidraw |

HERITG is under active development. Interfaces and archive specifications may
change before the first stable release; do not use it as the only copy of
important family records.

## Quick Start

### iOS

Requirements:

- macOS with Xcode 26.1 or later
- iOS 26.0 or later

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

Run Android tests, lint, debug builds, and a minified release build:

```sh
./android/gradlew \
  -p android \
  test assembleDebug lintDebug assembleRelease \
  --no-configuration-cache
```

See the [Android development guide](android/README.md) for project details.

### Web

Run the web app from the repository root:

```sh
cd web
npm ci
npm run dev
```

Before opening a pull request, run `npm run lint`, `npm test`, and
`npm run build` from `web/`.

## Repository Layout

```text
android/                    Native Compose application and tests
docs/                       Product, data, privacy, and design specifications
ios/                        Native SwiftUI application and tests
web/                        React progressive web application and tests
.github/                    CI, ownership, and contribution templates
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

## License and Trademark

The source code is released under the [MIT License](LICENSE).

HERITG and the HERITG logo are trademarks of Hamanto Studio. The MIT License
does not grant permission to use these trademarks or imply endorsement by
Hamanto Studio.
