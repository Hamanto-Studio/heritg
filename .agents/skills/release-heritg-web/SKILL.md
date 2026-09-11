---
name: release-heritg-web
description: Deploy, verify, or roll back Heritg Web on Cloudflare Workers at heritg.us or isolated staging. Use for Web release, hosting, DNS cutover, and production smoke checks.
---

# Deploy Heritg Web

Read [release-policy.md](references/release-policy.md) before deployment. For
production, read [CLOUDFLARE_PRODUCTION.md](../../../docs/CLOUDFLARE_PRODUCTION.md)
for the candidate, exact-asset publication, initial cutover and recovery steps.
Use Node 22 and repository-locked Wrangler 4.130.0. Existing credentials should
be reused without displaying them.

## Production

Use a clean intended commit whose lint, tests, types and production build pass.
Qualify backend changes in the separate backend repository first. Never infer
that a frontend deployment authorizes enabling payments or changing IAM.

From `web/`, build and verify an isolated candidate:

```sh
node scripts/publish-cloudflare-production.mjs candidate
```

Then publish its exact tested assets without rebuilding:

```sh
node scripts/publish-cloudflare-production.mjs publish
```

For the initial hosting migration while payments are off, follow the documented
`--payments-disabled` and `--initial-cutover` gates. Normal releases require
the canonical origin to already be on Cloudflare. Do not use Vercel Hobby for
the paid app. Routine deployment needs no repeated authorization beyond the
user's request, but initial domain migration and new credentials/resources
remain explicit scope decisions.

Verify the canonical app and landing page separately. Synthetic HTTP checks
must not create a real invoice, charge a user, or modify real family records.
A browser return is not evidence of payment. A real payment is a separate
owner-performed acceptance check.

## Staging and dry run

`npm --prefix web run deploy:staging` publishes only isolated staging.
`node web/scripts/publish-cloudflare-production.mjs candidate --dry-run`
builds and checks without remote changes. It does not enable checkout.

## Recovery

For routine production failures, publication restores the recorded Worker
version. Use `npm --prefix web run rollback:production -- EXACT_VERSION_UUID`
for a deliberate rollback and verify its result. During initial cutover use
the recorded DNS backup if the canonical app is unavailable. Never clear
IndexedDB, change the application origin, or disable backend callbacks and
payment recovery to repair a frontend deployment.

Versioned milestones may retain the shared platform changelog and independent
versions without a `v` prefix. Tags and GitHub Releases remain separate
user-authorized milestones, not an automatic consequence of deployment.
