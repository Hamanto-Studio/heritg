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
- Keep `heritg-staging` separate from production. Its `/api/v1/*`, `/health`,
  and `/ready` rewrites must target only the `heritg-be-stg` Cloud Run service.
- Keep staging out of search indexes and use only disposable synthetic data.

## Staging

Staging uses a separate Vercel project, persistent test-data branding, and the
canonical origin `https://staging.heritg.us`. The same-origin `/api/v1/*` proxy
covers anonymous sharing and account-sync routes while preserving secure
host-only cookies. Direct Cloud Run URLs are deployment inputs only and must
not be compiled into browser code.

Create a preview candidate from the repository root:

```sh
HERITG_STAGING_API_ORIGIN=https://STAGING-SERVICE.run.app npm --prefix web run deploy:staging
```

The command renders the ignored `web/vercel.staging.json`, builds with
`HERITG_DEPLOYMENT_ENV=staging`, and deploys only to `heritg-staging`. Promote
the exact candidate only after its encrypted-sharing compatibility gate passes:

```sh
npm --prefix web run deploy:staging:promote -- https://CANDIDATE.vercel.app
```

Configure the DNS-only staging CNAME with the conflict-safe command after
storing a `heritg.us`-scoped Cloudflare token in macOS Keychain under service
`heritg-cloudflare-api`:

```sh
npm --prefix web run dns:staging
```

The command is idempotent for the expected Vercel target and refuses to replace
any conflicting record.

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
