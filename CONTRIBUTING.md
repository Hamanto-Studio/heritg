# Contributing to HERITG

Thank you for helping improve HERITG. Contributions are accepted under the MIT
License in this repository.

## Before Starting

- Search existing issues and pull requests.
- Open an issue before a large behavioral, architectural, or data-format change.
- Keep pull requests focused on one problem.
- Never use real family data in code, tests, fixtures, screenshots, logs, or
  issue reports.

## Repository Layout

- `ios/`: SwiftUI and SwiftData application, unit tests, and UI tests
- `android/`: future Kotlin and Jetpack Compose application boundary
- `docs/`: specifications shared by all platforms

Platform implementations follow shared behavior and data contracts while using
native frameworks and platform conventions.

## iOS Development

Open `ios/Heritg.xcodeproj` with Xcode 26.1 or later. Before opening a pull
request, run:

```sh
xcodebuild test \
  -project ios/Heritg.xcodeproj \
  -scheme HERITG \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO
```

Update English and Bahasa Indonesia resources when changing user-visible text.
Include before-and-after screenshots for visible UI changes.

## Android Development

Android has not started. Coordinate foundational Gradle, package, persistence,
and archive-format decisions in an issue before creating the project. Future
Android code belongs under `android/` and must conform to the shared documents.

## Privacy and Security

- Do not commit `.env` files, production Firebase configuration, service-account
  files, signing keys, provisioning profiles, keystores, exports, or user data.
- Do not send family-tree content to analytics, diagnostics, logs, or errors.
- Update `PRIVACY.md`, `docs/DATA_PROCESSING.md`, and `docs/ANALYTICS.md` with
  any data collection, network, SDK, or permission change.
- Run `pre-commit run --all-files` when pre-commit is installed.
- Report vulnerabilities privately through GitHub Security Advisories.

Every pull request is scanned by Gitleaks. Ignore rules are only a safety net;
review the complete staged diff before committing.
