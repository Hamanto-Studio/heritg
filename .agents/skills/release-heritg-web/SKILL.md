---
name: release-heritg-web
description: Prepare, stage, promote, verify, and publish independently versioned Heritg Web releases on Vercel. Use when Codex needs to update the Web version and shared changelog, create a versioned Web release branch, deploy heritg.us, verify production, create a platform release tag, publish GitHub release notes, roll back a Web deployment, or audit Web release readiness.
---

# Release Heritg Web

Release Heritg Web reproducibly without exposing family data or credentials.
Keep iOS and Android entries in the shared changelog untouched.

## Start safely

1. Read [references/release-policy.md](references/release-policy.md) completely.
2. Work from the repository root and inspect `git status`, remotes, branches,
   tags, and the current Web version.
3. Fetch `main` and tags. Never discard or overwrite existing user changes.
4. Determine whether the request is preparation, dry-run, deployment,
   verification, publication, or rollback.
5. Never use a version, release branch, or tag with a `v` prefix.

## Prepare a release

1. Move only Web bullets from `CHANGELOG.md`'s `Unreleased` section into
   `## [web-<version>] - YYYY-MM-DD`. Require a meaningful user-facing bullet.
2. Synchronize `web/package.json` and `web/package-lock.json`. The Settings UI
   reads the version from the build, so do not hardcode it separately.
3. Run:

   ```sh
   node .agents/skills/release-heritg-web/scripts/release-preflight.mjs <version> --allow-dirty --dry-run
   cd web && npm ci && npm run lint && npm test && npm run build
   ```

4. Put preparation changes through a PR to `main`. Require Web CI, Secret Scan,
   and Commit Title checks to pass.
5. Create permanent `release/web/<version>` from the verified commit. Run the
   preflight again from a clean checkout without `--allow-dirty`.

Use `--ci` only in CI. It skips branch, clean-tree, and existing-tag checks but
still validates metadata, changelog structure, workflows, and Vercel policy.

## Stage and verify

1. Confirm `npx --yes vercel@58.4.4 whoami` succeeds. If not, pause and ask the
   user to run `npx --yes vercel@58.4.4 login` locally. Never request a token in
   chat or commit `.vercel/`.
2. From the repository root, link the existing `heritg` project or create it
   only after confirming it does not exist. Use Node.js 22, `web/dist`, no
   runtime variables, and no Git integration. Use `web/vercel.json` as the
   local configuration while installing and building only the Web package.
3. Deploy a preview with the pinned CLI using
   `npx --yes vercel@58.4.4 deploy --local-config web/vercel.json`. Capture the
   resulting URL without placing credentials in logs or files.
4. Verify the preview manually at desktop, iPhone, and iPad sizes. Test fresh
   sample data only: onboarding, canvas, deep route, `.heritg` import/export,
   IndexedDB persistence, installation, and offline restart.
5. Run the production verifier against any publicly reachable candidate URL.
   Protected preview URLs may require Vercel-authenticated browser verification.

## Promote and publish

Pause for explicit user confirmation immediately before promotion. State the
candidate URL, version, commit, and canonical hostname.

After approval:

1. Promote the exact tested deployment; do not rebuild an untested commit.
2. Verify the GitHub Pages landing site and `https://heritg.us/` with:

   ```sh
   node .agents/skills/release-heritg-web/scripts/verify-production.mjs \
     https://heritg.us/ --expect-version <version>
   ```

3. Pause again before creating and pushing `web-<version>` or publishing its
   GitHub Release. Show the exact changelog notes first.
4. Create an annotated immutable tag on the promoted commit, push the permanent
   release branch and tag, and create the GitHub Release from the exact
   `CHANGELOG.md` section. Do not generate release notes from raw commits.

## Handle DNS and rollback

- Keep Cloudflare authoritative. The `heritg.us` record must use the exact DNS
  target Vercel assigns and stay DNS-only. Inspect and preserve any old value
  before a change; obtain confirmation if replacing an existing record.
- If Cloudflare access is unavailable, pause with the record type, name, target,
  and proxy mode the user must set. Never guess a target before Vercel assigns it.
- If production verification fails, stop publication. Roll back or promote the
  last known good Vercel deployment, verify the canonical URL, fix on `main`,
  and release a new patch version. Never move an existing tag.
