# Heritg Web deployment policy

## Routine deployment

Production deployment is an operational action, not a marketing release. Once
staging is stable, one command stages, verifies, promotes, and re-verifies the
exact Vercel artifact. A failed post-promotion check restores the previous
deployment automatically.

Required:

- intended clean commit;
- stable staging behavior with synthetic data;
- pinned production API origin and Google Web client;
- Vercel CLI `58.4.4` and project `heritg`;
- Production-targeted deployment created with `--prod --skip-domain`;
- expected routing and security configuration;
- automated encrypted-sharing and account readiness smoke before promotion;
- canonical-origin smoke after promotion;
- previous deployment captured for automatic rollback.

Not required for routine deployment:

- semantic version change;
- changelog entry;
- release branch or pull request;
- tag or GitHub Release;
- separate candidate approval;
- repeated desktop, iPhone, and iPad acceptance after staging already passed.

## Hosting invariants

- Deployment root is the repository root; Web build output is `web/dist`.
- Node.js is `22.x`; `web/vercel.json` remains the local configuration.
- No runtime variables, secrets, server functions, analytics, or Git integration.
- Cloudflare remains authoritative and DNS-only.
- The app and landing site remain separate origins.
- Never use real family data for staging or production smoke tests.

## Optional milestone releases

Product milestones may still update SemVer, `CHANGELOG.md`, tags, and GitHub
Releases. Those records are useful communication tools but never block shipping
a stable deployment.
