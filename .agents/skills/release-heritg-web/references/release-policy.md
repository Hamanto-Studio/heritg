# Heritg Web deployment policy

## Hosting invariants

- App `https://heritg.us`: Cloudflare Worker `heritg`.
- Staging `https://staging.heritg.us`: separate Worker and Google Cloud backend.
- Landing `https://family.heritg.us/en/`: remains GitHub Pages.
- Node 22, Wrangler 4.130.0, locked dependencies.
- Cloudflare remains authoritative DNS. App traffic is proxied, not DNS-only.
- Production API and Google client are pinned in the build/configuration.
- The edge private signing key is a Worker secret, never browser code.
- Never cache API responses, payment state, authentication or ciphertext.
- No analytics or invocation logging is enabled by the hosting migration.

## Release and recovery

Read docs/CLOUDFLARE_PRODUCTION.md. Require a clean intended commit, passing
checks, a verified candidate, identical assets at publication, canonical
verification and an exact prior Worker version for routine rollback.
The first cutover needs a verified DNS backup and explicit target approval.
Do not replace unrelated DNS, storage or Google OAuth settings.

If backend changes are needed, follow its exact-main staging qualification and
payment-service/recovery alignment. Checkout remains authenticated but has no
tester allowlist. Do not create real invoices during automated smoke tests.
Existing grants and pending orders must survive rollout and rollback.

## Optional milestone records

Web, iOS and Android use independent SemVer, one shared CHANGELOG.md and no
`v` prefix. Named releases use `release/<platform>/<version>` branches and
`<platform>-<version>` tags. Keep metadata synchronized and derive GitHub
Release notes from the exact changelog section. Routine deployments need not
create tags or GitHub Releases.
