# Security Policy

## Cryptography Guardrails

The cross-platform `.heritg` format is specified in
[`docs/DATA_FORMAT.md`](docs/DATA_FORMAT.md). Implementations must not introduce
another platform-specific archive or cryptographic construction.

- Use platform cryptography: CryptoKit/CommonCrypto on iOS, Web Crypto in
  browsers, and JCA on Android. Do not implement AES.
- Encrypted archives use AES-256-GCM with a fresh 96-bit nonce and a fresh
  128-bit salt from the platform CSPRNG for every export.
- Every current `.heritg` writer must emit the `HTGENC01` encrypted envelope.
  Plain ZIP input remains reader-only compatibility behavior and must not be
  exposed as a product export path.
- Derive the key with PBKDF2-HMAC-SHA256 at 600,000 iterations. NFC-normalize
  the password and encode it as UTF-8 before derivation. An empty password is
  valid and means a zero-length byte string; it provides neither confidentiality
  nor authenticity against a file holder, who can derive the same key.
- Export interfaces may leave the password empty. If it is non-empty, require
  at least 8 NFC-normalized Unicode code points with at least one Unicode
  uppercase letter, one Unicode lowercase letter, and one Unicode decimal
  digit. Recommend a longer unique password because archives can be guessed
  offline. Importers must try the empty password first and prompt only after
  authentication fails.
- Authenticate the complete 44-byte envelope header as GCM additional data.
  Reject unknown versions, algorithm identifiers, or work factors before key
  derivation.
- Never reuse an AES-GCM key/nonce pair, log a password or derived key, persist
  an archive password, or expose a deterministic salt/nonce production API.
- Treat all imports as hostile. Enforce size and record limits, reject unsafe
  ZIP paths and unsupported ZIP features, verify every SHA-256 checksum before
  parsing JSON, validate graph references, and commit only after full success.
- Preserve portable IDs. Reject any collision with existing data instead of
  silently overwriting or partially importing records.
- Any format or parameter change requires a new version, an explicit migration
  decision, updated documentation, and one deterministic fixture asserted by
  iOS, web, and Android.

The deterministic fixture is test-only and contains synthetic data. Production
code must always generate its salt and nonce randomly.

## Security Review Gate

Before a public release or cryptography change:

1. Run the iOS, web, and Android archive suites and confirm the published
   encrypted-envelope SHA-256 values for both non-empty and empty passwords
   match on all three platforms.
2. Run dependency, secret-history, lint, and production-build checks.
3. Review archive parsers for path traversal, duplicate entries, links,
   decompression bombs, oversized fields, broken references, and partial writes.
4. Update [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md) when the threat
   model, platform implementation, dependency set, or network behavior changes.
5. Do not release from a branch that omits a supported platform implementation.

## Before Every Commit

1. Review `git status` and the staged diff.
2. Never commit passwords, tokens, private keys, service-account files, signing
   credentials, production configuration, user data, logs, archives, or build
   output.
3. Run the local secret scanner:

   ```sh
   brew install pre-commit gitleaks
   pre-commit install
   pre-commit run --all-files
   ```

4. Confirm generated files are ignored with `git check-ignore -v <path>`.
5. Push only after the Gitleaks workflow passes.

`.gitignore` prevents common accidents, but it is not a security boundary.
Always inspect changes before committing.

## Local Configuration

Keep developer-specific values in ignored files such as `.env`,
`Secrets.xcconfig`, or `Config/Local/`. Commit only documented example files
containing unmistakable placeholders, such as `.env.example`.

Application code should fail with a clear setup message when required local
configuration is missing. It must not include fallback production credentials.

## Firebase

Production Firebase files are ignored by this repository:

- `GoogleService-Info.plist`
- `google-services.json`
- Firebase Admin SDK and service-account JSON files

Obtain mobile configuration files directly from the Firebase console and keep
them outside Git. A Firebase mobile API key is shipped in the compiled app and
cannot be treated as a server secret. Protect the project with restricted API
keys, Firebase Security Rules, App Check, separate development and production
projects, and least-privilege IAM.

Never place an Admin SDK private key or service-account credential in a mobile
app. Privileged Firebase operations belong on a trusted backend.

For CI, store a configuration file as an encrypted GitHub Actions secret, then
reconstruct it only in the runner's temporary workspace. Do not print the
secret or upload the reconstructed file as an artifact. Prefer workload
identity federation over long-lived service-account keys when supported.

## Apple and Android Signing

Never commit App Store Connect `.p8` keys, certificates, provisioning profiles,
keystores, passwords, or export archives. Store CI credentials in GitHub
Actions Secrets or a dedicated secrets manager and grant only the permissions
needed for the job.

## GitHub Repository Settings

After publishing the repository:

1. Enable GitHub Secret Scanning and Push Protection.
2. Protect the default branch and require the `Gitleaks` status check.
3. Require pull requests and review before merging.
4. Restrict workflow permissions to read-only by default.
5. Enable Dependabot security updates.

## If a Secret Is Exposed

1. Revoke or rotate it immediately. Deleting the file is not enough.
2. Disable affected credentials and review provider audit logs.
3. Remove the value from Git history before making the repository public.
4. Treat forks, caches, logs, releases, and CI artifacts as potentially copied.
5. Document the incident without reproducing the secret.

Do not open a public issue containing a suspected secret. Contact Hamanto
Studio privately through [Telegram](https://t.me/robihamanto) with the affected
component and reproduction details. Do not include the secret itself in the
initial message.

For user-facing data practices, see the [Privacy Policy](PRIVACY.md) and
[Data Processing Register](docs/DATA_PROCESSING.md).
