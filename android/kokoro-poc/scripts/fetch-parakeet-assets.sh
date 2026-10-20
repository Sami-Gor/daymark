#!/usr/bin/env bash
#
# Downloads the pinned Parakeet TDT 0.6B v3 (int8) model into the Android
# app. Build-time only; the app itself never downloads anything.
#
# The model is what Daymark V2 uses for on-device speech-to-text, through
# sherpa-onnx. It is the model that was evaluated on a physical device; see
# docs/release/parakeet-v3-android-phone-evaluation.md.
#
# Both the archive and every extracted file are verified against pinned
# SHA-256 values, so a corrupted or substituted download fails the build
# rather than shipping.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../../.."
ASSETS="$REPO/artifacts/weather-app/android/app/src/main/assets/parakeet"

ARCHIVE_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2"
ARCHIVE_SHA256="5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf"

ENCODER_SHA256="acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247"
DECODER_SHA256="179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e"
JOINER_SHA256="3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3"
TOKENS_SHA256="d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

check() {
  local file="$1" expected="$2"
  local actual
  actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    echo "checksum mismatch for $file: $actual != $expected" >&2
    exit 1
  fi
  echo "ok: $(basename "$file")"
}

echo "downloading the Parakeet TDT 0.6B v3 int8 model..."
curl -sL --fail -o "$WORK/model.tar.bz2" "$ARCHIVE_URL"
check "$WORK/model.tar.bz2" "$ARCHIVE_SHA256"

tar -xjf "$WORK/model.tar.bz2" -C "$WORK"

MODEL_DIR="$(find "$WORK" -type d -name 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8' | head -1)"
if [ -z "$MODEL_DIR" ]; then
  MODEL_DIR="$(find "$WORK" -type f -name 'encoder.int8.onnx' -exec dirname {} \; | head -1)"
fi
if [ -z "$MODEL_DIR" ]; then
  echo "error: the archive does not contain the expected model" >&2
  exit 1
fi

mkdir -p "$ASSETS"
for file in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
  cp "$MODEL_DIR/$file" "$ASSETS/$file"
done

check "$ASSETS/encoder.int8.onnx" "$ENCODER_SHA256"
check "$ASSETS/decoder.int8.onnx" "$DECODER_SHA256"
check "$ASSETS/joiner.int8.onnx" "$JOINER_SHA256"
check "$ASSETS/tokens.txt" "$TOKENS_SHA256"

echo "installed: $ASSETS"
ls -la "$ASSETS"
