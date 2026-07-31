# HERITG MVP Product Specification

Status: Draft v0.1<br>
Initial market: Indonesia<br>
Platforms: Android and iOS<br>
Product principle: Private by default, offline by default, portable by design.

## 1. Product Summary

HERITG is a private family archive for creating, viewing, preserving, and transferring a family tree without requiring an account or internet connection.

The MVP must prove that a user can:

1. Start a useful family tree in less than five minutes.
2. Represent common Indonesian names and family relationships without forcing a Western surname model.
3. Navigate the same tree experience on Android and iOS.
4. Back up the complete archive and restore it on either platform.
5. Export and import standard genealogy data without losing the original local archive.
6. Retain permanent access to local data without a subscription.

## 2. MVP Goals

### Product Goals

- Deliver a trustworthy local-first family tree editor.
- Establish one shared Android/iOS product and design system.
- Make backup, restore, and data ownership understandable.
- Support culturally flexible names and core family relationships.
- Create a foundation for paid Pro features and optional encrypted sync.

### Success Metrics

- At least 70% of new users create three people and one relationship.
- Median time from launch to first three-person tree is under five minutes.
- At least 95% of valid `.heritg` archives restore successfully in automated compatibility tests.
- A tree exported on Android imports identically on iOS, and vice versa.
- Crash-free sessions exceed 99.5% during beta.
- At least 20% of retained creators perform one backup or export within 30 days.
- At least 3% of activated serious creators purchase the Pro lifetime unlock during pricing validation.

## 3. Target Users

### Primary: Family Archivist

A family member who collects names, relationships, photographs, documents, and stories. They may be preparing for a reunion, preserving an elder's knowledge, or converting a printed family tree.

Needs:

- Fast entry and correction
- Confidence that information remains private
- Reliable backups
- Easy visual navigation
- Flexible names and relationships
- Shareable output

### Secondary: Family Contributor

A relative who provides a correction, photograph, or story. In the local-only MVP, contribution happens on the archivist's device or through an exported archive. Account-based collaboration is post-MVP.

### Secondary: Elder Participant

A person who may prefer large text, simple prompts, photographs, and assisted data entry rather than operating a complex tree independently.

## 4. MVP Scope

### P0: Required for Public MVP

- Create, rename, duplicate, archive, and delete local trees.
- Add and edit people.
- Add parent-child, spouse/partner, adoptive, step, guardian, and foster relationships.
- Store a display name without requiring first or last name.
- Store alternate names, optional name type, and notes.
- Store sex as female, male, intersex/other, unknown, or not recorded without using it to restrict relationships.
- Mark a person as living, deceased, or unknown.
- Add photos from camera, photo library, or file picker.
- Browse the tree canvas and person list.
- Search by any recorded name.
- Show a person's profile, immediate relationships, photos, and notes.
- Undo and redo edits during the active session.
- Create and restore `.heritg` archives.
- Optionally sync the iOS database between the user's Apple devices through SwiftData and their private iCloud/CloudKit database.
- Import GEDCOM 5.5.1 and GEDCOM 7 text files.
- Export GEDCOM 7 and GEDZIP.
- Generate a basic PDF family chart.
- App lock using device authentication when available.
- Bahasa Indonesia and English interface.
- Dynamic Type/text scaling, screen-reader labels, contrast, and reduced-motion support.
- No account, advertising SDK, behavioral tracking, or required network connection.

### P1: Next Release

- Duplicate detection and guided merge.
- Sources and citations with media attachments.
- Voice stories and on-device transcription where supported.
- Advanced PDF layouts and print ordering.
- Custom relationship labels and cultural templates.
- Multiple lineage views such as maternal, paternal, clan, and full network.
- Android cloud backup and cross-platform sync.
- Paid Pro lifetime unlock.

### Not in MVP

- Public family profiles or discoverable trees
- Real-time collaboration
- Historical record search or hints
- DNA testing or matching
- Life events and timelines, including education, occupation, residence, migration, and burial
- Server-side AI processing
- Contact-list upload
- Web editor
- Religious, customary, inheritance, or marriage eligibility rulings
- Automatic ethnicity, religion, clan, or gender inference

## 5. Core User Journeys

### First Tree

1. User opens the app and selects Bahasa Indonesia or English.
2. The app explains in one screen that data stays on the device unless exported.
3. User selects `Create family tree`.
4. User enters their own name or another starting person.
5. The profile appears in the center of the tree.
6. Contextual actions offer `Add parent`, `Add partner`, `Add child`, and `Add sibling`.
7. The app saves every accepted edit locally without a separate Save button.

Acceptance criteria:

- No sign-in, permission request, payment prompt, or tutorial carousel blocks tree creation.
- A name is the only required value for the first person.
- Relaunching the app restores the same tree and viewport focus.

### Add a Relative

1. User selects a person card.
2. User chooses a relationship action.
3. User creates a new person or links an existing person.
4. The app previews the relationship in plain language.
5. User confirms and the tree updates with an undo action.

Acceptance criteria:

- The flow detects obvious duplicate links and impossible self-links.
- The app does not prevent uncommon but valid family structures.
- Relationship type is editable after creation.

### Cross-Platform Transfer

1. User chooses `Backup and export`.
2. User creates a `.heritg` archive and optionally sets a password.
3. User transfers it using the system share sheet, Files, Drive, cable, or another user-controlled method.
4. The receiving Android or iOS app inspects the archive.
5. The app shows archive version, tree name, person count, media count, and warnings.
6. User restores as a new tree; existing trees are not overwritten implicitly.

Acceptance criteria:

- The restored tree has identical stable IDs, people, relationships, notes, and media metadata.
- Import never modifies an existing tree before validation completes.
- Failed import leaves no partial tree or orphaned media.

### GEDCOM Import

1. User chooses a `.ged`, `.gedcom`, or `.gdz` file.
2. The app identifies format version and encoding.
3. The app reports person, family, source, and media counts plus unsupported extensions.
4. User imports into a new local tree.
5. The app stores the import report with the tree.

Acceptance criteria:

- Original input is preserved in the local archive until the user deletes it.
- Unknown GEDCOM extension records are retained for future round-trip export when structurally safe.
- Broken references and missing media produce warnings, not silent data removal.

## 6. Cross-Platform Technical Direction

### Application Framework

Use fully native applications with no cross-platform UI runtime:

- iOS: Swift, SwiftUI, SwiftData, and CloudKit.
- Android: Kotlin, Jetpack Compose, Room, and Android platform APIs.

Reasons:

- Native persistence is required: SwiftData on iOS and Room on Android.
- SwiftUI and Jetpack Compose provide native accessibility, lifecycle, navigation, gestures, and performance tooling.
- CloudKit integration remains within Apple's supported native stack.
- Each platform can follow current security, file, purchase, and background-execution APIs directly.

### Parity Contract

The apps share specifications and fixtures, not executable UI or domain code. Swift and Kotlin implementations must conform to:

- One canonical data and archive specification.
- One design-token source that generates native Swift and Kotlin constants.
- Matching component names, variants, states, semantics, and acceptance tests.
- Matching navigation, forms, validation messages, and relationship behavior.
- Canonical tree-layout fixtures with expected coordinates and visible branches.
- Shared `.heritg` and GEDCOM compatibility fixtures.
- Cross-platform screenshot comparisons with documented allowances for native text rendering.

Each native app separately implements:

- Screens and design-system components.
- Domain models, repositories, validation, and relationship logic.
- Tree layout and canvas rendering.
- Archive, GEDCOM, PDF, search, and entitlement logic.
- Database models and migrations.
- Files, camera, sharing, authentication, secure storage, purchases, and lifecycle integration.

Behavioral parity is a release requirement. Platform-native system surfaces such as pickers, permission prompts, share sheets, and authentication dialogs may look different.

### Local Persistence

- iOS uses SwiftData as its local source of truth.
- SwiftData uses a CloudKit-enabled model configuration to sync through the user's private iCloud database when the user enables iCloud sync and is signed in to iCloud.
- Android uses Room, Google's recommended persistence abstraction over SQLite, as its local source of truth.
- Each app exposes its native store through the same specified repository operations and portable domain fields.
- Native persistence models and migrations must satisfy the canonical model in [DATA_FORMAT.md](DATA_FORMAT.md).
- Store media in each platform's app-private directory; store metadata and content hashes in SwiftData or Room.
- Use native transactions, relationship constraints, integrity checks, and explicit schema migrations.
- Use UUIDv7 identifiers generated by the client for sortable, platform-independent IDs.
- Record timestamps as UTC ISO 8601 strings and retain an optional original timezone or locality.
- Never expose SwiftData identifiers, Room row IDs, CloudKit record IDs, or platform file paths as portable identifiers.

### iCloud Sync

- iCloud sync is optional and never required to create, edit, import, export, or delete a local tree.
- Sync uses the app's private CloudKit database associated with the user's Apple Account; it does not create a HERITG account.
- The UI must show `Local only`, `Syncing`, `Synced`, `Paused`, `iCloud unavailable`, and `Error` states without claiming success prematurely.
- The app must tolerate signed-out accounts, disabled iCloud Drive, quota exhaustion, network loss, and delayed CloudKit updates.
- CloudKit sync provides redundancy and Apple-device synchronization, but is not presented as the user's only backup.
- Users can still create a complete `.heritg` archive and verify it independently.
- CloudKit is not available to the Android app and does not provide Android/iOS synchronization.
- Do not describe iCloud sync as end-to-end encrypted unless the implemented configuration and current Apple documentation support that exact claim.
- Media sync scope and quota behavior must be validated with production CloudKit entitlements before beta.

## 7. Data and Portability Contract

The canonical graph model, `.heritg` archive contract, compatibility rules, and GEDCOM behavior are specified in [DATA_FORMAT.md](DATA_FORMAT.md).

The required boundaries are:

- SwiftData and Room are platform runtime stores, not transfer formats.
- `.heritg` is the complete, versioned Android/iOS backup and transfer format.
- GEDCOM 7, GEDZIP, and GEDCOM 5.5.1 are interoperability formats.
- Stable UUIDv7 identifiers survive backup, restore, and platform transfer.
- Import validates completely before committing a new tree.
- The app reports unsupported or lossy conversions rather than silently discarding data.
- Archive format versions are independent from app and database versions.

## 8. Shared Design System

The visual system is a native SwiftUI and Jetpack Compose adaptation of [Kumo UI](https://kumo-ui.com), pinned initially to Kumo v2.8.0. The complete adaptation contract is specified in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

Required boundaries:

- Do not embed or ship Kumo's React/Tailwind runtime in either app.
- Port Kumo's semantic tokens, surface hierarchy, component variants, states, and accessibility behavior into native code.
- Generate matching Swift and Kotlin tokens from one canonical source.
- Use the same component names and public variants on both platforms.
- Support light and dark mode through semantic tokens rather than raw colors.
- Preserve native VoiceOver, TalkBack, Dynamic Type, font scaling, focus, and touch behavior.
- Maintain Kumo's MIT license notice when adapted source or substantial definitions are included.
- Platform system surfaces may remain native, but app-owned surfaces must follow the HERITG Kumo adaptation.

## 9. Tree Canvas

### Rendering

- Implement `HERITGTreeCanvas` separately with SwiftUI `Canvas` on iOS and Jetpack Compose `Canvas` on Android.
- Use deterministic layout from graph data; the same input and settings produce the same node positions on both platforms.
- Perform layout outside paint operations and cache immutable layout results.
- Render only visible nodes and edges plus an overscan area.
- Use native `HERITGPersonCard` components and native accessibility/semantics overlays on each platform.
- Do not load full-resolution photos into the canvas; use generated thumbnails.

### Initial Layout

MVP uses a focused pedigree layout:

- Selected person in the center.
- Parents above.
- Partners beside the selected person.
- Children below.
- Siblings available through parent branches or an explicit expansion action.
- Collapsed branches display a count.

The complete family graph remains in storage; the canvas intentionally presents a comprehensible projection rather than attempting to show every person simultaneously.

### Gestures

- One-finger drag pans.
- Pinch zooms around the gesture focal point.
- Tap selects a person.
- Double tap centers and zooms to a person.
- Long press opens relationship actions.
- A visible `Center` action returns to the focused person.
- A visible zoom control is provided for accessibility and discoverability.

Platform gesture behavior must be identical unless an OS accessibility setting requires an adaptation.

### Accessibility

The canvas must not be the only navigation method.

- Provide an equivalent structured relationship list.
- Expose each visible person as a semantic element with name, living/deceased state when permitted, relationship to focus, and available actions.
- Preserve logical focus order independent of visual coordinates.
- At large text sizes, allow person cards to expand or switch to list mode.
- Never encode relationship type using color alone.

### Performance Targets

- Maintain 60 frames per second during pan and zoom on the supported baseline device for a 1,000-person tree.
- Open a 10,000-person archive and show the focused branch in under three seconds after database initialization.
- Search 10,000 people in under 300 milliseconds after indexing.
- Keep canvas memory bounded by visible content rather than total tree size.

Exact baseline Android and iOS devices must be selected before implementation benchmarking.

## 10. Privacy and Security Requirements

- No account is required for MVP functionality.
- No advertising identifier, cross-app tracking, contact upload, or third-party behavioral analytics.
- Diagnostics are opt-in and exclude names, relationships, notes, media, filenames, and archive contents.
- Data is stored in the app-private container and excluded from unintended public file access.
- Device authentication can lock app access but does not replace device encryption.
- Export clearly warns when an archive contains living people or unencrypted media.
- Delete operations explain local backups and user-created exported copies.
- Imported files are treated as untrusted input.
- Validate file type, size, structure, references, paths, and decompression limits.
- Do not render imported HTML or execute embedded content.
- Document the data flow and complete platform privacy declarations before beta.

## 11. Monetization Boundaries

MVP may include a non-blocking preview of future Pro features, but core data ownership is permanent.

Always free:

- Local tree access and editing
- Privacy and device lock
- Basic backup and restore
- GEDCOM import and export
- Deletion
- Accessibility

Eligible for lifetime Pro:

- Advanced layouts and reports
- Duplicate detection and merge
- Research and citation tools
- Premium print-ready output
- Productivity automation performed on-device

Eligible for a future subscription:

- End-to-end encrypted Android/iOS hosted sync
- Versioned hosted backups
- Family collaboration
- Hosted storage

Cancellation must never disable access to the authoritative local tree.

## 12. Quality Strategy

### Required Automated Tests

- Domain validation and relationship invariants
- SwiftData and Room migration tests from every released schema
- SwiftData/CloudKit tests for signed-out, offline, quota, conflict, and delayed-sync states
- Archive schema and checksum validation
- Android-to-iOS and iOS-to-Android golden archive fixtures
- Archive forward/backward compatibility fixtures
- Malformed ZIP, ZIP bomb, path traversal, oversized field, and broken-reference tests
- GEDCOM 5.5.1 and 7 official/sample fixture imports
- GEDCOM export validation against available specification tools
- Import-export-import semantic comparison
- Tree layout determinism tests
- Component golden tests on Android and iOS render targets
- Accessibility semantics and text-scaling tests
- Large-tree performance benchmarks

### Release Gates

- No known data-loss defect.
- Backup restoration passes on physical Android and iOS devices.
- A release can open every archive created by all prior public releases.
- Exported GEDCOM passes the selected validator or documents unavoidable warnings.
- Privacy declarations match observed runtime network behavior.

## 13. Delivery Sequence

### Milestone 1: Foundation

- Native iOS Swift workspace and Android Kotlin workspace
- Canonical design tokens with Swift and Kotlin generation
- Matching SwiftUI and Jetpack Compose core components
- Specified repository operations, SwiftData models, Room entities, and migrations
- Matching Swift and Kotlin tree, person, name, and relationship logic
- Native local tree list and person editor on both platforms

### Milestone 2: Tree Experience

- Deterministic focused-tree layout
- Canvas pan, zoom, select, expand, and center
- Person profile and relationship list
- Search
- Accessibility pass

### Milestone 3: Portability

- `.heritg` writer, validator, and importer
- Android/iOS transfer tests
- GEDCOM 5.5.1 and 7 import
- GEDCOM 7/GEDZIP export
- PDF chart export

### Milestone 4: Trust and Release

- Device app lock
- SwiftData/CloudKit sync reliability and failure-state testing
- Import hardening and security tests
- Bahasa Indonesia content review
- Performance and low-memory testing
- Store privacy disclosures
- Closed beta with Indonesian families

## 14. Decisions to Validate Before Coding

- Confirm that `HERITG` is legally and commercially available in launch markets.
- Minimum supported Android API level and iOS version.
- Exact baseline devices and performance budgets.
- Whether encrypted `.heritg` archives are P0 or P1.
- Whether iCloud media sync is enabled in the first public release or initially limited to structured tree data.
- Whether source citations move from P1 to P0 after user interviews.
- Whether the MVP includes unlimited local trees or one active tree.
- Which relationship labels and name types receive first-class Bahasa Indonesia wording.
- Whether Pro is launched with MVP or after retention validation.

## 15. MVP Definition of Done

The MVP is complete when a user can create a culturally flexible local family tree, navigate and edit it through the same shared UI on Android and iOS, optionally synchronize the iOS tree through their private iCloud database, export a validated portable archive, restore that archive without semantic loss on the other platform, exchange standard GEDCOM data with explicit compatibility reporting, and continue accessing local information without a HERITG account, connection, or subscription.
