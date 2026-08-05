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

## Guardrails

- Do not attach the installable web app to `family.heritg.us`; its service
  worker owns root navigation on its origin.
- Landing-page encryption links must use the same-origin
  `/blog/e2e-encryption/` path.
- Keep the encryption page's CSS and assets inside the GitHub Pages `docs/`
  tree so the route does not depend on the retired `hamanto.com` hostname.
- Verify provider headers and document titles after every deployment.

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
