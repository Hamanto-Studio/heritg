# Google Play release

The project uses [Play Console CLI](https://github.com/AndroidPoet/playconsole-cli) (`gpc`) to upload signed Android App Bundles. The checked-in `.gpc.yaml` selects `tech.robihamanto.heritg.android` and the Play internal testing track.

## One-time Play Console setup

1. Create the app in Play Console with package name `tech.robihamanto.heritg.android`.
2. Complete developer identity verification and the required app-content declarations.
3. Enroll the app in Play App Signing and securely create an upload key.
4. Grant the service account used by `gpc` release access to the new app.
5. Confirm that `gpc apps list` includes `tech.robihamanto.heritg.android`.

The Android Publisher API cannot create the initial Play Console app record.

## Build environment

```sh
export ANDROID_KEYSTORE_PATH="/absolute/path/to/upload-key.jks"
export ANDROID_KEYSTORE_PASSWORD="..."
export ANDROID_KEY_ALIAS="..."
export ANDROID_KEY_PASSWORD="..."
export ANDROID_VERSION_CODE="1"
export ANDROID_VERSION_NAME="1.0.0"
```

Use a `versionCode` strictly greater than every version previously accepted by Play. The initial project default is `1`; do not reuse it after the first accepted upload.

## Verify access

From `android/`:

```sh
gpc doctor
gpc apps get
```

## Build and upload

```sh
./gradlew :app:bundleRelease
gpc bundles upload \
  --file app/build/outputs/bundle/release/app-release.aab \
  --track internal \
  --release-notes "Initial internal release"
```

Use `--dry-run` with the upload command to preview it without applying changes. Promote an internal release only after testing and reviewing Play Console policy status.
