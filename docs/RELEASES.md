# HERITG Release Policy

HERITG publishes Web, iOS, and Android from this repository. The platforms use
one changelog but version and ship independently.

## Naming Contract

Every release uses semantic versioning without a `v` prefix:

| Item | Format | Example |
| --- | --- | --- |
| Release branch | `release/<platform>/<version>` | `release/web/0.1.0` |
| Git tag | `<platform>-<version>` | `web-0.1.0` |
| Changelog heading | `[<platform>-<version>]` | `[web-0.1.0]` |

Release branches remain available after release. A release tag is immutable;
corrections use a new patch version.

## Shared Changelog

[`CHANGELOG.md`](../CHANGELOG.md) is the source of release notes for every
platform. Add user-facing changes to the platform subsection under
`Unreleased`. When preparing a release:

1. Move only that platform's entries into a dated release section.
2. Use `Added`, `Changed`, `Fixed`, `Security`, and `Removed` headings as needed.
3. Include at least one meaningful bullet.
4. Keep private family information, credentials, and raw diagnostic data out.
5. Build the GitHub Release body from that exact section rather than from a raw
   commit list.

## Platform Metadata

- Web: synchronize `web/package.json`, `web/package-lock.json`, and the version
  shown in the Settings panel.
- iOS: synchronize `MARKETING_VERSION`; increment `CURRENT_PROJECT_VERSION`
  independently as the build number.
- Android: synchronize `versionName`; increment `versionCode` independently
  once the Gradle project exists.

Schema and archive-format versions are data compatibility identifiers and do
not change merely because an application version changes.

## Web Release Workflow

1. Prepare the version metadata and changelog in a pull request to `main`.
2. Require Web CI, secret scanning, and commit-title validation to pass.
3. Create `release/web/<version>` from the verified commit and keep the branch.
4. Run the release preflight from a clean checkout.
5. Deploy with the pinned Vercel CLI and verify the staged deployment on
   desktop, iPhone-sized, and iPad-sized viewports.
6. Obtain explicit confirmation before promoting the tested deployment.
7. Verify the landing page at `https://heritg.hamanto.com/en/` and the application
   at `https://heritgapp.hamanto.com/`, then create `<platform>-<version>` and
   the matching GitHub Release.

The Vercel project is `heritg`. It deploys from the repository root, installs
and builds only `web/` with Node.js 22, and publishes `web/dist/`. It has no
runtime secrets. GitHub Pages continues to publish the landing source in
`docs/`. Cloudflare remains authoritative for `hamanto.com`; the existing
`heritg` CNAME stays on GitHub Pages, while the `heritgapp` CNAME is DNS-only
and points to the target assigned by Vercel.

Browser storage is tied to its origin. Localhost, Vercel preview URLs, and
`heritgapp.hamanto.com` do not share IndexedDB records or encryption keys. The
landing page and app use separate origins, and the service worker is scoped to
the app origin. Export and import a backup when intentionally moving family
data between origins.

## Recovery

- Do not move or replace a published tag.
- If production is unhealthy, use Vercel's rollback or promote the last known
  good deployment, then verify the canonical hostname again.
- Fix the problem on `main` and publish a new patch release branch and tag.
- DNS changes are a last resort and must preserve the previous value before an
  update so it can be restored.
