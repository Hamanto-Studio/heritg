# HERITG Encrypted Sharing Implementation Plan

Status: Backend and Web POC implementation. This document does not authorize project creation, billing attachment, Terraform apply, public deployment, or production promotion.

## Objective

Add anonymous, immutable, read-only encrypted share links without weakening HERITG's local-first editing model.

- `https://heritg.hamanto.com` remains the landing page.
- `https://heritgapp.hamanto.com` remains the Web application and share-link origin.
- Vercel continues serving the Web application and `/s/<shareId>` viewer.
- Google Cloud runs the API and private ciphertext storage in Jakarta.
- Local editing, import, export, and IndexedDB remain available without an account or network connection.

The first POC is Web-only at the UI level. iOS and Android receive the same protocol fixtures for later interoperability work, but their sharing interfaces are explicitly deferred.

## Scope

Included:

- Anonymous capability links.
- One immutable encrypted snapshot per link.
- Browser-side encryption and decryption.
- Read-only recipient viewer.
- Default 30-day and maximum 90-day expiry.
- Early revocation with a separate deletion capability.
- Maximum 32 MiB encrypted envelope.
- Automated cleanup of abandoned, expired, and revoked data.

Excluded:

- Accounts, login, recovery, or identity profiles.
- Billing, RevenueCat integration, or paid entitlements.
- 5 GB storage promises.
- Live sync, collaboration, editing, comments, or history.
- Password-derived encryption or password-protected links.
- Server-side family-tree parsing, search, or rendering.
- iOS and Android sharing UI in the POC.

RevenueCat remains a possible future entitlement layer only after accounts and paid Pro access are designed.

## Repositories and prerequisite

- Client, canonical archive, landing page, and viewer: [`Hamanto-Studio/heritg`](https://github.com/Hamanto-Studio/heritg).
- Private API and infrastructure: [`Hamanto-Studio/heritg-be`](https://github.com/Hamanto-Studio/heritg-be).
- PR #26 is the prerequisite canonical 32 MiB cross-platform `.heritg` archive implementation.
- This PR records the client architecture and protocol contract; backend implementation belongs in `heritg-be`.

Do not commit credentials, signed URLs, fragment keys, raw deletion tokens, real family data, Terraform state, account identifiers, or private absolute paths to either repository.

## Architecture

```text
Cloudflare authoritative DNS (DNS-only)
        |
        +-- heritg.hamanto.com       Landing page
        |
        +-- heritgapp.hamanto.com    Vercel Web app
                    |
                    +-- /s/<shareId>#k=<key>  SPA viewer
                    +-- /api/v1/*            Vercel rewrite
                                                   |
                                             Cloud Run API
                                           asia-southeast2
                                              /          \
                                      Firestore      Cloud Storage
                                      metadata       ciphertext only
```

Artifact Registry, Secret Manager, Scheduler, and the cleanup Cloud Run job also run in `asia-southeast2`. Cloudflare stays authoritative and DNS-only; no initial DNS change is required.

Vercel serves static code globally. Privacy disclosures must accurately describe Vercel static hosting, Cloudflare DNS, Google Cloud processing, observable metadata, and the limits of client-side encryption.

## Public URLs

```text
https://heritg.hamanto.com/
https://heritgapp.hamanto.com/
https://heritgapp.hamanto.com/s/<SHARE_ID>#k=<BASE64URL_KEY>
https://heritgapp.hamanto.com/api/v1/<ENDPOINT>
```

The key exists only after `#k=`. URL fragments do not enter HTTP requests. The client must also keep the complete link out of analytics, logs, referrers, crash reports, service-worker caches, and clipboard telemetry.

## HTGSHR01 protocol

- Share ID: 16 random bytes, unpadded base64url (22 characters).
- Encryption key: 32 random bytes, unpadded base64url (43 characters).
- Deletion token: 32 random bytes; the server stores only its SHA-256 hash.
- Cipher: AES-256-GCM.
- Nonce: 12 fresh random bytes per share.
- Authentication tag: 16 bytes.
- Plaintext: canonical unencrypted `.heritg` ZIP from PR #26.
- Authenticated data: `ASCII("HTGSHR01") || 0x00 || ASCII(shareId)`.
- Envelope bytes: `ASCII("HTGSHR01") || nonce || ciphertext-and-tag`.
- Maximum complete envelope: 33,554,432 bytes.

The sharing envelope is separate from the password-based `HTGENC01` archive envelope. The Web, iOS, and Android implementations must consume one frozen synthetic fixture. Do not claim audited end-to-end encryption before independent cryptographic and penetration reviews.

## Corrected upload sequence

The server must allocate the share ID before encryption because the share ID is authenticated data.

1. Export the canonical unencrypted `.heritg` ZIP.
2. Calculate encrypted size as archive length plus the 36-byte HTGSHR01 overhead.
3. Request allocation with envelope version, exact ciphertext size, and expiry.
4. Receive the allocated share ID, one-time deletion token, signed upload URL, and required headers.
5. Generate the 256-bit key and 96-bit nonce in the browser.
6. Encrypt locally using the allocated share ID in authenticated data.
7. Upload the exact envelope with the required content type, signed metadata, and `x-goog-if-generation-match: 0`.
8. Complete using the share ID, deletion token, and returned object generation.
9. Construct `/s/<shareId>#k=<key>` locally. The key never enters an API request.

## Public API

```text
POST /api/v1/share-uploads
POST /api/v1/share-uploads/complete
POST /api/v1/share-downloads
POST /api/v1/share-revocations
GET  /healthz
GET  /readyz
```

### Allocate

Input: envelope version, exact ciphertext size, and expiry. Output: share ID, deletion token, signed upload URL, required headers, upload expiry, and share expiry.

### Complete

Input: share ID, deletion token, and object generation. Activation succeeds only when object generation, exact size, content type, signed envelope metadata, and immutable generation-zero creation all match the allocation. Completion is one-time and replay-safe.

### Download

Input: share ID. Output: a short-lived signed download URL and non-sensitive envelope metadata only when the share is active and unexpired.

### Revoke

Input: share ID and deletion token. Revocation becomes authoritative before object deletion. Retries are idempotent; scheduled cleanup retries failed deletion.

Every API response uses `Cache-Control: no-store`. JSON schemas reject unknown fields, malformed identifiers, oversized bodies, invalid transitions, and replays. Application logs exclude request and response bodies, IDs, tokens, signed URLs, object locators, and keys.

## Lifecycle

```text
allocated -> active -> revoked -> deleted
                    -> expired -> deleted
allocated ----------> expired -> deleted
```

Upload grants are short-lived. Abandoned allocations expire automatically. Active shares expire at the selected date. Revocation and cleanup are safe under concurrent retries.

## Data and storage

Firestore stores only opaque identifiers and locators, status, exact ciphertext size, envelope version, lifecycle timestamps, generation, and the deletion-token hash.

It does not store names, relationships, dates, notes, media metadata, archive manifests, plaintext, encryption keys, raw deletion tokens, or complete share URLs.

The payload bucket must have:

- Regional location `ASIA-SOUTHEAST2`.
- Public-access prevention.
- Uniform bucket-level access.
- No public IAM member.
- Generation-zero upload preconditions.
- CORS restricted to `https://heritgapp.hamanto.com` for required upload/download methods and headers.
- Lifecycle cleanup after the maximum retention safety margin.
- No payload-state sharing with Terraform state.

Jakarta availability has been confirmed for Cloud Run, Firestore Native mode, and regional Cloud Storage. Location is still an explicit irreversible apply gate.

## Web implementation

- Add a Vercel rewrite for `/api/v1/*` to the approved Cloud Run URL before the SPA fallback.
- Keep `/s/*` as an SPA deep link.
- Export the selected tree without a password envelope, then wrap it in HTGSHR01.
- Keep the encryption key in memory and the fragment only.
- Authenticate the complete envelope before parsing the ZIP.
- Reuse PR #26 archive size, ZIP-path, schema, record-count, media, and checksum validation.
- Render the recipient tree in a separate read-only state; do not import it into IndexedDB automatically.
- Prevent API responses and ciphertext from entering the service-worker cache.
- Preserve existing offline editing, import, export, and local data.
- Clearly warn that anyone with the complete link can read and redistribute the snapshot.

The landing page must mark every hosted Pro feature as **Coming soon** until accounts, entitlements, storage quotas, and production operations exist.

## Security controls

- CSP with self-hosted application code and `frame-ancestors 'none'`.
- HSTS, `Referrer-Policy: no-referrer`, `nosniff`, restrictive Permissions Policy, COOP, and CORP.
- No analytics, ads, tag managers, or remote JavaScript in the viewer.
- HMAC-pseudonymized per-operation rate limits with material stored in Secret Manager.
- No secret bytes in Terraform state.
- Private GitHub Actions authentication through Workload Identity Federation, never service-account JSON keys.
- Dependency lock, secret scan, OpenAPI tests, protocol tests, Terraform validation, IaC lint, and container scan.
- Conservative Cloud Run CPU, memory, concurrency, timeout, and maximum instances.

## Tooling and stable commands

The private backend pins Node 22 and Terraform through `mise`. It uses `gh`, `gcloud`, `gitleaks`, `tflint`, `trivy`, `jq`, and `shellcheck`.

```text
make doctor
make test
make infra-plan ENV=poc
make infra-apply ENV=poc
make deploy-poc
make smoke BASE_URL=https://...
make rollback REVISION=...
```

Vercel remains pinned through the existing `npx vercel@58.4.4` workflow in this repository. Firebase CLI, Wrangler, Docker, Stripe CLI, and RevenueCat tooling are unnecessary for this POC.

## Delivery gates

1. Merge PR #26 and freeze the canonical archive fixture.
2. Merge this corrected architecture reference and the landing-page Coming soon copy.
3. Initialize and review the private backend repository.
4. Run backend, OpenAPI, protocol, Terraform, secret, dependency, and container checks.
5. Review the foundation Terraform plan.
6. Obtain explicit project ID, billing, budget, state-bucket, and Jakarta approvals.
7. Apply foundation, then add the rate-limit secret version without Terraform.
8. Review and apply Firestore, payload bucket, Cloud Run, and cleanup data plane.
9. Deploy a no-traffic staged Cloud Run revision and a Vercel preview.
10. Run synthetic allocation, upload, completion, download, expiry, and revocation checks.
11. Require protected GitHub environment approval before infrastructure apply and production traffic promotion.
12. Complete secret-history, privacy, cryptographic, and penetration reviews before making the backend repository public.

## Acceptance criteria

- Web creates and opens a secret link without sending plaintext or the key.
- Wrong keys, modified envelopes, missing fragments, malformed IDs, expiry, and revocation fail safely.
- The backend cannot decrypt stored payloads.
- Completion rejects wrong size, generation, content type, overwrite attempts, and replay.
- Revocation and cleanup remain correct under concurrent retries.
- No sensitive capability appears in logs, CI output, URLs sent to the API, or Git history.
- Vercel deep links and SPA fallback work; the service worker does not cache ciphertext or API responses.
- Existing IndexedDB data, local editing, imports, exports, and offline startup remain unaffected.
- Web fixtures match the frozen protocol and are shared with iOS and Android.
- Terraform proves private storage, least-privilege IAM, Jakarta location, budget alerts, and conservative Cloud Run limits.
- CI plans automatically; all applies and production promotions require manual approval.
- A known-good Cloud Run revision can be restored without rolling back data resources.

## Stop conditions

Stop and request direction when:

- project ID, billing account, budget, or Jakarta placement lacks explicit approval;
- Firestore, Storage, Cloud Run, Secret Manager, or Scheduler cannot use the approved location;
- an operation would replace landing-page DNS, application DNS, email, or existing Vercel configuration unexpectedly;
- a provider requires a long-lived service-account or account-wide key;
- archive or protocol fixtures do not interoperate;
- plaintext or decryption keys would reach the backend;
- tests, secret scans, dependency scans, Terraform validation, staged smoke checks, or history review fail;
- an infrastructure plan contains an unexpected destroy or material cost increase.

## Current next action

Complete repository and client implementation plus read-only validation. Pause before creating any Google Cloud project, attaching billing, creating Firestore or Storage, applying Terraform, exposing Cloud Run, or promoting production traffic.

