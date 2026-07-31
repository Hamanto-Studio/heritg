# HERITG

HERITG is a private, local-first family tree app for creating, preserving, and
transferring family history. It requires no account and keeps family data on
the user's device by default.

[![Secret Scan](https://github.com/Hamanto-Studio/heritg/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/Hamanto-Studio/heritg/actions/workflows/secret-scan.yml)
[![iOS CI](https://github.com/Hamanto-Studio/heritg/actions/workflows/ios-ci.yml/badge.svg)](https://github.com/Hamanto-Studio/heritg/actions/workflows/ios-ci.yml)

## Status

- iOS: active development
- Android: planned; architecture boundary reserved in `android/`
- Web: no application planned

The native apps share product, privacy, archive, and design specifications
without sharing platform UI code.

## Repository Layout

```text
android/                    Android roadmap and future project boundary
docs/                       Shared product, data, privacy, and design documents
ios/                        Native SwiftUI application and tests
.github/                    CI, ownership, and contribution templates
PRIVACY.md                  User-facing privacy policy
SECURITY.md                 Security and secret-handling policy
CONTRIBUTING.md             Contribution workflow
```

## iOS

Requirements:

- macOS with Xcode 26.1 or later
- iOS 26.0 or later

Open `ios/Heritg.xcodeproj`, select the `HERITG` scheme, and run the app.

```sh
xcodebuild test \
  -project ios/Heritg.xcodeproj \
  -scheme HERITG \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO
```

See [`ios/README.md`](ios/README.md) for platform details.

## Android

Android implementation has not started. It will use Kotlin, Jetpack Compose,
Room, and Android platform APIs while conforming to the shared specifications.
See [`android/README.md`](android/README.md).

## Privacy

HERITG's core functionality works offline and without an account. The current
source does not include Firebase, product analytics, advertising, Sentry, or a
third-party crash-reporting SDK.

- [Privacy Policy](PRIVACY.md)
- [Data Processing Register](docs/DATA_PROCESSING.md)
- [Analytics Policy](docs/ANALYTICS.md)
- [Security Policy](SECURITY.md)

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before submitting a pull request.
Never include real family data, credentials, signing material, or production
configuration.

## Trademark

HERITG and the HERITG logo are trademarks of Hamanto Studio. The MIT License
does not grant permission to use these trademarks or imply endorsement by
Hamanto Studio.

## License

The source code is licensed under the [MIT License](LICENSE).
