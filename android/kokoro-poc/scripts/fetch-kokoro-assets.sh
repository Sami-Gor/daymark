#!/usr/bin/env bash
#
# Downloads the pinned Kokoro POC assets (quantized model + single British male
# voice) into the Android app. Build-time only; the app itself never downloads.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$HERE/../../app/src/main/assets/kokoro"
BASE="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main"
MODEL_SHA256="fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"
VOICE="bm_george"
VOICE_SHA256="c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc"

mkdir -p "$ASSETS"
curl -sL --fail -o "$ASSETS/model_quantized.onnx" "$BASE/onnx/model_quantized.onnx"
curl -sL --fail -o "$ASSETS/$VOICE.bin" "$BASE/voices/$VOICE.bin"

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
check "$ASSETS/$VOICE.bin" "$VOICE_SHA256"
ls -la "$ASSETS"
