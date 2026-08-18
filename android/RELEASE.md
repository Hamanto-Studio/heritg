# HERITG Android Release

Run every command in this guide from `android/` unless a step says otherwise.
Do not infer Play Console state from this document; inspect the application before
each release.

## Verified Project Baseline

The current repository configuration is:

| Item | Value |
| --- | --- |
| Application ID | `tech.robihamanto.heritg.android` |
| Modules | `:app`, `:core` |
| Minimum Android version | Android 8.0 / API 26 |
| `compileSdk` / `targetSdk` | 37 / 37 |
| Java and Kotlin JVM target | 17 |
| Current `versionName` | `1.0.0` |
| Current `versionCode` | `2` |
| Release optimization | R8 minification and resource shrinking enabled |

HERITG stores family data locally with Room and preferences with DataStore. The
Android manifest requests no network permission and the app has no account,
analytics, advertising, or network service. User-controlled transfer is through
always-encrypted `.heritg` archives, optionally protected by a password, and
GEDCOM import/export. Tree charts can be exported as PNG or SVG. The shipped
interfaces are English and Indonesian.

Re-check these facts against `app/build.gradle.kts`, `core/build.gradle.kts`, the
merged release manifest, dependencies, and the release binary. Update this guide
and the privacy disclosures if the implementation changes.

## Release Contract

Follow [`../docs/RELEASES.md`](../docs/RELEASES.md) and
[`../CHANGELOG.md`](../CHANGELOG.md). Android versions are independent from Web
and iOS and never use a `v` prefix:

- Branch: `release/android/<version>`
- Immutable tag: `android-<version>`
- Changelog heading: `## [android-<version>] - YYYY-MM-DD`
- GitHub Release title: `Heritg Android <version>`

Set semantic `versionName` in `app/build.gradle.kts`. Inspect Play and set a
strictly greater, unused `versionCode`; current code `2` is not proof that it is
unused. Move only Android entries from `Unreleased` into the dated release
section with at least one meaningful user-facing entry. Archive/schema versions
remain independent. Merge the reviewed metadata to `main`, then create and retain
the release branch from that verified commit.

With `VERSION` set to the reviewed `versionName`:

```sh
: "${VERSION:?set VERSION to the reviewed semantic version}"
git status --short
git switch -c "release/android/$VERSION"
git push -u origin "release/android/$VERSION"
```

Never reuse a Play code or move a published tag. Corrections use a patch version
and a new code.

### Beta Contract

For HERITG, an Android beta means distribution only through the Play
`internal` testing track. Keep `versionName` unchanged for iterations of the
same candidate, increment `versionCode` to a value greater than every accepted
Play upload, and leave changes under `Unreleased > Android` in `CHANGELOG.md`.
A beta does not create a production release branch, tag, or GitHub Release and
must never update or promote the production track.

## Prerequisites

- macOS Keychain access, Java 17, and Android SDK 37 are installed.
- The Gradle wrapper is used rather than a system Gradle installation.
- The release is built from a reviewed, clean release-branch commit.
- The upload keystore is stored at `~/.config/gpc/heritg-upload.jks`, with alias
  `heritg-upload`.
- Keychain contains passwords under account `tech.robihamanto.heritg.android`
  and service names `heritg.android.upload-store-password` and
  `heritg.android.upload-key-password`.
- `playconsole-cli` is installed and authenticated through a local profile,
  normally in `~/.playconsole-cli/config.json`.
- `gh` is authenticated if the GitHub Release will be published from the CLI.

The upload keystore, signing passwords, Play service-account credentials, and
Play profile are local operator setup and are intentionally absent from this
repository. Never commit them, paste them into release notes, or place them in
Gradle properties tracked by Git. Back up the upload keystore using the studio's
approved secure process before the first upload.

Confirm Java with `java -version`, Gradle with `./gradlew --version`, the keystore
with `test -f "$HOME/.config/gpc/heritg-upload.jks"`, and both Keychain entries
with `security find-generic-password -a "tech.robihamanto.heritg.android" -s
"<service name>"` without `-w`.

### Verify Play CLI Syntax

`playconsole-cli` syntax varies between versions. Before using any publishing
command, inspect the installed version and the exact subcommand help; do not
assume examples in this file still match a future version:

```sh
playconsole-cli version
playconsole-cli doctor
playconsole-cli bundles upload --help
playconsole-cli tracks promote --help
playconsole-cli tracks complete --help
playconsole-cli tracks halt --help
playconsole-cli testing testers list --help
```

The command forms below were verified while writing this guide against locally
installed `playconsole-cli 0.5.15`. Re-verify them for every release. The CLI
configuration proves only local authentication setup; it does not prove that the
app, tracks, testers, countries, or listing are configured.

## Play Store Listing

Review both Play listing locales before production:

- English: `en-US`
- Indonesian: `id`
- Title limit: 30 characters
- Short description limit: 80 characters
- Full description limit: 4,000 characters

Keep claims limited to behavior tested in the release AAB. Do not show or paste
real names, dates, relationships, notes, photos, archives, tester identities, or
credentials in metadata or screenshots.

### Draft English Copy

```text
Title
HERITG

Short description
Private offline family trees with encrypted backups and portable exports.

Full description
HERITG is a private, local-first family tree app. Create and preserve family trees on your Android device without an account or internet connection.

Key features:
- Create and manage local family trees
- Add, link, edit, and remove people and family relationships
- Explore an interactive family-tree canvas and search your people
- Add and crop profile photos
- Import and export GEDCOM family data
- Create encrypted .heritg backups for transfer between Android and iOS, with an optional password
- Export family-tree charts as PNG or SVG
- Use the app in English or Indonesian

Family data stays on your device unless you choose to import, export, or share a file. HERITG contains no account, ads, or behavioral analytics.
```

### Draft Indonesian Copy

```text
Title
HERITG

Short description
Silsilah keluarga pribadi offline dengan cadangan terenkripsi dan ekspor.

Full description
HERITG adalah aplikasi silsilah keluarga yang pribadi dan mengutamakan penyimpanan lokal. Buat dan simpan silsilah keluarga di perangkat Android tanpa akun atau koneksi internet.

Fitur utama:
- Membuat dan mengelola silsilah keluarga lokal
- Menambah, menghubungkan, mengedit, dan menghapus orang serta hubungan keluarga
- Menjelajahi kanvas silsilah interaktif dan mencari anggota keluarga
- Menambah dan memangkas foto profil
- Mengimpor dan mengekspor data keluarga GEDCOM
- Membuat cadangan .heritg terenkripsi untuk dipindahkan antara Android dan iOS, dengan kata sandi opsional
- Mengekspor bagan silsilah sebagai PNG atau SVG
- Menggunakan aplikasi dalam bahasa Indonesia atau Inggris

Data keluarga tetap di perangkat kecuali Anda memilih untuk mengimpor, mengekspor, atau membagikan berkas. HERITG tidak memiliki akun, iklan, atau analitik perilaku.
```

Remove any claim that is unavailable in the release build. Have a fluent reviewer
check both locales before syncing them.

For repeatable updates, put `title.txt`, `short_description.txt`, and
`full_description.txt` under `play/metadata/en-US/` and `play/metadata/id/`.
After checking CLI help, run `listings sync` with `--dry-run` and review the exact
diff before running it without `--dry-run`.

## Store Graphics

- Store icon: 512x512 PNG using production artwork.
- Feature graphic: 1024x500 JPG or PNG without transparency.
- Phone screenshots: 2-8 per locale with deterministic, fictional family data.
- Add tablet screenshots only after tablet support is tested.

Show the library, canvas, person/relationship editing, encrypted backup/export,
and language settings. Localize `en-US` and `id`; never capture a real family
archive or debug build. No fastlane screenshot automation is documented for
HERITG Android, so do not claim it exists. If assets are placed under
`play/images/<locale>/`, inspect `images sync --help` and review a `--dry-run`
before syncing.

## Store Configuration And Data Safety

Review these fields manually for the exact AAB. This guide intentionally does not
choose the category, tags, target audience, content rating, countries/regions,
pricing, tester groups, or rollout percentage.

- Privacy policy: `https://family.heritg.us/privacy/`
- Marketing website: `https://family.heritg.us/`
- Support contact: `https://t.me/robihamanto`
- App access: no HERITG account or login is required. Explain how to create a
  local tree and import only synthetic test files if Play requests instructions.
- Ads: the shipped app has no advertising SDK or advertising identifier use.
- Data Safety: reconcile the answers with the merged manifest, dependencies,
  runtime behavior, `../docs/DATA_PROCESSING.md`, and Play's current definitions.
  The verified implementation has no network permission and sends no family
  data, analytics, or diagnostics to HERITG. User-selected imports and exports
  are processed locally and sent only to a destination the user chooses.
- Data deletion: users can delete trees in the app or uninstall to remove local
  app data. Files already exported to user-controlled storage must be managed by
  the user. There is no HERITG account to delete.
- Backup: automatic Android backup and device transfer are disabled. Do not imply
  that Play backup replaces an exported `.heritg` archive.
- Permissions: investigate any permission or SDK appearing in the merged release
  manifest before upload; do not dismiss it as transitive without evidence.
- Device catalog: review exclusions caused by API 26 minimum support and the
  release artifact before promotion.

Record all unresolved Play Console decisions as release TODOs. Do not state that
testers, listing assets, countries, or production access are live until verified
in the console.

## Release Notes

Derive Play and GitHub release notes from the exact `[android-<version>]` section
of `CHANGELOG.md`, not from a commit list. Play notes must be concise,
user-facing, and localized in `play/release-notes/en-US.txt` and
`play/release-notes/id.txt`. Exclude internals, private data, credentials, and
unverified fixes. CLI 0.5.15 accepts one notes/language pair per upload; add and
verify the other locale in Play Console rather than re-uploading the same bundle.

## Verify And Build

Run the full release gate with signing values injected from Keychain:

```sh
./gradlew clean test lintRelease :app:bundleRelease --no-configuration-cache \
  -Pandroid.injected.signing.store.file="$HOME/.config/gpc/heritg-upload.jks" \
  -Pandroid.injected.signing.store.password="$(security find-generic-password -a "tech.robihamanto.heritg.android" -s "heritg.android.upload-store-password" -w)" \
  -Pandroid.injected.signing.key.alias="heritg-upload" \
  -Pandroid.injected.signing.key.password="$(security find-generic-password -a "tech.robihamanto.heritg.android" -s "heritg.android.upload-key-password" -w)"
```

Expected release outputs:

- AAB: `app/build/outputs/bundle/release/app-release.aab`
- R8 mapping: `app/build/outputs/mapping/release/mapping.txt`

Confirm both files with `test -s`, verify the AAB with `jarsigner -verify`, and
record its `shasum -a 256` checksum.

Retain the exact mapping and AAB checksum with the release record. Do not commit
generated artifacts or the mapping unless repository policy is explicitly
changed to provide secure artifact storage.

Because shrinking is enabled, smoke-test an installed release build: fresh launch
and tree creation on API 26 and API 37; upgrade from the latest public build when
one exists; person, photo, relationship, search, canvas, and deletion flows;
English and Indonesian; `.heritg` restore with and without a password using
synthetic cross-platform fixtures; GEDCOM and PNG/SVG round trips; airplane-mode
operation; and rejection of invalid imports without partial data.

## Beta: Play Internal Testing

HERITG beta builds use the Play `internal` track. Set the version code only
after inspecting the live application:

```sh
: "${VERSION_CODE:?set VERSION_CODE to the tested, unused integer code}"
INTERNAL_TRACK='internal'
```

Inspect current tracks, bundles, and testers without assuming their state:

```sh
playconsole-cli tracks list --package tech.robihamanto.heritg.android --pretty
playconsole-cli bundles list --package tech.robihamanto.heritg.android --pretty
playconsole-cli testing testers list --package tech.robihamanto.heritg.android --track "$INTERNAL_TRACK" --pretty
```

Load reviewed English release notes and upload the signed AAB. The verified CLI
commits uploads by default; stop if its current help describes different behavior:

```sh
RELEASE_NOTES_EN="$(<play/release-notes/en-US.txt)"
playconsole-cli bundles upload --package tech.robihamanto.heritg.android --file app/build/outputs/bundle/release/app-release.aab --track "$INTERNAL_TRACK" --release-notes "$RELEASE_NOTES_EN" --release-notes-lang en-US --pretty
```

Confirm that Play reports the intended package, `versionName`, `versionCode`,
signing identity, target SDK, device availability, and internal track. Add and
verify Indonesian release notes in Play Console. Confirm tester access explicitly;
placing a bundle on a testing track does not configure testers.

Use the Play-generated artifact on physical devices for the smoke tests. Do not
promote a locally sideloaded artifact as proof that Play delivery works.

## Production And Staged Rollout

Promote the exact tested `VERSION_CODE` from the `internal` track instead of
uploading the AAB again. Choose `ROLLOUT_PERCENT` as a reviewed release decision;
this guide does not prescribe or assume a percentage.

```sh
INTERNAL_TRACK='internal'
: "${VERSION_CODE:?set VERSION_CODE to the tested code}"
: "${ROLLOUT_PERCENT:?set ROLLOUT_PERCENT to the approved number from 0 to 100}"

playconsole-cli tracks promote --package tech.robihamanto.heritg.android --from "$INTERNAL_TRACK" --to production --version-code "$VERSION_CODE" --rollout-percentage "$ROLLOUT_PERCENT" --dry-run --pretty
```

Review the dry-run output, then remove `--dry-run` and run the same command. Verify
the result rather than treating a zero exit status as proof of publication:

```sh
playconsole-cli tracks list --package tech.robihamanto.heritg.android --pretty
```

After the staged release is healthy and approved, complete and verify it:

```sh
playconsole-cli tracks complete --package tech.robihamanto.heritg.android --track production --pretty
```

Then run `tracks list` again.

## Monitoring And Rollback

During internal testing and staged production, monitor Play vitals, crashes, ANRs,
startup failures, install/device exclusions, reviews, support reports, and the
tested import/export flows. Since HERITG has no analytics or crash-reporting SDK,
do not claim in-app telemetry that does not exist; use Play-provided aggregate
signals and user-initiated support reports. Never request real family archives in
public support channels.

For a serious staged-rollout regression, halt production first:

```sh
playconsole-cli tracks halt --package tech.robihamanto.heritg.android --track production --pretty
```

Confirm the halted state with `tracks list`. A completed Play release cannot be
downgraded by reusing or lowering its version code. Fix the issue on `main`, use a
new patch `versionName` and a greater unused `versionCode`, repeat internal testing,
and publish a new release. Preserve compatibility with archives created by the
affected version. Do not move or delete an existing release tag.

## Publish The Release Record

After production verification, tag its exact commit and publish the exact Android
changelog section. Set `VERSION` and `RELEASE_NOTES_FILE` first:

```sh
: "${VERSION:?set VERSION to the released versionName}"
: "${RELEASE_NOTES_FILE:?set RELEASE_NOTES_FILE to the exact Android changelog section}"
git status --short
git tag -a "android-$VERSION" -m "Heritg Android $VERSION"
git push origin "android-$VERSION"
gh release create "android-$VERSION" --repo Hamanto-Studio/heritg --title "Heritg Android $VERSION" --notes-file "$RELEASE_NOTES_FILE"
```

Verify the immutable tag points to production and its title and notes match the
changelog.

## Security And Final Checklist

- [ ] Version/date, unused greater code, branch, changelog, and clean commit match.
- [ ] Java 17, SDK 37, API 26, package, modules, tests, lint, R8, and shrinking pass.
- [ ] Signed AAB, checksum, mapping, local-data upgrade, archive, GEDCOM, PNG/SVG,
  locale, and offline tests pass with no known data-loss defect.
- [ ] No network, analytics, ads, account, unexpected permission, credential,
  private family data, or generated release artifact entered Git or the binary.
- [ ] EN/id listing, graphics, notes, privacy, Data Safety, ads, access, backup,
  deletion, and support information match the shipped AAB.
- [ ] TODO: confirm Play app signing; category/tags; audience/rating; regions and
  pricing; internal track/testers/devices; final assets; and unused version code.
- [ ] TODO: approve rollout percentage, monitoring window, approver, and rollback
  owner; verify internal and production delivery rather than assuming live state.
- [ ] Immutable `android-<version>` tag and `Heritg Android <version>` GitHub
  Release point to production and contain the exact changelog section.
