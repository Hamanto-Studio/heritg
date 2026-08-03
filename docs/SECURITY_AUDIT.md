# HERITG Security and Cryptography Audit

Audit date: 2026-08-03
Scope: the iOS, web, and Android source, tests, workflows, and documentation
included with this audit

## Release Decision

The archive design and implementations are aligned at source level, and the
web implementation reproduces the exact iOS/Android encrypted compatibility
vectors for both non-empty and empty passwords. This is not yet an
unconditional public-release approval.

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
- Platform differences in password Unicode, date encoding, JSON, ZIP, and
  authenticated-encryption byte layout.

They do not protect against:

- A compromised operating system, browser process, origin, or running app.
- Malware or an attacker who can read data after the user unlocks an archive.
- Weak user-selected passwords against offline guessing.
- An empty password. It is not a secret, so any file holder can derive the key,
  read the archive, and create a valid replacement envelope.
- Screenshots, clipboard disclosure, readable GEDCOM/image/SVG exports, or a
  recipient to whom the user intentionally sends plaintext.
- Loss of the password. HERITG has no recovery key or password escrow.

## Cryptographic Contract

| Control | Contract |
| --- | --- |
| Payload encryption | AES-256-GCM |
| Password KDF | PBKDF2-HMAC-SHA256, 600,000 iterations |
| Password bytes | Unicode NFC, then UTF-8 |
| Password policy | Optional; empty is allowed, non-empty requires 8+ NFC code points with Unicode uppercase, lowercase, and decimal-digit classes in writer UIs |
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

The product policy for newly created non-empty backup passwords is a minimum of
8 NFC code points plus uppercase, lowercase, and decimal-digit composition.
This is a product compatibility choice, not a claim of equivalence with
[NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/),
which recommends a 15-character minimum for passwords used as a single
authentication factor and generally advises against mandatory composition
rules. The archive use case adds offline guessing risk: anyone with a copy can
try candidates without an online rate limit. The interfaces therefore describe
8 as a minimum and recommend a longer unique password.

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

The complete encrypted archive SHA-256 for the NFC-equivalent non-empty
passwords must be:

```text
2806b437258da23ca3e0f1f57df81ae69467869ed9d9e8e0c84e00cb9bcd2780
```

The iOS and Android source suites already assert this value. The web suite now
asserts the same value and successfully decrypts the resulting archive. This is
byte-for-byte evidence that password normalization, PBKDF2, header encoding,
ZIP bytes, AES-GCM additional data, ciphertext, and tag agree.

The same payload, salt, nonce, and an empty password must produce:

```text
bc8df41b6991455fdad8150c610e56f32d0146ee117bbb7cb2636d3732595440
```

All three platform suites assert this second value and restore it with the
empty password. This proves that compulsory encryption and prompt-free import
use the same bytes on every supported platform.

Production exports never use the deterministic salt or nonce.

## Findings

### Resolved: platform-specific and incompatible archives (high)

The pre-audit iOS implementation used an Apple binary property list and the
web app explicitly rejected password-protected archives. Android's parity
branch used the documented portable ZIP/envelope.

The iOS implementation now uses the shared ZIP/envelope, and the web app can
export and import that format, including encrypted files. The web reader still
accepts the pre-release Apple format for migration.

### Resolved: readable backup as a current product path (high)

The web settings flow previously downloaded a readable JSON backup, and native
flows could create an unencrypted ZIP. Every current iOS, web, and Android
`.heritg` export now emits `HTGENC01`. The password is optional; if supplied,
all three interfaces require at least 8 NFC-normalized Unicode code points with
an uppercase letter, a lowercase letter, and a decimal digit.
With an empty password, importers authenticate and restore without prompting.

An empty password does not turn encryption into access control or authenticity
against the file holder. Anyone holding that file can derive its key, read it,
and create a valid replacement envelope. The interface and public announcement
state this tradeoff directly instead of presenting the envelope as secrecy.

The codecs continue to read legacy unencrypted archives and decrypt older
archives that used shorter passwords. This is required for backward
compatibility and does not create an unencrypted current export path.

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
changes. Its export UI always uses the encrypted envelope, permits the empty
password, and applies the same 8-character and character-class policy as iOS
and web when a password is supplied.

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
| Web tests | 96 passed |
| Web production build | Passed |
| Cross-platform encrypted SHA-256 vectors | Non-empty and empty-password vectors passed on web; identical assertions present in iOS and Android |
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
