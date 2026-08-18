# HERITG for iOS

HERITG is a private, local-first family tree app for creating and preserving
family history. Family data stays on the user's device by default, without
requiring an account or an internet connection.

The project is maintained by Hamanto Studio and is under active development.

## Features

- Create and manage local family trees
- Add and edit people and family relationships
- Navigate a visual family tree
- Import and export GEDCOM family data
- Export family trees as images and SVG documents
- Store data locally with Core Data
- Use the app in English or Bahasa Indonesia

## Requirements

- macOS with Xcode 26.1 or later
- iOS 16.0 or later

## Build and Run

1. Open `Heritg.xcodeproj` in Xcode.
2. Select the `HERITG` scheme.
3. Select an iOS Simulator or a connected device.
4. Build and run with `Cmd-R`.

The app uses SwiftUI and Core Data and does not require external package
dependencies or a backend account.

## Tests

Run the unit and UI test targets from Xcode with `Cmd-U`, or run the unit tests
from the command line:

```sh
xcodebuild test \
  -project Heritg.xcodeproj \
  -scheme HERITG \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

## Project Layout

```text
Heritg/          Application source and resources
HeritgTests/     Unit tests
HeritgUITests/   UI tests
fastlane/        App Store screenshot automation
```

## Privacy

HERITG is designed around private-by-default, offline-first data storage. Its
core family-tree experience does not require an account, advertising SDK,
behavioral tracking, or a network connection.

- [Privacy Policy](../PRIVACY.md)
- [Data Processing Register](../docs/DATA_PROCESSING.md)
- [Analytics Policy and Event Catalog](../docs/ANALYTICS.md)

## Security

Do not commit credentials, production Firebase configuration, signing keys, or
local environment files. Every push and pull request is scanned with Gitleaks.
See [`../SECURITY.md`](../SECURITY.md) before adding a service or configuring CI.

Any product analytics must follow the public, privacy-preserving event contract
in [`../docs/ANALYTICS.md`](../docs/ANALYTICS.md).

## Trademark

HERITG and the HERITG logo are trademarks of Hamanto Studio. The MIT License
does not grant permission to use these trademarks or imply endorsement by
Hamanto Studio.

## License

The source code is licensed under the [MIT License](../LICENSE).
