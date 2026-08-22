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
  rewrites must target only isolated staging Cloud Run, Firestore, and Storage
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

The staging backend must exist before deploying staging:

- GCP project: `heritg-be-stg`
- A staging Cloud Run sharing service with its own `*.run.app` origin
- A staging Firestore database and private Cloud Storage bucket
- Storage CORS allowing exactly `https://staging.heritg.us`, including the signed
  upload/download methods and headers, and exposing `x-goog-generation`

The checked-in staging policies are `web/deploy/staging-storage-cors.json` and
`web/deploy/share-lifecycle.json`.

Never point staging at the production Cloud Run service or production bucket.

Create a preview candidate from the repository root:

```sh
HERITG_STAGING_API_ORIGIN=https://STAGING-SERVICE.run.app npm --prefix web run deploy:staging
```

The command renders a gitignored `web/vercel.staging.json`, sets
`HERITG_DEPLOYMENT_ENV=staging` for the Vite build, and creates a preview only
in Vercel project `heritg-staging`. The candidate cannot replace the current
staging deployment before verification. After responsive and synthetic-data
checks, promote the exact candidate:

Vercel attributes CLI deployments to the current Git commit author. That
author email must belong to a member of the Vercel project; otherwise Vercel
marks the deployment `BLOCKED` before running the build. Resolve account
attribution before retrying rather than promoting or aliasing a blocked build.

```sh
npm --prefix web run deploy:staging:promote -- https://CANDIDATE.vercel.app
```

Promotion runs the complete encrypted upload, activation, download, decryption,
and revocation verifier before and after assigning `staging.heritg.us`. Staging
verification skips the separate GitHub Pages landing check; production
verification continues to require it. The staging command promotes by assigning
the canonical alias to the exact tested preview; it never rebuilds that preview
under a different Vercel environment.

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
