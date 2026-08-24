---
name: release-heritg-web
description: Deploy, verify, or roll back Heritg Web on Vercel. Use for staging and production deployments, production smoke checks, DNS, and rollback.
---

# Deploy Heritg Web

Deploy frequently while preserving exact-artifact verification and rollback.
Version bumps, changelog entries, release branches, pull requests, tags, and
GitHub Releases are optional milestones, not deployment prerequisites.

## Routine production deployment

1. Confirm staging is stable with synthetic data.
2. Work from the intended clean commit.
3. Confirm `npx --yes vercel@58.4.4 whoami` succeeds.
4. Run lint, tests, and build when they have not already passed for that commit.
5. Run:

   ```sh
   HERITG_API_ORIGIN=https://heritg-share-api-ulvjjfvqpq-et.a.run.app \
   HERITG_GOOGLE_CLIENT_ID=PRODUCTION_GOOGLE_WEB_CLIENT_ID \
   npm --prefix web run deploy:production
   ```

The command refuses a dirty worktree or unexpected production configuration,
builds a Production-targeted deployment without assigning domains, verifies the
exact deployment, promotes it without rebuilding, and verifies `heritg.us`. If
post-promotion verification fails, it automatically restores the prior Vercel
deployment.

Routine production deployment requires no separate candidate handoff,
promotion confirmation, version bump, changelog, release branch, PR, tag,
GitHub Release, or repeated manual device checklist. Interactive and responsive
acceptance belongs in staging.

## Rollback

Restore an exact known-good Production deployment:

```sh
npm --prefix web run rollback:production -- <deployment-id-or-url>
```

The command verifies the target, rolls back, confirms the canonical deployment
ID, and runs the production smoke check. Never infer rollback from a branch or
mutable alias.

## Staging

Use `npm --prefix web run deploy:staging` from any branch or dirty worktree.
Staging is isolated and may use disposable synthetic data only.

## Invariants

- Vercel project: `heritg`; CLI: exactly `58.4.4`.
- Deployment root: repository root; package: `web`; output: `web/dist`.
- Keep `web/vercel.json` attached and production Google-only configuration pinned.
- Do not add runtime secrets, server functions, analytics, or Git integration.
- Keep Cloudflare authoritative and DNS-only.
- Never use real family data in deployment verification.
