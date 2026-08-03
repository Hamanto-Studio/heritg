# Public Site Deployment

HERITG intentionally keeps its public landing page, encryption announcement,
and installable web app on separate origins. The separation prevents the web
app's root-scoped service worker from answering navigation requests for the
public documentation.

| Surface | Production origin | Provider | Source |
| --- | --- | --- | --- |
| Landing page | `https://heritg.hamanto.com/en/` | GitHub Pages | `docs/`, published from `main` |
| Encryption announcement | `https://heritg-encryption.vercel.app/` | Vercel project `heritg-encryption` | `docs/encryption/en/` |
| Web app | A separate application origin | Vercel project `heritg` | `web/` build output |

## Guardrails

- Do not attach the installable web app to `heritg.hamanto.com`; its service
  worker owns root navigation on its origin.
- Landing-page encryption links must use the absolute Vercel URL, not a
  same-origin `/encryption/` path.
- The encryption page must link back to the GitHub Pages landing and privacy
  pages with absolute URLs.
- Deploy Vercel with `docs/encryption/en/` as the project root so `index.html`
  is the encryption announcement, not `docs/index.html`.
- Verify provider headers and document titles after every deployment.

## Local review

Use different ports so an existing app service worker cannot mask either page:

```sh
python3 -m http.server 4174 --bind 127.0.0.1 --directory docs
npx -y vercel@latest dev docs/encryption/en --local --listen 127.0.0.1:4175
```

- Landing: `http://127.0.0.1:4174/en/`
- Encryption: `http://127.0.0.1:4175/`

## Production verification

The landing response must report GitHub Pages and the title `HERITG | A safe
home for your family history`. The encryption response must report Vercel and
the title `How HERITG encrypts your family archive`. Both responses and the
encryption stylesheet must return HTTP 200.
