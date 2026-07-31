# HERITG Data and Portability Specification

Status: Draft v0.1<br>
Companion: [MVP_PRODUCT_SPEC.md](MVP_PRODUCT_SPEC.md)

## 1. Design Rules

- The canonical model is a graph; a visual tree is one projection.
- SwiftData is the iOS runtime store and Room is the Android runtime store.
- `.heritg` is the complete backup and cross-platform transfer format.
- GEDCOM is for interoperability, not runtime persistence or complete backup.
- Portable IDs never depend on SwiftData identifiers, Room rows, CloudKit records, or platform APIs.
- Every import is an untrusted-input operation and commits atomically.

## 2. Canonical Data Model

### Tree

- `id`
- `title`
- `description`
- `home_person_id`
- `created_at`
- `updated_at`
- `schema_version`
- `preferred_locale`

### Person

- `id`
- `tree_id`
- `display_name`
- `living_status`: living, deceased, unknown
- `sex`: female, male, intersex_or_other, unknown, not_recorded
- `biography`
- `created_at`
- `updated_at`
- `deleted_at` for recoverable local deletion

### PersonName

- `id`
- `person_id`
- `full_text`
- `type`: official, birth, former, married, customary, religious, Chinese, childhood, nickname, other
- `given`, `surname`, `patronymic`, `clan`, and `title` as optional annotations
- `language_tag`
- `script`
- `valid_from`, `valid_to`
- `is_preferred`

Only `full_text` is required. Structured fields assist search and export but never replace the original name.

### Relationship

- `id`
- `tree_id`
- `from_person_id`
- `to_person_id`
- `type`: biological_parent, adoptive_parent, step_parent, foster_parent, guardian, partner, spouse, divorced_partner, other
- `status`: asserted, uncertain, disputed
- `start_date`, `end_date`
- `notes`
- `created_at`, `updated_at`, `deleted_at`

Relationships are directed where meaning requires direction. The domain layer exposes inverse labels such as child or ward.

### Place

- `id`
- `display_name`
- `historical_name`
- `latitude`, `longitude`
- `country_code`

### Media

- `id`
- `tree_id`
- `sha256`
- `original_filename`
- `mime_type`
- `byte_size`
- `created_at`
- `caption`
- `privacy`: private, family
- `local_relative_path`

Media links connect a media item to people or the tree without duplicating the binary file.

## 3. Portable Archive

Use extension `.heritg` and MIME type `application/vnd.heritg.family-archive+zip`.

The format is a documented ZIP container, not an opaque SwiftData or Room database copy. This avoids native-store coupling and supports independent validation and migration.

### Required Contents

```text
manifest.json
data/tree.json
data/people.jsonl
data/names.jsonl
data/relationships.jsonl
data/places.jsonl
data/media-links.jsonl
media/<sha256>.<extension>
imports/<optional-original-file>
checksums.sha256
```

JSON Lines allows streaming large collections without loading an entire tree into memory.

### Manifest

```json
{
  "format": "heritg-family-archive",
  "formatVersion": "1.0.0",
  "createdAt": "2026-07-28T12:00:00Z",
  "createdBy": {
    "app": "HERITG",
    "appVersion": "1.0.0",
    "platform": "android"
  },
  "tree": {
    "id": "0198...",
    "title": "Keluarga Hamanto"
  },
  "counts": {
    "people": 42,
    "relationships": 58,
    "media": 12
  },
  "hashAlgorithm": "sha256",
  "encryption": null
}
```

## 4. Compatibility Rules

- Semantic version the archive independently from the app and database.
- A reader must accept newer patch versions.
- A reader may accept newer minor versions when all unknown fields are optional.
- A reader must reject an unsupported major version before writing data.
- Unknown JSON fields must be ignored during import and preserved when practical.
- Required fields may never be removed within a major version.
- All text is UTF-8 and all JSON keys are ASCII.
- Archive paths are relative and normalized.
- Imports prevent ZIP path traversal and reject links or unexpected nested archives.
- Imports enforce uncompressed-size, record-count, compression-ratio, and field-size limits.
- Every file is verified against `checksums.sha256` before database commit.
- Structural and referential validation completes before the transaction commits.
- A failed import leaves no partial tree or orphaned media.

## 5. Password Protection

Password-protected archives are P1 unless a well-reviewed cross-platform implementation is available before launch.

When implemented:

- Encrypt content using authenticated encryption.
- Derive keys with a memory-hard KDF and archive-specific salt.
- Store only algorithm identifiers and KDF parameters outside encrypted content.
- Publish the format and cross-platform test vectors.
- Never implement proprietary cryptography.

## 6. GEDCOM Interoperability

- Import GEDCOM 5.5.1 and 7.0.
- Accept common legacy encodings for 5.5.1 and normalize internally to UTF-8.
- Export GEDCOM 7.0 as the default standards-based format.
- Export GEDZIP when media should be included.
- Add GEDCOM 5.5.1 export in P1 based on compatibility testing and user demand.
- Preserve imported source identifiers and unknown extensions separately from canonical fields.
- Generate a plain-language compatibility report for every import and export.
- Never claim lossless interchange when the destination cannot represent a field or relationship.

## 7. Required Compatibility Fixtures

- Minimal archive with one person
- Indonesian names without surnames
- Alternate scripts and language tags
- Biological, adoptive, step, foster, guardian, and partner relationships
- Approximate and incomplete dates
- Media-heavy archive
- 10,000-person archive
- Prior patch and minor format versions
- Unsupported future major version
- Missing media and broken references
- Corrupt checksum
- ZIP path traversal and compression bomb attempts
- GEDCOM 5.5.1 legacy encodings
- GEDCOM 7 and GEDZIP media

Every fixture produced by Android must be restorable on iOS with equivalent canonical records, and vice versa.
