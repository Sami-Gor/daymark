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
#
# The expected digest is not duplicated here: it is read from the committed
# pin file the Gradle integrity gate also uses
# (artifacts/weather-app/android/daymark-voice/sherpa-aar.sha256). The pin must
# contain exactly one '<sha256>  <file name>' entry naming the expected AAR.
# A missing, malformed or mismatched pin fails closed before any download.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../../.."
MODULE="$REPO/artifacts/weather-app/android/daymark-voice"
LIBS="$MODULE/libs"
PIN="$MODULE/sherpa-aar.sha256"

AAR_NAME="sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar"
# Optional: a URL for the reviewed patched artifact when it is published.
# Without it, the artifact must already be provisioned in libs/.
AAR_URL="${SHERPA_ONNX_PATCHED_AAR_URL:-}"

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

if [ ! -d "$MODULE" ]; then
  echo "error: DaymarkVoice plugin module not found at $MODULE" >&2
  exit 1
fi

# Read the only authoritative digest from the committed pin file.
if [ ! -f "$PIN" ]; then
  echo "error: sherpa-onnx AAR pin file is missing: $PIN" >&2
  exit 1
fi

PIN_COUNT=0
PIN_SHA256=""
LINE_NUMBER=0
while IFS= read -r raw_line || [ -n "$raw_line" ]; do
  LINE_NUMBER=$((LINE_NUMBER + 1))
  line="${raw_line#"${raw_line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  case "$line" in
    ''|'#'*) continue ;;
  esac
  PIN_COUNT=$((PIN_COUNT + 1))
  if [ "$PIN_COUNT" -gt 1 ]; then
    echo "error: malformed sherpa-onnx AAR pin at $PIN:$LINE_NUMBER: expected exactly one entry" >&2
    exit 1
  fi
  read -r pin_sha pin_name pin_extra <<<"$line"
  if [ -z "${pin_name:-}" ] || [ -n "${pin_extra:-}" ]; then
    echo "error: malformed sherpa-onnx AAR pin at $PIN:$LINE_NUMBER. Expected '<sha256>  <file name>', found: '$raw_line'" >&2
    exit 1
  fi
  if ! [[ "$pin_sha" =~ ^[0-9a-f]{64}$ ]]; then
    echo "error: malformed sherpa-onnx AAR pin at $PIN:$LINE_NUMBER: expected a 64-character lowercase hex SHA-256 digest, found '$pin_sha'" >&2
    exit 1
  fi
  case "$pin_name" in
    */*|*\\*)
      echo "error: malformed sherpa-onnx AAR pin at $PIN:$LINE_NUMBER: '$pin_name' must be a file name" >&2
      exit 1
      ;;
  esac
  if [ "$pin_name" != "$AAR_NAME" ]; then
    echo "error: sherpa-onnx AAR pin names '$pin_name', expected '$AAR_NAME'" >&2
    exit 1
  fi
  PIN_SHA256="$pin_sha"
done < "$PIN"

if [ "$PIN_COUNT" -eq 0 ]; then
  echo "error: no sherpa-onnx AAR digest is pinned in $PIN" >&2
  exit 1
fi

AAR_SHA256="$PIN_SHA256"

mkdir -p "$LIBS"

if [ -f "$LIBS/$AAR_NAME" ]; then
  actual="$(sha256_of "$LIBS/$AAR_NAME")"
  if [ "$actual" = "$AAR_SHA256" ]; then
    echo "ok: using provisioned patched $AAR_NAME"
    exit 0
  fi
  if [ -z "$AAR_URL" ]; then
    echo "error: checksum mismatch for provisioned $AAR_NAME: $actual != $AAR_SHA256 (from $PIN)" >&2
    exit 1
  fi
fi

if [ -z "$AAR_URL" ]; then
  echo "error: the patched sherpa-onnx AAR is not provisioned." >&2
  echo "expected: $LIBS/$AAR_NAME" >&2
  echo "sha256:   $AAR_SHA256 (from $PIN)" >&2
  echo "Set SHERPA_ONNX_PATCHED_AAR_URL to a reviewed artifact, or copy" >&2
  echo "the verified AAR into place. Do not use the upstream v1.13.8 AAR." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "downloading the patched sherpa-onnx Android runtime..."
curl -sL --fail -o "$TMP/$AAR_NAME" "$AAR_URL"

actual="$(sha256_of "$TMP/$AAR_NAME")"
if [ "$actual" != "$AAR_SHA256" ]; then
  echo "checksum mismatch for downloaded $AAR_NAME: $actual != $AAR_SHA256 (from $PIN)" >&2
  exit 1
fi

cp "$TMP/$AAR_NAME" "$LIBS/$AAR_NAME"
echo "installed: $LIBS/$AAR_NAME"
