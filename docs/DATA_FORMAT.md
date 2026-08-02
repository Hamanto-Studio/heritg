# HERITG Data and Portability Specification

Status: Archive format 1.0.0<br>
Companion: [MVP_PRODUCT_SPEC.md](MVP_PRODUCT_SPEC.md)

## 1. Design Rules

- `.heritg` is a complete backup and cross-platform transfer format, never a SwiftData or Room database copy.
- Portable IDs are UTF-8 strings independent of platform database identifiers.
- The canonical payload is one family tree graph with people and relationships.
- An import validates the entire archive before writing and commits the graph atomically.
- No `HERITG00` or `HERITG01` binary-property-list format is part of this specification.

## 2. Top-Level Representations

An unencrypted `.heritg` file is the ZIP payload described in section 3. Its first four bytes are the ZIP local-file signature `50 4b 03 04`.

An encrypted `.heritg` file is the binary envelope in section 8. Its first eight bytes are ASCII `HTGENC01`. Decryption yields the exact ZIP payload from section 3.

The filename extension is `.heritg`. The media type for an unencrypted payload is `application/vnd.heritg.family-archive+zip`; encrypted files use `application/vnd.heritg.family-archive`.

All archive and uncompressed payload sizes include their complete byte representation and are limited to 33,554,432 bytes (32 MiB).

## 3. ZIP Payload

Format 1.0.0 uses classic, non-ZIP64 ZIP records and only the store method:

- Compression method is `0` (stored) for every entry.
- General-purpose flags are exactly `0x0800` (UTF-8 names).
- Local and central sizes and CRC-32 values are present; data descriptors are forbidden.
- Entry extras, comments, archive comments, split disks, ZIP encryption, and bytes outside records are forbidden.
- Each local record is contiguous, non-overlapping, and precedes the central directory.
- Writers use version-needed `20`, DOS time `00 00`, and DOS date `21 00` (1980-01-01).
- Paths use `/`, are relative, have no empty, `.` or `..` component, and contain no NUL or backslash.
- Directory and duplicate entries are forbidden. Unix symbolic-link entries are forbidden.
- Readers reject every compression method, including deflate. This removes compression-bomb and compression-ratio ambiguity.

The required entries are at the archive root:

```text
manifest.json
tree.json
people.jsonl
relationships.jsonl
checksums.sha256
media/<lowercase-sha256>.<ext>   # zero or more
```

No other entry is allowed. ZIP entry ordering is not semantic. The Apple writer emits entries in ascending path order.

## 4. JSON Encoding

JSON and JSON Lines are UTF-8 without a byte-order mark. JSON keys are ASCII. Writers emit compact JSON with lexicographically sorted keys and no escaped `/`; readers do not depend on key ordering. Unknown JSON object fields are ignored. Non-nullable documented fields are required. Writers may emit nullable fields as JSON `null` or omit them; readers interpret both forms as null.

Each JSON Lines record is one compact JSON object followed by LF (`0a`). Empty collections are zero-byte files. Blank lines and a missing final LF are invalid.

### Instants

`createdAt` and `updatedAt` are UTC instants in exactly `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` form, for example `2026-01-02T03:04:05.000Z`. Offset forms and omitted milliseconds are invalid.

### Calendar Dates

`birthDate`, `deathDate`, and `marriageDate` are calendar dates in exactly `yyyy-MM-dd` form or `null`. They carry no time zone or time of day. An importer reconstructs the same Gregorian year, month, and day in the destination's current time zone; a runtime `Date` timestamp is not portable for these fields.

## 5. Records

### `manifest.json`

```json
{
  "counts": {"media": 0, "people": 1, "relationships": 0},
  "createdAt": "2026-01-02T03:04:05.000Z",
  "format": "heritg-family-archive",
  "formatVersion": "1.0.0",
  "hashAlgorithm": "sha256",
  "schemaVersion": 1,
  "treeId": "fixture-tree"
}
```

The reader accepts exactly `formatVersion` `1.0.0` and `schemaVersion` `1`. Counts must equal decoded records and distinct media entries.

### `tree.json`

| Field | JSON type | Meaning |
|---|---|---|
| `schemaVersion` | integer | `1` |
| `id` | string | Portable tree ID |
| `title` | string | Non-empty display title |
| `createdAt` | instant string | Creation instant |
| `updatedAt` | instant string | Last-update instant |
| `lastSelectedPersonId` | string or null | Must reference a person in this archive |

### `people.jsonl`

Each object has these fields:

| Field | JSON type |
|---|---|
| `schemaVersion` | integer (`1`) |
| `id`, `treeId`, `displayName` | string |
| `gender` | `unspecified`, `female`, or `male` |
| `createdAt` | instant string |
| `birthDate`, `deathDate` | calendar-date string or null |
| `birthDatePrecision` | `exact`, `month`, or `year` |
| `notes`, `addressLine`, `city`, `province`, `country`, `postalCode` | string |
| `profilePhoto` | media-reference object or null |

A media-reference object is:

```json
{
  "byteSize": 123,
  "mimeType": "image/png",
  "path": "media/<sha256>.png",
  "sha256": "<64 lowercase hex digits>"
}
```

The path, hash, byte size, MIME type, extension, and actual media bytes must all agree.

### `relationships.jsonl`

| Field | JSON type |
|---|---|
| `schemaVersion` | integer (`1`) |
| `id`, `treeId`, `fromPersonId`, `toPersonId` | string |
| `kind` | `parent`, `partner`, or `sibling` |
| `subtype` | one value permitted below |
| `createdAt` | instant string |
| `marriageDate` | calendar-date string or null |

Permitted subtype sets are:

- `parent`: `biologicalParent`, `adoptiveParent`, `fosterParent`, `guardian`, `stepParent`
- `partner`: `partner`, `spouse`, `formerPartner`, `formerSpouse`
- `sibling`: `sibling`, `halfSibling`, `adoptiveSibling`, `fosterSibling`, `stepSibling`

Parent endpoint order is directed. Partner and sibling endpoint order is semantically symmetric. A second relationship with the same kind and endpoint pair is invalid even when symmetric endpoints are reversed.

## 6. Media

Media is content-addressed with SHA-256. Identical photos share one entry. The extension and MIME type are derived from these signatures in order:

| Signature | Extension | MIME type |
|---|---|---|
| `89 50 4e 47 0d 0a 1a 0a` | `png` | `image/png` |
| `ff d8 ff` | `jpg` | `image/jpeg` |
| ASCII `GIF87a` or `GIF89a` | `gif` | `image/gif` |
| ASCII `RIFF` at 0 and `WEBP` at 8 | `webp` | `image/webp` |
| ISO BMFF `ftyp` with brand `heic`, `heix`, `hevc`, `hevx`, `mif1`, or `msf1` | `heic` | `image/heic` |
| Anything else | `bin` | `application/octet-stream` |

Every media entry must be referenced by at least one person, and every reference must resolve.

## 7. Checksums

`checksums.sha256` contains one line for every other ZIP entry and never a line for itself. Each line is exactly:

```text
<64 lowercase hexadecimal SHA-256 bytes><two ASCII spaces><entry path><LF>
```

There are no blank lines or CR bytes. Paths may be listed in any order; the Apple writer sorts them. The checksum path set must exactly equal the ZIP entry set excluding `checksums.sha256`. Checksum validation completes before any JSON is trusted.

## 8. Encrypted Envelope

All multibyte integers are unsigned big-endian. The envelope is:

| Offset | Size | Value |
|---:|---:|---|
| 0 | 8 | ASCII `HTGENC01` |
| 8 | 2 | Envelope version `1` |
| 10 | 1 | KDF ID `1` (PBKDF2-HMAC-SHA256) |
| 11 | 1 | Cipher ID `1` (AES-256-GCM) |
| 12 | 4 | Iteration count `600000` (`00 09 27 c0`) |
| 16 | 16 | Random salt |
| 32 | 12 | Random GCM nonce |
| 44 | variable | Ciphertext of the complete ZIP payload |
| EOF-16 | 16 | GCM authentication tag |

The password is Unicode NFC-normalized, then encoded as UTF-8. PBKDF2-HMAC-SHA256 derives a 32-byte key using the stored 16-byte salt and exactly 600,000 iterations. AES-256-GCM encrypts the complete ZIP. Bytes 0 through 43 are the authenticated additional data. Salt and nonce must be newly generated with a cryptographically secure random source for every production archive.

User interfaces for new encrypted exports require at least 15 NFC-normalized Unicode code points, permit spaces and Unicode, and impose no character-class rules. Readers do not enforce that minimum so older archives remain recoverable.

The deterministic compatibility vector in `ios/HeritgTests/HeritgArchiveTests.swift` uses salt `000102030405060708090a0b0c0d0e0f`, nonce `101112131415161718191a1b`, and the NFC-equivalent passwords `Cafe\u0301 family` / `Caf\u00e9 family`. For that test payload, the complete encrypted-envelope SHA-256 is `2806b437258da23ca3e0f1f57df81ae69467869ed9d9e8e0c84e00cb9bcd2780`.

## 9. Validation and Import

Readers enforce these limits before commit:

| Item | Limit |
|---|---:|
| Archive or total uncompressed entry bytes | 32 MiB |
| People | 100,000 |
| Relationships | 300,000 |
| Distinct media entries | 50,000 |
| ID, title, display name, or address component | 4,096 UTF-8 bytes |
| Notes per person | 1 MiB UTF-8 bytes |
| One media item | 10 MiB |

Tree IDs must match on every record. Person and relationship IDs must be unique. Selection and relationship endpoints must resolve. Self-relationships, invalid subtype/kind pairs, duplicate relationship semantics, and death before birth are invalid.

On import, portable tree, person, and relationship IDs are preserved. Before insertion, the importer checks all three ID namespaces against the existing store. Any collision rejects the complete archive with no merge or ID rewriting. This makes first import stable and repeated import explicit. All models are inserted in a non-autosaving context and saved once; any failure rolls back.

## 10. Compatibility Fixtures

Synthetic exploded fixture material lives under `tests/compatibility/heritg-v1/`. It contains no real family data. Each platform should produce a `.heritg` ZIP from those exact entry bytes and confirm equivalent decoded records. Security suites additionally cover unsupported versions, missing media, broken references, corrupt checksums, path traversal, duplicate entries, links, oversized inputs, wrong passwords, and authenticated-header/ciphertext/tag tampering.
