# HERITG Encrypted Sharing Implementation Plan

Status: Saved for later implementation. This document does not authorize production deployment.

## Document Security

This plan intentionally contains no credentials or private account identifiers. Values that must be supplied during implementation use descriptive placeholders such as `<GCP_PROJECT_ID>`, `<BILLING_ACCOUNT_ID>`, `<CLOUDFLARE_ZONE_ID>`, `<APPLE_TEAM_ID>`, and `<SIGNING_CERT_SHA256>`.

Never place API tokens, passwords, service-account keys, signing keys, billing identifiers, account email addresses, or local absolute paths in this document or repository.

## Objective

Build an open-source, low-cost proof of concept for immutable, private, read-only family-tree sharing across web, iOS, and Android.

The first deployment targets users in Indonesia and uses `https://heritg.hamanto.com` as the public origin. Family-tree content remains end-to-end encrypted. Local client databases remain authoritative, and the service stores only ciphertext and minimal operational metadata.

## POC Scope

- Private, read-only secret links.
- No public or search-indexed family pages.
- No server-side family-tree editing.
- No plaintext family-tree CRUD API.
- No account system required for the initial sharing POC.
- Immutable shared snapshots rather than live synchronization.
- Client-generated encryption keys that are never sent to the service.
- Jakarta-hosted Cloud Run, Firestore, Artifact Registry, and payload storage.
- Globally delivered static viewer through Firebase Hosting.
- Open-source clients, protocol, backend, infrastructure templates, tests, and threat model.

## Confirmed Decisions

- Public domain: `heritg.hamanto.com`.
- Registrar: Namecheap.
- Authoritative DNS: Cloudflare.
- DNS records for Firebase Hosting remain DNS-only during the POC.
- Cloud provider: Google Cloud with a dedicated POC project.
- Project ID pattern: `heritg-poc-<short-random-suffix>`.
- Primary region: `asia-southeast2`.
- Static hosting and TLS: Firebase Hosting.
- Dynamic API: Cloud Run.
- Metadata: Firestore Native mode.
- Ciphertext objects: private Cloud Storage bucket.
- Source repository: this public HERITG monorepo.
- Every committed implementation and plan artifact must be safe for public disclosure.
- DNS automation: short-lived, zone-scoped Cloudflare API tokens.
- Namecheap API: not required.

## Proposed Architecture

```text
Namecheap registrar
        |
Cloudflare authoritative DNS
        |
heritg.hamanto.com (DNS-only records)
        |
Firebase Hosting and managed TLS
        |
        +-- Static HERITG viewer
        +-- /s/**  -> SPA viewer
        +-- /v1/** -> Cloud Run rewrite
                         |
                  asia-southeast2
                         |
                 +-------+-------+
                 |               |
              Firestore      Cloud Storage
              metadata       ciphertext only
```

Firebase Hosting is global. Encrypted content processing and persistent content storage remain in Jakarta. Privacy disclosures must explain that static delivery, edge routing, request metadata, and security logs can involve infrastructure outside Indonesia.

## Public URLs

```text
https://heritg.hamanto.com/
https://heritg.hamanto.com/s/<SHARE_ID>#k=<BASE64URL_KEY>
https://heritg.hamanto.com/v1/<ENDPOINT>
https://heritg.hamanto.com/healthz
```

The decryption key stays after the URL fragment marker. URL fragments are not included in HTTP requests and therefore must not reach Firebase Hosting, Cloudflare DNS, Cloud Run, Firestore, Cloud Storage, or normal access logs.

## Cryptographic Envelope

Proposed immutable envelope identifier: `HTGSHR01`.

- Cipher: AES-256-GCM.
- Key: 32 random bytes generated on the client.
- Nonce: 12 random bytes generated independently for each share.
- Authentication tag: 16 bytes.
- Plaintext: canonical selected-tree `.heritg` payload.
- Associated data: envelope version and opaque share identifier.
- Encoding: deterministic binary envelope with an explicitly versioned schema.
- Share identifier: high-entropy opaque random value.
- Deletion token: separate high-entropy random value.
- Server deletion-token storage: SHA-256 hash only.
- Key transport: URL fragment only.

The protocol must have shared test vectors for web, Android, and iOS. Do not claim audited E2EE until an independent cryptographic review and penetration test are complete.

## Sharing Defaults

- Default expiry: 30 days.
- Maximum expiry: 90 days.
- Maximum encrypted payload: 32 MiB, including envelope overhead.
- Access: anyone possessing the complete secret link.
- Recipient capability: read-only download and local decryption.
- Sender capability: retain deletion token for early revocation.
- Server capability: store, expire, revoke, and delete opaque ciphertext.

The exact payload limit must be validated against Firebase Hosting, Cloud Run, signed URL, browser, and mobile constraints before it is frozen.

## API Surface

```text
POST /v1/share-uploads
POST /v1/share-uploads/complete
POST /v1/share-downloads
POST /v1/share-revocations
GET  /healthz
```

All mutation endpoints use validated JSON request bodies. Do not put deletion tokens, signatures, object paths, or sensitive values in query strings.

### Upload Flow

1. Client creates a canonical selected-tree archive.
2. Client generates a key and encrypts the archive locally.
3. Client requests an upload allocation with ciphertext size and expiry.
4. Server validates limits and creates opaque metadata.
5. Server returns a short-lived signed upload URL.
6. Client uploads ciphertext directly to the private bucket.
7. Client completes the upload through the API.
8. Server verifies object existence, size, and immutable state.
9. Client constructs the secret link locally by adding the key fragment.

### Download Flow

1. Recipient opens the secret link.
2. Viewer extracts the key from the URL fragment locally.
3. Viewer requests a download using only the opaque share identifier.
4. Server checks completion, expiry, and revocation.
5. Server returns a short-lived signed download URL.
6. Viewer downloads ciphertext and decrypts locally.
7. Viewer validates the archive before rendering a read-only tree.

### Revocation Flow

1. Sender submits the share identifier and deletion token in a JSON body.
2. Server hashes the supplied token and compares it safely.
3. Server marks metadata revoked before object deletion.
4. Server deletes the ciphertext object.
5. Cleanup retries remain idempotent.

## Data Model

Firestore stores only the opaque share and object identifiers, ciphertext byte length, envelope version, lifecycle timestamps, hashed deletion token, and narrow operational status.

Do not store names, relationships, dates, notes, media metadata, plaintext archive manifests, encryption keys, raw deletion tokens, full secret URLs, or user-entered family content.

## Storage Rules

- Payload bucket is private.
- Public access prevention is enforced.
- Uniform bucket-level access is enabled.
- Object versioning is disabled for payloads.
- Soft-delete retention is disabled or minimized after legal review.
- Expired ciphertext is deleted automatically.
- Abandoned uploads are deleted automatically.
- Signed URLs have short expiration windows.
- Storage object names are opaque and non-enumerable.
- The Cloud Run runtime identity receives access only to this bucket.

Terraform state uses a separate private bucket with versioning enabled. Infrastructure state must never share a bucket with family-tree ciphertext.

## Threat Model Boundaries

The design protects family-tree plaintext from the hosting service, database administrators, storage administrators, routine infrastructure backups, and passive network observers when clients are trustworthy.

The design does not fully protect against:

- A compromised web deployment serving malicious JavaScript.
- A compromised mobile application build.
- A compromised recipient or sender device.
- A recipient intentionally redistributing decrypted content or the secret link.
- Browser extensions, malware, screenshots, or clipboard monitoring.
- Traffic analysis and operational metadata.
- Weak random-number generation or incorrect client cryptography.

Mitigations include strict build provenance, reproducible fixtures, code review, self-hosted scripts, restrictive CSP, dependency pinning, secret scanning, signed mobile releases, external cryptographic review, and clear user warnings.

## Web Security Requirements

- Strict Content Security Policy with self-hosted scripts only.
- `Strict-Transport-Security`.
- `Referrer-Policy: no-referrer`.
- `X-Content-Type-Options: nosniff`.
- CSP `frame-ancestors 'none'`.
- Restrictive `Permissions-Policy`.
- `X-Robots-Tag: noindex, nofollow, noarchive`.
- `Cache-Control: no-store` on API responses.
- Immutable caching only for fingerprinted static assets.
- No third-party analytics, tag managers, advertisements, or remote JavaScript in the decryption viewer.
- No logging of full share URLs, deletion tokens, signed URLs, or request bodies.
- Explicit review of service-worker update and caching behavior.

## Mobile Link Requirements

Firebase Hosting serves:

```text
/.well-known/apple-app-site-association
/.well-known/assetlinks.json
```

- iOS uses Associated Domains for `applinks:heritg.hamanto.com`.
- Android uses verified App Links for `https://heritg.hamanto.com/s/*`.
- Production identifiers and certificate fingerprints use placeholders until supplied securely.
- Browser fallback works when the native application is unavailable.
- All clients parse the same fragment-key format.
- All recipient clients render shared data read-only.

## Domain and DNS Plan

Namecheap remains the registrar. Cloudflare remains the authoritative DNS provider.

- Keep registrar lock, auto-renewal, recovery controls, and 2FA enabled.
- Preserve all existing apex website, email routing, SPF, and verification records.
- Export the Cloudflare zone before every provisioning change.
- Add only records requested by Firebase for `heritg.hamanto.com`.
- Keep Firebase ownership TXT records as required for renewal.
- Keep web records DNS-only for the POC.
- Let Firebase Hosting provision and renew TLS.
- Do not depend on Cloudflare WAF because Firebase-generated hostnames can bypass it.
- Enable DNSSEC only after Firebase domain provisioning is stable.
- Add the Cloudflare-generated DS record through the Namecheap dashboard.

## Cloudflare Token Policy

Use separate temporary tokens restricted to the `hamanto.com` zone. The preflight token receives Zone Read and DNS Read. The short-lived deployment token receives Zone Read and DNS Edit.

Tokens must be stored outside the repository, injected through the process environment or operating-system credential store, verified through Cloudflare's token endpoint, and revoked after use. Never use the global API key.

## Namecheap Access Policy

The Namecheap API is intentionally excluded because DNS is delegated to Cloudflare and registrar changes are infrequent. Production Namecheap API access would introduce an account-wide query-string credential and static IPv4 allowlisting without providing a POC benefit.

Use the dashboard for registrar lock, renewal, nameservers, account recovery, and DNSSEC DS management.

## GCP Project and Region

Create a dedicated project only after the permanent ID and billing account are explicitly approved.

```text
Project display name: HERITG POC
Project ID pattern:   heritg-poc-<short-random-suffix>
Primary region:       asia-southeast2
```

Regional resources are the Cloud Run service, Artifact Registry repository, Firestore database, encrypted payload bucket, and Terraform state bucket.

Firebase Hosting is global. Cloud Logging location and retention must be reviewed separately, and logs must not contain family content or secrets.

## Required GCP APIs

Required services are Artifact Registry, Billing Budgets, Cloud Billing, Cloud Build, Cloud Resource Manager, Firebase Management, Firebase Hosting, Firestore, IAM, IAM Credentials, Logging, Monitoring, Cloud Run, Service Usage, and Cloud Storage APIs.

Enable required APIs through Terraform where practical and leave unrelated APIs disabled.

## IAM Model

Create separate `heritg-runtime` and `heritg-deployer` identities.

The runtime identity receives only Firestore data access, payload-bucket object access, logging and metrics writing, and narrowly scoped signing capability when signed URLs require it.

The deployment identity receives only deployment-related access for Cloud Run, Artifact Registry, Firebase Hosting, and controlled runtime-service-account impersonation.

GitHub Actions must use Workload Identity Federation. Do not create downloadable service-account JSON keys.

## Repository and Tooling Plan

- Treat every branch and pull request as public from its first commit.
- Ignore dependencies, generated output, credentials, local configuration, Terraform state, emulator state, and signing artifacts.
- Pin Node.js, Firebase CLI, Terraform, providers, base images, and production dependencies.
- Use Cloud Build or an explicit supported Linux target for deployable containers from ARM development machines.
- Require build, lint, unit tests, integration tests, secret scanning, dependency scanning, and container scanning.
- Review all Git history before each release.

The planned layout adds `server/` for Cloud Run, `infra/` for Terraform, `tests/fixtures/` for protocol fixtures, and Firebase configuration alongside the existing web `src/`.

## Implementation Sequence

### Phase 1: Repository Baseline

1. Establish a clean public GitHub baseline.
2. Exclude generated and sensitive files before the first commit.
3. Run build, tests, lint, and a secret scan.
4. Enable branch protection and available repository security controls.

### Phase 2: Access Verification

1. Authenticate GitHub, GCP, and Firebase interactively.
2. Store Cloudflare tokens outside the repository.
3. Run read-only checks for billing, project creation, zone access, and DNS records.
4. Confirm no account identifiers or credentials enter Git history.

### Phase 3: Project Bootstrap

1. Generate and approve the permanent project ID.
2. Create the project and attach approved billing.
3. Add environment and application labels.
4. Create billing alerts before workloads.
5. Set conservative Cloud Run maximum-instance limits.
6. Add Firebase to the existing GCP project.

### Phase 4: Terraform Bootstrap

1. Create a private regional Terraform state bucket.
2. Enable uniform access, public-access prevention, and state versioning.
3. Configure the remote backend.
4. Pin Terraform and provider versions.
5. Add required APIs, service identities, Artifact Registry, budgets, and monitoring configuration.
6. Review the full plan before applying.

### Phase 5: Irreversible Location Gate

1. Reconfirm current Jakarta availability for Firestore and Storage.
2. Review Firestore Native mode and its immutable location selection.
3. Review payload retention, soft delete, lifecycle cleanup, and access controls.
4. Obtain explicit approval before creating Firestore or payload storage.

### Phase 6: Format Interoperability

1. Designate the newer native `.heritg` archive as canonical.
2. Implement compatible selected-tree import and export on the web.
3. Create deterministic fixtures shared by all clients.
4. Freeze the `HTGSHR01` envelope only after cross-platform tests pass.
5. Obtain independent cryptographic review.

### Phase 7: Backend

1. Implement the server in TypeScript under `server/`.
2. Validate every external input and enforce strict size limits.
3. Implement signed upload and download flows.
4. Implement completion, expiry, revocation, and idempotent cleanup.
5. Add rate limiting, abuse controls, structured redacted logs, and health checks.
6. Run unit, integration, emulator, malformed-input, and container security tests.
7. Build through Cloud Build and deploy to Cloud Run in Jakarta.

### Phase 8: Firebase Hosting

1. Configure the SPA and `/s/**` fallback.
2. Rewrite `/v1/**` to the Jakarta Cloud Run service.
3. Apply strict security and caching headers.
4. Review PWA service-worker behavior.
5. Deploy and test through a Firebase preview hostname.

### Phase 9: Custom Domain

1. Export the Cloudflare zone.
2. Start the Firebase custom-domain workflow.
3. Add only Firebase-provided records using a temporary write token.
4. Keep records DNS-only.
5. Wait for ownership verification and managed TLS.
6. Test the viewer, API, existing apex website, and email routing.
7. Revoke the write token.

### Phase 10: DNSSEC

1. Enable DNSSEC in Cloudflare after custom-domain stability.
2. Add the generated DS record through Namecheap.
3. Verify the public DNSSEC chain and all existing services.

### Phase 11: Mobile Links

1. Add iOS Associated Domains.
2. Add Android verified App Links.
3. Publish association files with production placeholders replaced securely.
4. Test installed-app routing, browser fallback, fragment preservation, and read-only rendering.

### Phase 12: Release Gates

1. Run all builds, tests, static analysis, secret scans, and dependency scans.
2. Verify a clean Terraform plan after deployment.
3. Verify keys, tokens, signed URLs, and plaintext never appear in logs.
4. Verify expiry, revocation, deletion, and abandoned-upload cleanup.
5. Verify budget alerts and maximum-instance controls.
6. Complete privacy, DPIA, legal, cryptographic, and penetration-testing gates.
7. Scan the complete Git history before each release.

## Compliance Workstream

Obtain Indonesian legal counsel for the final interpretation and launch decision.

The workstream should cover:

- UU No. 27 Tahun 2022 on Personal Data Protection.
- Controller and processor role analysis.
- DPIA for family, child, and potentially sensitive personal data.
- Parental or guardian consent where required.
- PSE registration assessment.
- Privacy notice and lawful-processing basis.
- Data-subject request procedures.
- Breach response procedures within applicable `3 x 24 hour` deadlines.
- Cross-border processing and transfer review for Firebase edge delivery, logs, support, and subprocessors.
- Retention, revocation, deletion, backup, and legal-hold behavior.
- Vendor and subprocessor disclosures.

E2EE reduces content exposure but does not remove legal obligations for metadata, client software, operations, or user support.

## Cost Controls

Expected small-scale POC infrastructure remains approximately USD 0-5 per month, excluding the existing domain and external reviews. Actual Jakarta storage, egress, build, and logging usage is billed.

- Use scale-to-zero Cloud Run with conservative maximum instances.
- Use small payload and expiry limits.
- Add billing alerts before deployment.
- Configure short log retention where legally and operationally appropriate.
- Avoid a fixed-cost Google HTTPS load balancer.
- Use Firebase Hosting within applicable allowances.
- Review costs after every load test.

## Delivery Estimate

Estimated engineering effort: 8-12 engineer-weeks, excluding legal work, external cryptographic review, and penetration testing.

Suggested milestones:

1. Access, repository, and infrastructure bootstrap.
2. Canonical archive interoperability.
3. Cross-platform encrypted envelope.
4. Backend and lifecycle implementation.
5. Firebase viewer and custom domain.
6. Mobile deep links.
7. Security, compliance, and launch review.

## Acceptance Criteria

- A sender can create an immutable encrypted share from web, iOS, or Android.
- The server receives no decryption key or plaintext family content.
- Each supported client can decrypt fixtures created by every other client.
- A recipient can view but cannot edit the shared snapshot through the sharing interface.
- Expired and revoked shares cannot obtain new download URLs.
- Ciphertext is removed according to documented lifecycle behavior.
- Existing `hamanto.com` website and email services remain unaffected.
- `heritg.hamanto.com` serves valid managed TLS and is not indexed.
- No secret, key, raw deletion token, signed URL, or plaintext appears in source control or logs.
- Runtime and deployment IAM permissions pass least-privilege review.
- Builds, tests, lint, infrastructure validation, secret scans, dependency scans, and container scans pass.
- Threat model, privacy scope, incident response, and legal gates are approved before public launch.

## Explicit Stop Conditions

Stop implementation and request approval if:

- The permanent GCP project ID or billing account differs from the approved value.
- Firestore or Storage cannot use the approved Jakarta location.
- A provider requires a long-lived account-wide credential.
- Existing DNS, website, or email records would be replaced.
- A client cannot interoperate with the canonical archive or encryption fixtures.
- Plaintext or decryption keys would be exposed to the backend.
- Retention behavior conflicts with revocation or legal requirements.
- Tests or secret scans fail.
- Unexpected infrastructure cost or organization policy appears.

## Current Next Action

Implementation remains deferred. When resumed, perform only repository/tooling setup and read-only account verification first, then report results and obtain approval before creating any cloud resource.
