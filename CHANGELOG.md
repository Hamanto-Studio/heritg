# Changelog

HERITG uses one changelog for Web, iOS, and Android. Each platform has an
independent semantic version and release history. Versions never use a `v`
prefix.

## Unreleased

### Web

- Added an isolated, search-hidden staging environment with distinctive purple
  branding and a persistent warning that it is for disposable test data only.
- Improved sibling generation placement and kept child connector rails a
  consistent distance from person cards.

### iOS

- Migrated local family storage to Core Data while preserving the private,
  account-free app experience.
- Improved family-tree relationship lines with obstacle-aware routing, rounded
  corners, junctions, and crossing bridges while retaining native canvas
  gestures and controls.
- Improved archive, relationship, photo, and export compatibility coverage.
- Added automatic and manually editable child-order badges to the canvas and
  PNG/SVG exports, including backward-compatible archive and Core Data
  migration support.
- Matched the latest Web generation grouping, descendant-branch shifting,
  40-point child stems, and square short-terminal connector corners.

### Android

- Refreshed the internal testing build for the current offline family-tree,
  encrypted archive, GEDCOM, and chart-export compatibility checks.

## [web-0.6.2] - 2026-08-18

### Fixed

- Kept married and unmarried child connectors equally clear of family rails and
  preserved straight terminal stems in the canvas and chart exports.

## [web-0.6.1] - 2026-08-18

### Added

- Added independent family-focused copies that preserve spouses, marriage links,
  and shared children while omitting unrelated spouse-side branches.
- Added Indonesian, Yogyakarta Javanese, and East Java Javanese relationship
  terminology choices for family trees and people lists.
- Added privacy-conscious bug reports through WhatsApp or Telegram with
  transparent browser and device diagnostics.

### Changed

- Added editable child order, local domicile suggestions, wrapped long names,
  and persistent person details at every canvas zoom level.
- Improved family-copy reviews with clear included and omitted people before a
  new independent tree is created.

### Fixed

- Improved sibling alignment, spouse adjacency, descendant branch spacing, and
  family centering in large multi-generation trees.
- Prevented production releases from losing API routing and security headers
  while switching verified deployments to the public app.

### Security

- Ensured family-focused copies physically omit unrelated profiles and
  relationships from subsequent exports and encrypted share links.

## [web-0.5.0] - 2026-08-17

### Added

- Added automatic birth-order badges, gender-aware avatars, and accessible labels across the family canvas and chart exports.
- Added live progress feedback for tree preparation and save, share, and language operations, plus clear password-requirement checklists.

### Changed

- Moved family-tree layout and connector preparation into a background worker so switching large trees no longer blocks interaction.
- Made it clearer that a tree can start with any family member, renamed self-relative labels to “Selected person,” and focused the relationship picker on the most common roles.
- Expanded GEDCOM portability for partner subtypes and biological, adoptive, foster, guardian, step, and sibling relationships.

### Fixed

- Improved complex layouts with multiple spouses, shared co-parents, uneven ancestry, merged branches, and shallow sibling branches.
- Removed redundant sibling connectors and prevented repeated save, link-creation, and system-share actions.
- Improved mobile GEDCOM filename compatibility, relationship avatar fallbacks, and profile-image handling in chart exports.

### Security

- Required uppercase, lowercase, numeric, and special characters in new encrypted-share and password-protected backup passwords.
- Kept inferred birth order private when birth dates are excluded from chart exports and validated embedded image data before rendering it.

## [web-0.4.1] - 2026-08-16

### Fixed

- Restored `.ged`, `.gedcom`, and `.heritg` file selection and import on iPhone and iPad.

## [web-0.4.0] - 2026-08-15

### Changed

- Replaced the embedded drawing engine with a lightweight native family-tree canvas for smoother navigation on large trees and a substantially smaller offline installation.

## [web-0.3.1] - 2026-08-10

### Changed

- Added direct marriage-date editing from partner rows, moved relationship dates above role choices, and added controls for excluding birth dates, relationship dates, photos, or ages from encrypted shares.
- Applied the same privacy choices to GEDCOM, PNG, and SVG exports, and increased large-family PNG resolution with a memory-bounded HD renderer.

### Fixed

- Preserved Vercel API and security routing during production promotion and made a complete encrypted-share lifecycle test mandatory before promotion.

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
[web-0.4.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.4.0
[web-0.4.1]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.4.1
[web-0.5.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.5.0
[web-0.6.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/web-0.6.0
[ios-1.0.0]: https://github.com/Hamanto-Studio/heritg/releases/tag/ios-1.0.0
