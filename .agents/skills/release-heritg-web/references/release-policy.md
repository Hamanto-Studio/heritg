# Heritg Web Release Reference

## Release identity

- Version: strict SemVer such as `0.1.0`; never `v0.1.0`.
- Permanent branch: `release/web/<version>`.
- Immutable annotated tag: `web-<version>`.
- Changelog heading: `## [web-<version>] - YYYY-MM-DD`.
- GitHub Release title: `Heritg Web <version>`.
- Landing URL: `https://family.heritg.us`.
- Canonical app URL: `https://heritg.us/`.
- Vercel project: `heritg`.
- Vercel CLI: exactly `58.4.4`.
- Deployment root: repository root; build package: `web/`; Node.js `22.x`;
  output: `web/dist/`; local Vercel config: `web/vercel.json`.

Web, iOS, and Android versions are independent. Do not change iOS
`MARKETING_VERSION`, iOS `CURRENT_PROJECT_VERSION`, Android `versionName`, or
Android `versionCode` during a Web-only release.

## Changelog contract

`CHANGELOG.md` is shared by all platforms. Preserve the other platforms'
`Unreleased` bullets and historical sections byte-for-byte unless the user asks
for a cross-platform documentation correction.

A Web release section must contain at least one non-placeholder bullet under
one or more of `Added`, `Changed`, `Fixed`, `Security`, or `Removed`. Release
notes must describe user-visible outcomes. They must not include family names,
screenshots containing real people, credentials, internal tokens, or raw logs.

The GitHub Release body is the content beneath the matching Web heading up to
the next level-two heading. A released section must not be rewritten after its
tag is published; corrections go into a new patch release.

## Required checks

Before preview deployment:

- Repository is clean and current with the intended release commit.
- Branch is exactly `release/web/<version>`.
- The version does not already have a local or remote tag.
- `npm ci`, lint, tests, build, release metadata validation, secret scan, and
  commit-title policy pass.
- No `.env`, `.vercel`, token, family archive, or private fixture is staged.

Before production promotion:

- Candidate deployment points to the exact release commit.
- Desktop, iPhone, and iPad smoke tests pass with synthetic data.
- Landing-page availability, app SPA navigation, PWA manifest, service worker,
  installation, offline restart,
  local persistence, import, and export work.
- Security headers and immutable hashed-asset caching are present.
- The candidate passes the complete synthetic `HTGSHR02` lifecycle through
  its own `/api/v1` rewrite: allocation, production-origin Storage CORS,
  encrypted upload, activation, download, local decryption, and revocation.
- The user explicitly approves promotion.

Before publication:

- The canonical hostname passes the production verifier.
- The user explicitly approves the exact tag and release notes.
- Tag target equals the promoted commit.

After every production promotion:

- Publish exactly one GitHub Release for the deployed Web version.
- Use `web-<version>` for both the immutable tag and release target.
- Use `Heritg Web <version>` as the release title.
- Copy the release body from the exact matching `CHANGELOG.md` section.
- Verify the release URL and tag target before declaring deployment complete.
- If GitHub is temporarily unavailable, leave the release task explicitly
  incomplete and retry publication without rebuilding or redeploying Vercel.

## Vercel and Cloudflare

Use Vercel Hobby only for personal/non-commercial hosting. Do not add analytics,
runtime secrets, server functions, or Git integration. Generated deployment
URLs should use Vercel's standard Deployment Protection when the account tier
supports it.

Keep Cloudflare as authoritative DNS. Preserve `family.heritg.us` for the
GitHub Pages landing site. Configure `heritg.us` as a
DNS-only CNAME to the value Vercel returns for that domain. Do not enable the
Cloudflare proxy in front of Vercel. Inspect the current record and save its
identifier, content, TTL, and proxy state before changing it.

The application uses local encrypted IndexedDB. The landing page and app use
separate origins, and the service worker is scoped to the app origin. Browser
data and encryption keys are origin-specific; localhost, preview URLs, the
landing site, and the canonical app hostname cannot read one another's records.
Never use real family data for deployment verification.

## Confirmation and recovery

External read-only checks do not need a release confirmation. Require explicit
confirmation before:

1. Replacing an existing DNS record.
2. Promoting a deployment to production.
3. Creating or pushing the release tag.
4. Publishing the GitHub Release.

Approval to publish the tag and GitHub Release may be requested as one gate,
but publication is mandatory for every version that reaches production.

If a preview fails, fix and create a new preview. If production fails, promote
the last known good deployment or use Vercel rollback, verify the canonical
hostname, then prepare a new patch release. Never force-push a public release
branch, delete a published release to hide a failure, or move a tag.
