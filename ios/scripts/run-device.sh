#!/bin/zsh

set -euo pipefail

PROJECT_ROOT="${0:A:h:h}"
DEVICE_ID="${1:-0e7133ccd162001521325d66116d33fea404af37}"
DERIVED_DATA="${TMPDIR%/}/HeritgDeviceBuild"
DESTINATION="platform=iOS,id=${DEVICE_ID}"
APP_PATH="${DERIVED_DATA}/Build/Products/Debug-iphoneos/HERITG.app"
BUNDLE_ID="tech.robihamanto.heritg.ios"

cd "$PROJECT_ROOT"

echo "Building Heritg for device ${DEVICE_ID}..."
xcodebuild \
  -project Heritg.xcodeproj \
  -scheme HERITG \
  -configuration Debug \
  -destination "$DESTINATION" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  build

echo "Installing and launching Heritg..."
if xcrun devicectl device install app \
  --device "$DEVICE_ID" \
  "$APP_PATH"; then
  xcrun devicectl device process launch \
    --device "$DEVICE_ID" \
    --terminate-existing \
    "$BUNDLE_ID"
elif command -v ios-deploy >/dev/null && command -v idevicedebug >/dev/null; then
  echo "devicectl could not reach the device; falling back to libimobiledevice..."
  ios-deploy \
    --id "$DEVICE_ID" \
    --bundle "$APP_PATH" \
    --nostart \
    --no-wifi
  idevicedebug \
    --udid "$DEVICE_ID" \
    kill "$BUNDLE_ID" >/dev/null 2>&1 || true
  idevicedebug \
    --udid "$DEVICE_ID" \
    --detach \
    run "$BUNDLE_ID"
else
  echo "Installation failed. Install ios-deploy and libimobiledevice for legacy devices." >&2
  exit 1
fi

echo "Heritg is running on device ${DEVICE_ID}."
