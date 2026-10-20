#!/usr/bin/env bash
#
# Downloads the pinned sherpa-onnx Android runtime into the DaymarkVoice plugin
# module. Build-time only; the app itself never downloads anything.
#
# sherpa-onnx runs the Parakeet TDT 0.6B v3 int8 model on the device. The
# runtime is not committed; the module's abiFilters keep only the arm64-v8a
# native libraries in the shipped bundle.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../../.."
MODULE="$REPO/artifacts/weather-app/android/daymark-voice"
LIBS="$MODULE/libs"

AAR_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar"
AAR_SHA256="633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96"
AAR_NAME="sherpa-onnx-1.13.8.aar"

if [ ! -d "$MODULE" ]; then
  echo "error: DaymarkVoice plugin module not found at $MODULE" >&2
  exit 1
fi

mkdir -p "$LIBS"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "downloading the sherpa-onnx Android runtime..."
curl -sL --fail -o "$TMP/$AAR_NAME" "$AAR_URL"

actual="$(shasum -a 256 "$TMP/$AAR_NAME" | awk '{print $1}')"
if [ "$actual" != "$AAR_SHA256" ]; then
  echo "checksum mismatch for $AAR_NAME: $actual != $AAR_SHA256" >&2
  exit 1
fi
echo "ok: $AAR_NAME"

cp "$TMP/$AAR_NAME" "$LIBS/$AAR_NAME"
echo "installed: $LIBS/$AAR_NAME"
ls -la "$LIBS"
