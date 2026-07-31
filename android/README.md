# HERITG for Android

HERITG for Android is the native Kotlin and Jetpack Compose implementation of
the private, local-first family tree app. It uses Room for family data and
DataStore for app preferences.

## Features

- Create and manage local family trees
- Add, link, edit, and remove people and family relationships
- Navigate an interactive family-tree canvas
- Import and export GEDCOM family data
- Transfer `.heritg` archives between Android and iOS
- Optionally encrypt `.heritg` archives with a password
- Export family trees as PNG and SVG
- Use the app in English or Bahasa Indonesia

## Requirements

- Java 17
- Android SDK 37
- Android 8.0 / API 26 or later

## Build and Test

From this directory, run:

```sh
./gradlew \
  test assembleDebug lintDebug assembleDebugAndroidTest assembleRelease \
  --no-configuration-cache
```

Instrumented tests require a connected Android device or running emulator:

```sh
./gradlew connectedDebugAndroidTest --no-configuration-cache
```

## Architecture

- `app/`: Compose UI, Android file/photo/share integration, and UI tests
- `core/data/`: Room persistence and transactional repositories
- `core/domain/`: relationship, validation, kinship, and localization behavior
- `core/tree/`: deterministic layout, generation filtering, and connectors
- `core/interop/`: `.heritg`, encryption, GEDCOM, PNG, and SVG contracts

The Android application is intentionally offline. Its manifest requests no
network, analytics, advertising, camera, contact, location, media-library, or
broad storage permissions. Automatic Android backup and device transfer are
disabled until they can be designed and documented without weakening HERITG's
privacy guarantees.
