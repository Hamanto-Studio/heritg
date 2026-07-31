# Security Policy

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
