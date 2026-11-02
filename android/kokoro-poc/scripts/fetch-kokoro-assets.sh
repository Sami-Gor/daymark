#!/usr/bin/env bash
#
# Downloads the pinned Kokoro POC assets (quantized model + English, French and
# Latin American Spanish voices) and stages them for the Android builds.
# Build-time only; the app itself never downloads the model or voices.
#
# English is release material and goes into daymark-voice/src/main/assets.
# French/Spanish are debug-POC material and go into
# daymark-voice/src/debug/assets, which release packaging never reads.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../../.."
ASSETS="$HERE/../../app/src/main/assets/kokoro"
# The Capacitor shell packages the same assets through its local plugin module.
# English narration is release material; French/Spanish voices are debug-POC
# only and are staged into the debug source set so release packaging cannot
# see them.
CAPACITOR_MODULE="$REPO/artifacts/weather-app/android/daymark-voice"
CAPACITOR_ASSETS="$CAPACITOR_MODULE/src/main/assets/kokoro"
CAPACITOR_DEBUG_ASSETS="$CAPACITOR_MODULE/src/debug/assets/kokoro"
BASE="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main"
MODEL_SHA256="fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"
VOICES=("bm_fable" "ff_siwis" "em_alex")
MULTILINGUAL_VOICES=("ff_siwis" "em_alex")
VOICE_SHA256=(
  "f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1"
  "a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861"
  "27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95"
)

mkdir -p "$ASSETS"
rm -f "$ASSETS/bm_george.bin"
curl -sL --fail -o "$ASSETS/model_quantized.onnx" "$BASE/onnx/model_quantized.onnx"
for voice in "${VOICES[@]}"; do
  curl -sL --fail -o "$ASSETS/$voice.bin" "$BASE/voices/$voice.bin"
done

check() {
  local file="$1" expected="$2"
  local actual
  actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    echo "checksum mismatch for $file: $actual != $expected" >&2
    exit 1
  fi
  echo "ok: $file"
}
check "$ASSETS/model_quantized.onnx" "$MODEL_SHA256"
for i in "${!VOICES[@]}"; do
  check "$ASSETS/${VOICES[$i]}.bin" "${VOICE_SHA256[$i]}"
done

if [ ! -d "$CAPACITOR_MODULE" ]; then
  echo "error: Capacitor DaymarkVoice plugin module not found at $CAPACITOR_MODULE" >&2
  exit 1
fi
mkdir -p "$CAPACITOR_ASSETS" "$CAPACITOR_DEBUG_ASSETS"
rm -f "$CAPACITOR_ASSETS/bm_george.bin"
# Release material: model + English voice only.
cp "$ASSETS/model_quantized.onnx" "$CAPACITOR_ASSETS/model_quantized.onnx"
cp "$ASSETS/bm_fable.bin" "$CAPACITOR_ASSETS/bm_fable.bin"
rm -f "$CAPACITOR_ASSETS/ff_siwis.bin" "$CAPACITOR_ASSETS/em_alex.bin"
# Debug-POC material: French/Spanish voices, never visible to release merges.
for voice in "${MULTILINGUAL_VOICES[@]}"; do
  cp "$ASSETS/$voice.bin" "$CAPACITOR_DEBUG_ASSETS/$voice.bin"
done
# The legacy TWA shell is not a multilingual target either.
for voice in "${MULTILINGUAL_VOICES[@]}"; do
  rm -f "$ASSETS/$voice.bin"
done
echo "synced release assets: $CAPACITOR_ASSETS"
echo "synced debug assets:   $CAPACITOR_DEBUG_ASSETS"
ls -la "$ASSETS" "$CAPACITOR_ASSETS" "$CAPACITOR_DEBUG_ASSETS"
