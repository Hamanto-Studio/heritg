# Changelog

HERITG uses one changelog for Web, iOS, and Android. Each platform has an
independent semantic version and release history. Versions never use a `v`
prefix.

## Unreleased

### Web

- No unreleased changes yet.

### iOS

- No unreleased changes yet.

### Android

- No unreleased changes yet.

## [web-0.1.0] - 2026-08-02

### Added

- Added a private, installable family-tree web application that stores family data locally in the browser.
- Added `.heritg`, HERITG JSON, and GEDCOM import with JSON, GEDCOM, PNG, and SVG export.
- Added encrypted browser storage, privacy guidance, onboarding, help, and responsive canvas controls.
- Added English and Bahasa Indonesia interfaces.

### Changed

- Published the product landing page at `heritg.hamanto.com` and moved the installable web workspace to `heritg.hamanto.com/app`.
- Matched the web family-tree relationships, life-date summaries, and branch controls more closely with the iOS experience.
- Improved family-line routing, marriage-date placement, person navigation, and mobile and tablet layouts.

### Security

- Added production security headers, restrictive browser permissions, offline asset caching, and documented Vercel and Cloudflare infrastructure boundaries.

## [ios-1.0.0] - 2026-08-02

### Added

- Added private local family trees, people and relationship editing, interactive tree navigation, and English and Bahasa Indonesia interfaces.
- Added GEDCOM import and export, image and SVG chart export, and optional AES-256-GCM protection for `.heritg` archives.

### Security

- Kept family data in the app container by default without a HERITG account, advertising SDK, or behavioral analytics.

[web-0.1.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.1.0
[ios-1.0.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/ios-1.0.0
