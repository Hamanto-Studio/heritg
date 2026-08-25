# Public Site Deployment

HERITG keeps its public documentation and encryption announcement together on
the family site, while the installable web app remains on its own origin. This
prevents the web app's root-scoped service worker from answering navigation
requests for the public documentation.

| Surface | Production origin | Provider | Source |
| --- | --- | --- | --- |
| Landing page | `https://family.heritg.us/` | GitHub Pages | `docs/`, published from `main` |
| Encryption announcement | `https://family.heritg.us/blog/e2e-encryption/` | GitHub Pages | `docs/blog/e2e-encryption/`, published from `main` |
| Web app | `https://heritg.us/` | Vercel project `heritg` | `web/` build output |
| Staging Web app | `https://staging.heritg.us/` | Vercel project `heritg-staging` | `web/` build output |

## Guardrails

- Do not attach the installable web app to `family.heritg.us`; its service
  worker owns root navigation on its origin.
- Landing-page encryption links must use the same-origin
  `/blog/e2e-encryption/` path.
- Keep the encryption page's CSS and assets inside the GitHub Pages `docs/`
  tree so the route does not depend on the retired `hamanto.com` hostname.
- Verify provider headers and document titles after every deployment.
- Keep `heritg-staging` separate from the production Vercel project. Staging
  `/api/v1/*`, `/health`, and `/ready` rewrites must target only the known
  `heritg-be-stg` Cloud Run service and its isolated Firestore and Storage
  resources.
- Keep staging out of search indexes with
  `X-Robots-Tag: noindex, nofollow, noarchive`.

## Production and Staging

| Concern | Production | Staging |
| --- | --- | --- |
| Canonical origin | `https://heritg.us/` | `https://staging.heritg.us/` |
| Purpose | Durable family-tree use | Synthetic testing and release verification only |
| Data expectation | User-managed local archive | Disposable; may be reset without notice |
| App identity | `Heritg` with the neutral brown palette | `Heritg Staging` with a purple palette and persistent test-data warning |
| Vercel project | `heritg` | `heritg-staging` |
| Sharing backend | Production GCP resources | Isolated GCP project `heritg-be-stg` |
| Search indexing | Canonical application | Disabled with `X-Robots-Tag` |
| Deployment command | Production release workflow | `npm --prefix web run deploy:staging` |

The origins have separate IndexedDB databases, encryption keys, service
workers, and sharing backends. Data saved at one origin cannot be read by the
other. Never use staging as a family archive or use real family data during
verification.

## Staging Environment

`staging.heritg.us` is a persistent test origin, not a production release and
not an ephemeral Vercel preview URL. It must always display the staging title,
purple visual treatment, and test-data warning.

The same-origin `/api/v1/*` proxy covers anonymous sharing and account
routes while preserving secure host-only cookies. Direct Cloud Run URLs are
deployment inputs only and must not be compiled into browser code.

Passwordless email uses `/api/v1/auth/email/request` and
`/api/v1/auth/email/verify`; the callback is `/auth/email#token=...`. Vercel's
SPA fallback must serve that direct route, while API requests remain
network-only and uncached. Resend is called only by the backend, so do not add a
Resend browser CSP source or secret. Keep the existing Google CSP and
environment-specific client configuration while Google remains the separate
migration fallback. Email and Google identities must not be described as
automatically linked.

Email-link requests are protected by Cloudflare Turnstile. Compile only the
public widget key into Web with `HERITG_TURNSTILE_SITE_KEY`; keep the matching
secret in GCP Secret Manager and expose it to the backend through
`TURNSTILE_SECRET_NAME` and a pinned `TURNSTILE_SECRET_VERSION`. The widget must
authorize the exact deployment hostname. Never place its secret in Vercel or
browser code.

The current worker activates and claims clients immediately and excludes both
`/auth/email` and `/auth/email/` from its navigation fallback. A browser still
controlled by an older installed worker cannot receive those rules retroactively:
it must load the updated app once and reload before email links are enabled.
Treat that one-update/reload requirement as a staging migration check; do not
weaken the existing network-only `/api/v1/*` policy to work around an old worker.

The staging backend must exist before deploying staging:

- GCP project: `heritg-be-stg`
- A staging Cloud Run sharing service with its own `*.run.app` origin
- A staging Firestore database and private Cloud Storage bucket
- Storage CORS allowing exactly `https://staging.heritg.us`, including the signed
  upload/download methods and headers, and exposing `x-goog-generation`
- A staging-only Resend credential, verified sender, callback origin
  `https://staging.heritg.us/auth/email`, and short-lived verification retention
  policy; use only synthetic recipient accounts approved for staging tests

The checked-in staging policies are `web/deploy/staging-storage-cors.json` and
`web/deploy/share-lifecycle.json`.

Never point staging at the production Cloud Run service or production bucket.
Do not claim staging email delivery is ready until a real message has been
delivered, opened, scrubbed at the callback, verified once, and followed by
session restore, sign-out, and account deletion checks. These account checks do
not upload or alter the browser's local family tree.

Deploy the current worktree directly to staging from any branch:

```sh
HERITG_STAGING_API_ORIGIN=https://STAGING-SERVICE.run.app \
HERITG_GOOGLE_CLIENT_ID=1079742937646-76202p8a4fjf7hbef5cijvc003oauu3e.apps.googleusercontent.com \
HERITG_TURNSTILE_SITE_KEY=STAGING_PUBLIC_WIDGET_KEY \
npm --prefix web run deploy:staging
```

The command renders a gitignored `web/vercel.staging.json`, sets
`HERITG_DEPLOYMENT_ENV=staging` and the public staging-only Google Web client ID,
enables the account/Family+ integration for staging verification, and deploys
directly to the isolated `heritg-staging` Vercel project. The Google
client must authorize exactly `https://staging.heritg.us`; do not reuse a
production client.

The backend still fails closed unless the `heritg-be` repository variable
`STAGING_FAMILY_SYNC_ENABLED` is exactly `true`. Set it and deploy the staging
backend before testing cross-device synchronization; the Web build flag alone
does not grant read or write access.

Staging may be deployed from any branch and a dirty worktree. It does not
require approval, a commit, `main`, a release branch, tests, manual verification,
or a candidate promotion. The visible build identifier is generated as
`<short-sha>[-dirty]-<UTC timestamp>` so every staging screen can be matched to
the deployed code state. The script deploys a temporary copy of the current Web
worktree without `.git` metadata, so Vercel commit-author attribution does not
restrict staging deployment to a particular branch or author.

Vercel attributes CLI deployments to the current Git commit author. That
author email must belong to a member of the Vercel project; otherwise Vercel
marks the deployment `BLOCKED` before running the build. Resolve account
attribution before retrying rather than promoting or aliasing a blocked build.

Production release preparation, candidate verification, promotion approval,
tagging, and publication remain unchanged and must never use this staging path.

## Production Account Authentication

Production candidates are built with account authentication enabled and with
public, production-specific Google and Turnstile values. Configure the Google
Web OAuth client to authorize exactly `https://heritg.us` as a JavaScript origin.
Configure the production Turnstile widget for `heritg.us`. Keep downloaded OAuth
JSON under the ignored root `secrets/` directory; the deploy command neither
reads nor uploads that directory. OAuth secrets, the Turnstile secret, email
provider credentials, session keys, and callback signing material belong only in
the production backend's secret manager, never in Vercel or browser build values.

From a clean release worktree, create a production-targeted candidate without
assigning the production domain:

```sh
HERITG_API_ORIGIN=https://heritg-share-api-ulvjjfvqpq-et.a.run.app \
HERITG_GOOGLE_CLIENT_ID=PRODUCTION_GOOGLE_WEB_CLIENT_ID \
HERITG_TURNSTILE_SITE_KEY=PRODUCTION_PUBLIC_WIDGET_KEY \
npm --prefix web run deploy:stage
```

The guarded command accepts only the approved production API origin, rejects
the staging Google client, requires a production-shaped Google Web client ID and
a nonempty production Turnstile site key, renders `web/vercel.json`, and refuses
dirty worktrees. It uses Vercel CLI 58.4.4 with `--prod --skip-domain`, injects
the production environment and build identity, and deploys from the repository
root. Root `.vercelignore` explicitly excludes `secrets/` from that upload.

Before promotion, run the production verifier against the immutable candidate
URL. Because Google authorizes only the canonical production origin, complete
the real provider checks immediately after protected promotion without recording
tokens, email links, cookies, or proof values:

- Confirm Google sign-in opens for the production OAuth client and creates a
  session only after the nonce-bound exchange.
- Confirm Turnstile is required for the initial email request and every resend,
  and that no request retries without its proof.
- Request a link for an approved production test address, confirm the response
  does not disclose account existence, and open the delivered link once.
- Confirm `/auth/email` loads directly, the URL fragment is scrubbed, session
  restore and sign-out work, and reusing the same link fails.
- Confirm anonymous session access remains `401`, invalid email-auth input
  remains `400 invalid_request`, and no auth response is cached.

Attach `staging.heritg.us` only to Vercel project `heritg-staging`. In Cloudflare,
create a DNS-only CNAME using the exact target Vercel assigns. Inspect and
preserve any existing `staging` record before replacing it; never guess the target
or enable the Cloudflare proxy.

The repository includes a conflict-safe DNS command. Create a Cloudflare API
token restricted to `heritg.us` with `Zone:Read` and `DNS:Edit`, then store it
in macOS Keychain without writing it to the repository or shell history:

```sh
read -s "CF_TOKEN?Cloudflare API token: "
security add-generic-password -U -a "$USER" -s heritg-cloudflare-api -w "$CF_TOKEN"
unset CF_TOKEN
npm --prefix web run dns:staging
```

The command creates only the expected DNS-only staging CNAME, succeeds without
changes when that exact record already exists, and refuses to replace any
conflicting record. During the one-time beta-to-staging migration, verify the
new origin first, then remove only the exact legacy beta record with:

```sh
npm --prefix web run dns:staging:remove-beta
```

That command refuses deletion if the beta record differs from the known legacy
staging target.

## Production authentication build

Production candidates must explicitly inject the public production-only Google
Web client ID and Turnstile site key. The guarded command rejects the staging
Google client, an unexpected backend origin, and missing values, then creates a
production-targeted Vercel deployment without assigning `heritg.us`:

```sh
HERITG_API_ORIGIN=https://PRODUCTION-SERVICE.run.app \
HERITG_GOOGLE_CLIENT_ID=PRODUCTION_GOOGLE_WEB_CLIENT_ID \
HERITG_TURNSTILE_SITE_KEY=PRODUCTION_PUBLIC_WIDGET_KEY \
npm --prefix web run deploy:stage
```

The Google client must authorize exactly `https://heritg.us`. The Turnstile
widget must authorize `heritg.us` and issue action `email_login`; its secret
stays only in production GCP Secret Manager. Verify the immutable Vercel URL,
including `/auth/email`, account-route proxying, Google popup behavior, and a
controlled magic-link lifecycle before running `deploy:promote`. Never use the
staging deployment command or staging identity values for production.

## Local review

Use different ports so an existing app service worker cannot mask either page:

```sh
python3 -m http.server 4174 --bind 127.0.0.1 --directory docs
```

- Landing: `http://127.0.0.1:4174/en/`
- Encryption: `http://127.0.0.1:4174/blog/e2e-encryption/`

## Production verification

The landing response must report GitHub Pages and the title `HERITG | A safe
home for your family history`. The encryption response at
`https://family.heritg.us/blog/e2e-encryption/` must report GitHub Pages and
the title `How HERITG encrypts your family archive`. All responses and the
encryption stylesheet must return HTTP 200.
