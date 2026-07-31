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

The current iOS app supports:

- Private family trees stored locally with SwiftData
- People and family relationship editing
- An interactive visual family tree
- GEDCOM family-data import and export
- Image and SVG tree export
- English and Bahasa Indonesia
- No required HERITG account, backend, advertising SDK, or network connection

Android is planned as a native Kotlin and Jetpack Compose app. Both platforms
will follow shared product, archive, privacy, and design specifications without
sharing platform UI code.

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
| Reviewed, tested changes | [iOS CI](.github/workflows/ios-ci.yml), [secret scanning](.github/workflows/secret-scan.yml), and [CODEOWNERS](.github/CODEOWNERS) |

The current source does not include Firebase, product analytics, advertising,
Sentry, or a third-party crash-reporting SDK. Any future data collection,
network service, permission, or third-party SDK must be documented before
release.

## Project Status

| Platform | Status | Implementation |
| --- | --- | --- |
| iOS | Active development | Swift, SwiftUI, and SwiftData |
| Android | Planned | Kotlin, Jetpack Compose, and Room |
| Web | Not planned | No web application or hosted family database |

HERITG is under active development. Interfaces and archive specifications may
change before the first stable release; do not use it as the only copy of
important family records.

## Quick Start

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

## Repository Layout

```text
android/                    Android roadmap and future project boundary
docs/                       Product, data, privacy, and design specifications
ios/                        Native SwiftUI application and tests
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
