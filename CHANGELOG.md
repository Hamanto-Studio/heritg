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

## [web-0.3.0] - 2026-08-09

### Changed

- Added a guided square photo crop for person and relative profiles, with corrected circular avatar alignment.
- Improved relationship editing with photo-aware person pickers, co-parent portraits, earlier marriage-date placement, and Web-only former-partner divorce dates.
- Added a focus control that hides canvas actions, moved All People beside the zoom controls, and removed the drawing library's undo and redo buttons.
- Moved backup and chart exports into Share, made active share links copyable again, and improved password visibility, validation, and shared-link spacing.
- Displayed the current Web version at the bottom of Settings.

### Fixed

- Made person selection respond immediately on large trees by reusing family geometry and connectors, indexing kinship calculations, and moving photo processing and archive encryption out of the interaction path.

## [web-0.2.2] - 2026-08-06

### Changed

- Require a strong password of at least 8 characters when creating a new encrypted share and ask recipients for that password before opening it.
- Retired the legacy fragment-key share format; shared links now use only password-protected `HTGSHR02` envelopes.
- Migrated the public landing page to `family.heritg.us`, the web app to
  `heritg.us`, and the encryption announcement to
  `family.heritg.us/blog/e2e-encryption/`, with same-origin links and secure
  production routing.

### Security

- Derive new share encryption keys from the password with PBKDF2-HMAC-SHA-256 in the browser; passwords and keys are never sent to the sharing service.

## [web-0.2.1] - 2026-08-04

### Changed

- Kept desktop pointer selection while making one-finger canvas dragging pan naturally on phones and tablets.
- Removed the embedded drawing library and editing controls from touch layouts so Heritg's own canvas controls stay clear.

## [web-0.2.0] - 2026-08-04

### Added

- Added expiring encrypted read-only links for complete family-tree snapshots, with browser-side encryption and a recipient viewer.
- Added an explicit Save a copy action that imports a shared snapshot as an independent editable local tree.
- Added encrypted on-device management for revoking active links without retaining their secret viewing keys.

### Changed

- Added a dedicated Share action to the canvas header and updated English and Bahasa Indonesia privacy guidance for optional encrypted sharing.

### Security

- Kept share keys in URL fragments, excluded API and ciphertext traffic from service-worker caches, and routed sharing through no-store same-origin API endpoints.

## [web-0.1.0] - 2026-08-02

### Added

- Added a private, installable family-tree web application that stores family data locally in the browser.
- Added `.heritg`, HERITG JSON, and GEDCOM import with JSON, GEDCOM, PNG, and SVG export.
- Added encrypted browser storage, privacy guidance, onboarding, help, and responsive canvas controls.
- Added English and Bahasa Indonesia interfaces.

### Changed

- Published the product landing page at `heritg.hamanto.com` and the installable web application at `heritgapp.hamanto.com`.
- Matched the web family-tree relationships, life-date summaries, and branch controls more closely with the iOS experience.
- Improved family-line routing, marriage-date placement, person navigation, and mobile and tablet layouts.
- Modernized family-tree connectors with smooth corners, quieter junctions, and consistent line weight on the canvas and in image exports.
- Reduced tree clutter by showing relationship roles only while a person is selected.
- Made canvas panning available only while holding Space and dismissed open panels when interacting with the canvas.
- Added a prominent privacy-panel link to Heritg's encryption details.

### Fixed

- Positioned the empty-tree onboarding arrows beside the controls they explain on desktop and tablet layouts.

### Security

- Added production security headers, restrictive browser permissions, offline asset caching, and documented Vercel and Cloudflare infrastructure boundaries.

## [ios-1.0.0] - 2026-08-02

### Added

- Added private local family trees, people and relationship editing, interactive tree navigation, and English and Bahasa Indonesia interfaces.
- Added GEDCOM import and export, image and SVG chart export, and optional AES-256-GCM protection for `.heritg` archives.

### Security

- Kept family data in the app container by default without a HERITG account, advertising SDK, or behavioral analytics.

[web-0.1.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.1.0
[web-0.2.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.2.0
[web-0.2.1]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.2.1
[web-0.2.2]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.2.2
[web-0.3.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.3.0
[ios-1.0.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/ios-1.0.0
