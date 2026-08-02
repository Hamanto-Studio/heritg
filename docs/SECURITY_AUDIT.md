# HERITG Security and Cryptography Audit

Audit date: 2026-08-02
Scope: the iOS, web, and Android source, tests, workflows, and documentation
included with this audit

## Release Decision

The archive design and implementations are aligned at source level, and the
web implementation reproduces the exact iOS/Android encrypted compatibility
vector. This is not yet an unconditional public-release approval.

Before publishing a release, the repository owner must:

1. Obtain green iOS and Android native CI results for the exact release commit.
2. Require the iOS, web, Android, and secret-scan checks on the protected branch.

No review can guarantee that software is free of vulnerabilities. This report
records the reviewed threat model, controls, evidence, and remaining risks.

## Threat Model

The archive controls are designed for:

- An attacker who obtains a password-protected `.heritg` file and attempts
  offline password guessing.
- An attacker who modifies the encrypted header, ciphertext, tag, ZIP records,
  checksums, JSON, media, or graph references.
- A malicious import containing path traversal, duplicate paths, links,
  unsupported compression, oversized records, invalid UTF-8, broken references,
  or identifier collisions.
- Accidental disclosure through a readable backup.
- Platform differences in password Unicode, date encoding, JSON, ZIP, and
  authenticated-encryption byte layout.

They do not protect against:

- A compromised operating system, browser process, origin, or running app.
- Malware or an attacker who can read data after the user unlocks an archive.
- Weak user-selected passwords against offline guessing.
- Screenshots, clipboard disclosure, readable GEDCOM/image/SVG exports, or a
  recipient to whom the user intentionally sends plaintext.
- Loss of the password. HERITG has no recovery key or password escrow.

## Cryptographic Contract

| Control | Contract |
| --- | --- |
| Payload encryption | AES-256-GCM |
| Password KDF | PBKDF2-HMAC-SHA256, 600,000 iterations |
| Password bytes | Unicode NFC, then UTF-8 |
| Salt | 16 random bytes per export |
| Nonce | 12 random bytes per export |
| Authentication tag | 16 bytes |
| Authenticated metadata | Complete 44-byte version/algorithm/KDF/salt/nonce header |
| Plain payload | Strict stored ZIP with JSON/JSONL, media, and SHA-256 checksums |
| Maximum archive | 32 MiB |

AES is standardized by [NIST FIPS 197](https://csrc.nist.gov/pubs/fips/197/final),
GCM by [NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final), and
password-based key derivation for stored data by
[NIST SP 800-132](https://csrc.nist.gov/pubs/sp/800/132/final). The selected
PBKDF2-HMAC-SHA256 work factor matches the current
[OWASP Password Storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
for PBKDF2.

The 15-NFC-code-point minimum for newly created backup passwords follows the
single-factor minimum in
[NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/).
The archive use case is local password-based encryption rather than online
authentication, but it has the same exposure to user-chosen weak secrets and
adds offline guessing risk.

PBKDF2 is CPU-hard, not memory-hard. Argon2id would provide stronger resistance
to massively parallel guessing, but it is not uniformly provided by CryptoKit,
Web Crypto, and Android JCA. A future memory-hard KDF must use a new envelope
version and independently reviewed native/WASM dependency; it must not silently
change version 1.

## Interoperability Proof

All platforms use this deterministic test-only input:

- Salt: `000102030405060708090a0b0c0d0e0f`
- Nonce: `101112131415161718191a1b`
- Passwords: decomposed `Cafe\u0301 family` and composed `Caf\u00e9 family`
- Synthetic family payload only

The complete encrypted archive SHA-256 must be:

```text
2806b437258da23ca3e0f1f57df81ae69467869ed9d9e8e0c84e00cb9bcd2780
```

The iOS and Android source suites already assert this value. The web suite now
asserts the same value and successfully decrypts the resulting archive. This is
byte-for-byte evidence that password normalization, PBKDF2, header encoding,
ZIP bytes, AES-GCM additional data, ciphertext, and tag agree.

Production exports never use the deterministic salt or nonce.

## Findings

### Resolved: platform-specific and incompatible archives (high)

The pre-audit iOS implementation used an Apple binary property list and the
web app explicitly rejected password-protected archives. Android's parity
branch used the documented portable ZIP/envelope.

The iOS implementation now uses the shared ZIP/envelope, and the web app can
export and import that format, including encrypted files. The web reader still
accepts the pre-release Apple format for migration.

### Resolved: readable web backup as the primary path (high)

The web settings flow previously downloaded a readable JSON backup. The primary
backup action now creates a password-protected `.heritg` file and requires a
15-character minimum in the UI. iOS and Android encryption are now enabled by
default and use the same minimum in their export UIs.

The codec continues to decrypt older archives that used shorter passwords. This
is required for backward compatibility and does not weaken newly created UI
exports.

### Resolved: unsafe or ambiguous import behavior (high)

The shared readers now:

- Reject compression, data descriptors, ZIP64, extras, comments, split disks,
  duplicate entries, directory entries, links, unsafe paths, gaps, overlaps,
  trailing bytes, CRC mismatches, and oversized uncompressed content.
- Verify the exact checksum path set and every SHA-256 checksum before parsing
  JSON.
- Enforce media hash, MIME, extension, byte-count, graph, date, field, and
  record-count rules.
- Preserve portable identifiers and reject collisions before changing stored
  data.
- Use one generic wrong-password-or-corrupt result for authentication failure.

### Existing controls reviewed

- The web app has no family-data network request in application source.
- Vercel configuration supplies CSP, HSTS, clickjacking, MIME sniffing,
  referrer, permissions, opener, and resource-policy headers.
- Web browser storage uses AES-GCM with a non-extractable browser-held key and a
  fresh IV for each write. This protects stored bytes, but an attacker executing
  script in the same origin can ask the app to decrypt them; CSP and dependency
  control remain necessary.
- No Firebase, advertising, analytics, Sentry, or third-party crash SDK is
  present in the reviewed runtime source.
- Signing files, common secret files, and production Firebase configuration are
  excluded by repository policy and secret scanning.

### Resolved: Android release integration and CI gate (high)

Android source is included in the reviewed tree. A pinned Android workflow runs
unit tests, lint, and a debug build for Android and compatibility-fixture
changes. Its secure export UI defaults to encryption and applies the same
15-character minimum as iOS and web.

### Open verification item: native CI (medium)

The local machine has no full Xcode installation and no Android SDK. Swift
syntax parsing succeeded, but iOS simulator tests could not start. The isolated
Android test run downloaded its pinned Gradle version, then stopped because the
Android SDK is absent. Both native suites must run in CI for the release commit.

### Verified: complete Git history scan

The pinned Gitleaks 8.30.1 binary was verified against its published SHA-256
checksum and scanned all 51 reachable commits with redaction enabled. It
reported no leaks. Separate scans of the changed application source,
documentation, and workflows also reported no leaks. A whole-working-directory
scan flags Excalidraw's published client Firebase configuration inside the
ignored generated `web/dist` bundle; this originates in the pinned Excalidraw
package, is not a HERITG credential, and is not tracked. The CI scan remains
required so the history result is repeated for the exact release commit.

## Verification Recorded

| Check | Result |
| --- | --- |
| Web lint | Passed |
| Web tests | 95 passed |
| Web production build | Passed |
| Cross-platform encrypted SHA-256 vector | Passed on web; identical assertion present in iOS and Android |
| Production npm dependency audit | 0 known vulnerabilities reported |
| Swift syntax parse | Passed |
| iOS simulator suite | Not run locally: full Xcode unavailable |
| Android unit suite | Not run locally: Android SDK unavailable |
| Complete-history Gitleaks | Passed: 51 commits, no leaks found |
| Changed-source Gitleaks | Passed; ignored generated dependency finding reviewed as non-HERITG client configuration |

## Required Ongoing Rules

- Review PBKDF2 cost and platform performance at least annually. Parameter
  changes require a new readable version.
- Never downgrade an encrypted archive to plaintext during migration.
- Never log import contents, passwords, derived keys, plaintext archives, or
  cryptographic failure details.
- Keep compatibility fixtures synthetic and public.
- Fuzz the ZIP and record decoders before the first stable release.
- Treat any cryptographic dependency, parser dependency, new network endpoint,
  or WebAssembly module as a security-review trigger.
