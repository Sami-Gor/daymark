#!/usr/bin/env bash
# Fetch the production multilingual Kokoro model and all three pinned voices.
# Build-time only; runtime is fully offline.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
CAPACITOR_MODULE="$REPO/artifacts/weather-app/android/daymark-voice"
ASSETS="$CAPACITOR_MODULE/src/main/assets/kokoro"
BASE="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main"
MODEL_SHA256="fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"
check() {
  local file="$1" expected="$2" actual
  actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    echo "checksum mismatch for $file: $actual != $expected" >&2; exit 1
  fi
  echo "ok: $file"
}
if [ ! -d "$CAPACITOR_MODULE" ]; then
  echo "error: Capacitor DaymarkVoice plugin module not found at $CAPACITOR_MODULE" >&2; exit 1
fi
mkdir -p "$ASSETS"
curl -fsSL --retry 3 -o "$ASSETS/model_quantized.onnx" "$BASE/onnx/model_quantized.onnx"
for voice in bm_fable ff_siwis em_alex; do
  curl -fsSL --retry 3 -o "$ASSETS/$voice.bin" "$BASE/voices/$voice.bin"
done
check "$ASSETS/model_quantized.onnx" "$MODEL_SHA256"
check "$ASSETS/bm_fable.bin" "f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1"
check "$ASSETS/ff_siwis.bin" "a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861"
check "$ASSETS/em_alex.bin" "27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95"
shasum -a 256 "$ASSETS/model_quantized.onnx" "$ASSETS/bm_fable.bin" "$ASSETS/ff_siwis.bin" "$ASSETS/em_alex.bin" > "$ASSETS/SHA256SUMS"
echo "synced production multilingual assets: $ASSETS"