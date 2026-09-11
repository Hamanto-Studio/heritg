# Cloudflare production release

App: `https://heritg.us`. Landing page: `https://family.heritg.us/en/`.
Cloudflare account and zone stay the existing HERITG account. Worker `heritg`
serves the app; never point the landing hostname at this Worker. Node 22 and
Wrangler 4.130.0 are pinned through the repository lockfile.

The ordinary web deployment now uses the commands below, not Vercel Hobby.
Vercel files remain as reviewed migration/rollback references; do not run the
old Vercel promotion commands for a paid production release.

## Checks before a first migration

- Use a clean, reviewed commit with a synchronized Web version and changelog.
- Pass lint, application tests, Cloudflare type checks and production dry run.
- Deploy a qualified backend with the edge public key and purchases disabled.
  The backend repository documents the coordinated public-payment rollout.
- Store the matching private Ed25519 PKCS8 key only as the Worker secret
  `EDGE_CLIENT_IP_PRIVATE_KEY`, independent from staging. Never print it, place
  it in GitHub artifacts, or commit it. Initial provisioning may use Wrangler's
  `--secrets-file` with an owner-only ephemeral JSON file outside the repo;
  remove that exact temporary file after both Workers have received it.
- Record the existing apex DNS target, TTL and proxy state, plus the Vercel
  production deployment. The prior apex target was
  `baecbcdd70d8894c.vercel-dns-017.com` (DNS-only, automatic TTL); confirm it
  immediately before cutover. Preserve every other DNS record.

## Build and test the candidate

From `web/` using Node 22:

```
npm ci
npm run lint
npm test
npm run cloudflare:types
npm run cloudflare:check
node scripts/publish-cloudflare-production.mjs candidate --dry-run
node scripts/publish-cloudflare-production.mjs candidate --payments-disabled
```

For initial provisioning only, pass the protected secret file through environment
variable `HERITG_EDGE_SECRETS_FILE`. This path is not a credential value. The
candidate has no custom domain and is at
`https://heritg-production-candidate.heritg.workers.dev`.

HTTP checks verify exact built HTML, CSP and other headers, deep links, public
asset caching, service-worker/manifest revalidation, authentication denial and
an encrypted synthetic share lifecycle with cleanup. They create no invoice.
Review desktop and narrow layouts. Google sign-in must be tested on the
canonical origin, not authorized on a new preview hostname.

## Publish

For the initial migration only, remove the exact old apex CNAME after recording
it, then explicitly confirm `HERITG_INITIAL_CUTOVER_CONFIRM=heritg.us` and run:

```
node scripts/publish-cloudflare-production.mjs publish --initial-cutover --payments-disabled
```

The script attaches only `heritg.us`, reuses the tested assets without rebuilding,
verifies the canonical app, and disables the candidate URL. Verify Google
sign-in, existing local data, offline startup and the landing page separately.
Only after these checks should the backend enable real public checkout.

For subsequent paid releases, omit `--payments-disabled` and
`--initial-cutover`. Candidate then publish are separate review stages. A normal
publish records the previous Worker version and rolls it back on failure.

## Rollback and recovery

Do not delete or reset IndexedDB or browser storage. During initial migration,
if Cloudflare verification fails, restore the recorded apex CNAME/proxy/TTL and
verify the previous app before enabling purchases. For later releases, restore
the exact previous Cloudflare Worker version with Wrangler rollback and verify
the deployed version, auth and live plan catalog. Never roll payment databases,
invoice terms or secrets back. Keep payment callbacks and scheduled recovery
running even when public checkout is disabled.

The unchanged origin preserves local data. A preview/local origin has separate
browser storage. No analytics is enabled by this release. Cloudflare processes
request metadata and proxies API traffic; updated privacy notices disclose this.
