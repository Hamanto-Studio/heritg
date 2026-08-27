# HERITG Shipping Policy

HERITG Web, iOS, and Android ship independently. A production deployment is an
operational action; a versioned release is an optional product milestone.

## Routine Web Shipping

Once staging is stable, ship from the intended clean commit with:

```sh
HERITG_API_ORIGIN=https://heritg-share-api-ulvjjfvqpq-et.a.run.app \
HERITG_GOOGLE_CLIENT_ID=PRODUCTION_GOOGLE_WEB_CLIENT_ID \
npm --prefix web run deploy:production
```

The command creates a Production-targeted Vercel artifact without assigning the
domain, verifies that exact artifact, promotes it without rebuilding, verifies
`https://heritg.us/`, and restores the prior deployment automatically on a failed
post-promotion check.

Routine shipping does not require version metadata, changelog entries, release
branches, pull requests, tags, GitHub Releases, candidate approvals, or repeated
manual device acceptance after staging passes.

## Rollback

```sh
npm --prefix web run rollback:production -- <deployment-id-or-url>
```

Rollback accepts only an exact ready Production deployment, verifies the
canonical deployment ID after restoration, and runs production smoke checks.

## Optional Milestone Releases

When a named product milestone benefits from durable release notes, use semantic
versions without a `v` prefix:

| Item | Format | Example |
| --- | --- | --- |
| Release branch | `release/<platform>/<version>` | `release/web/0.7.0` |
| Git tag | `<platform>-<version>` | `web-0.7.0` |
| Changelog heading | `[<platform>-<version>]` | `[web-0.7.0]` |

Keep platform metadata synchronized and derive GitHub notes from `CHANGELOG.md`.
Tags are immutable; corrections use a new patch version. These records document
a milestone but do not authorize or block deployment.

Schema and archive-format versions remain compatibility identifiers and do not
change merely because an application version changes.

## Hosting Invariants

The Vercel project is `heritg`. It deploys from the repository root with Node.js
22 and publishes `web/dist/`. It has no runtime secrets. GitHub Pages publishes
the landing site under `family.heritg.us`. Cloudflare remains authoritative and
DNS-only. Browser storage and keys remain origin-bound; use export/import when
intentionally moving family data between origins.
