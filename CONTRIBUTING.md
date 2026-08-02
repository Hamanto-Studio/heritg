# Contributing to HERITG

Thank you for helping improve HERITG. Contributions are accepted under the MIT
License in this repository.

## Before Starting

- Search existing issues and pull requests.
- Open an issue before a large behavioral, architectural, or data-format change.
- Keep pull requests focused on one problem.
- Never use real family data in code, tests, fixtures, screenshots, logs, or
  issue reports.

## Commit Messages

Use the intent-first format documented in [`docs/COMMITS.md`](docs/COMMITS.md):

```text
<Area>: <Imperative outcome>
```

Examples include `iOS: Preserve the viewport after selection changes` and
`Privacy: Document optional diagnostic reporting`. Do not prefix messages with
Conventional Commit types such as `fix`, `feat`, or `chore`.

Because pull requests are squash merged, the pull-request title must follow the
same format and becomes the final commit subject on `main`.

## Repository Layout

- `ios/`: SwiftUI and SwiftData application, unit tests, and UI tests
- `android/`: future Kotlin and Jetpack Compose application boundary
- `web/`: React and TypeScript progressive web application and tests
- `docs/`: specifications shared by all platforms

Platform implementations follow shared behavior and data contracts while using
platform-appropriate frameworks and conventions.

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

## Web Development

Install and validate the web application from `web/`:

```sh
npm ci
npm run lint
npm test
npm run build
```

The web application stores family data locally in IndexedDB. Do not introduce
networked storage, tracking, or production credentials without the privacy and
security review described below.

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
