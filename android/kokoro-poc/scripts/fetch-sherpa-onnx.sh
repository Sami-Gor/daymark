#!/usr/bin/env bash
#
# Provisions the patched sherpa-onnx Android runtime into the DaymarkVoice
# plugin module. Build-time only; the app itself never downloads the model or
# runtime (weather and place-search requests are separate network flows).
#
# This artifact is the locally rebuilt v1.13.8 runtime for
# CVE-2026-108954 / GHSA-f5q5-vp8g-wh4x. Upstream v1.13.8 and v2.0.1 still
# contain the unchecked joiner-width path, so the ordinary release AAR must
# not be substituted here. See
# artifacts/weather-app/android/daymark-voice/SHERPA-ONNX-PROVENANCE.md
# for the source commit, patch, toolchain and hashes.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../../.."
MODULE="$REPO/artifacts/weather-app/android/daymark-voice"
LIBS="$MODULE/libs"

AAR_NAME="sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar"
AAR_SHA256="e39d54aea9b17ab7a35fa1586e444f8c76bf93fdfb764c24e35c434b3d7e1d28"
# Optional: a URL for the reviewed patched artifact when it is published.
# Without it, the artifact must already be provisioned in libs/.
AAR_URL="${SHERPA_ONNX_PATCHED_AAR_URL:-}"

if [ ! -d "$MODULE" ]; then
  echo "error: DaymarkVoice plugin module not found at $MODULE" >&2
  exit 1
fi

mkdir -p "$LIBS"

if [ -f "$LIBS/$AAR_NAME" ]; then
  actual="$(shasum -a 256 "$LIBS/$AAR_NAME" | awk '{print $1}')"
  if [ "$actual" = "$AAR_SHA256" ]; then
    echo "ok: using provisioned patched $AAR_NAME"
    exit 0
  fi
fi

if [ -z "$AAR_URL" ]; then
  echo "error: the patched sherpa-onnx AAR is not provisioned." >&2
  echo "expected: $LIBS/$AAR_NAME" >&2
  echo "sha256:   $AAR_SHA256" >&2
  echo "Set SHERPA_ONNX_PATCHED_AAR_URL to a reviewed artifact, or copy" >&2
  echo "the verified AAR into place. Do not use the upstream v1.13.8 AAR." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "downloading the patched sherpa-onnx Android runtime..."
curl -sL --fail -o "$TMP/$AAR_NAME" "$AAR_URL"

actual="$(shasum -a 256 "$TMP/$AAR_NAME" | awk '{print $1}')"
if [ "$actual" != "$AAR_SHA256" ]; then
  echo "checksum mismatch for $AAR_NAME: $actual != $AAR_SHA256" >&2
  exit 1
fi

cp "$TMP/$AAR_NAME" "$LIBS/$AAR_NAME"
echo "installed: $LIBS/$AAR_NAME"
