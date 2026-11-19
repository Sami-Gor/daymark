#!/usr/bin/env bash
#
# DRAFT ONLY - not applied to the production pin (Round 7 Agent C evidence).
#
# Downloads the pinned Parakeet TDT 0.6B v3 (int8) model into the Android
# app. Build-time only; the app itself never downloads the model or runtime
# (weather and place-search requests are separate network flows).
#
# Primary source: the pinned tar.bz2 archive, verified by the unchanged
# ARCHIVE_SHA256 pin and by the unchanged per-file pins after extraction.
#
# Fallback source (new in this draft): the four model files fetched
# individually from a *fixed commit* of the Hugging Face mirror
# csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8. The commit SHA
# 2bda32ec70b097a55adaa07d9a7173915b43cc78 is content-addressed and its
# LFS object ids equal the committed per-file pins; the mutable `main`
# branch already moved to different bytes on 2026-11-07, so only the
# commit-addressed URL is used. Every fallback file must still match the
# existing ENCODER/DECODER/JOINER/TOKENS SHA-256 pins, so the fallback can
# only reproduce the pinned bytes - it can never substitute different ones.
# If both the archive and the fallback fail, the script exits non-zero and
# installs nothing (fail closed).
#
# Set PARAKEET_HF_FALLBACK=0 to forbid the fallback and require the archive.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../../.."
ASSETS="$REPO/artifacts/weather-app/android/parakeet-assets/src/main/assets/parakeet"

ARCHIVE_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2"
ARCHIVE_SHA256="5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf"

ENCODER_SHA256="acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247"
DECODER_SHA256="179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e"
JOINER_SHA256="3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3"
TOKENS_SHA256="d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d"

# Fixed-commit fallback source. Do not replace the SHA with a branch or tag.
HF_REPO="csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
HF_REVISION="2bda32ec70b097a55adaa07d9a7173915b43cc78"
HF_BASE="https://huggingface.co/$HF_REPO/resolve/$HF_REVISION"
HF_FALLBACK="${PARAKEET_HF_FALLBACK:-1}"

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

fail() {
  echo "error: $*" >&2
  exit 1
}

# --- primary source: the pinned archive -----------------------------------
fetch_archive() {
  echo "downloading the Parakeet TDT 0.6B v3 int8 model archive..."
  curl -sSL --fail --retry 3 --retry-delay 2 -o "$WORK/model.tar.bz2" "$ARCHIVE_URL" || return 1
  check "$WORK/model.tar.bz2" "$ARCHIVE_SHA256" || return 1
}

install_from_archive() {
  tar -xjf "$WORK/model.tar.bz2" -C "$WORK"
  MODEL_DIR="$(find "$WORK" -type d -name 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8' | head -1)"
  if [ -z "$MODEL_DIR" ]; then
    MODEL_DIR="$(find "$WORK" -type f -name 'encoder.int8.onnx' -exec dirname {} \; | head -1)"
  fi
  [ -n "$MODEL_DIR" ] || fail "the archive does not contain the expected model"
  mkdir -p "$ASSETS"
  for file in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
    cp "$MODEL_DIR/$file" "$ASSETS/$file"
  done
}

# --- fallback source: per-file fetch from the fixed HF commit -------------
install_from_hf() {
  echo "warning: primary archive unavailable or failed verification;" >&2
  echo "warning: falling back to fixed HF revision $HF_REVISION (per-file)." >&2
  mkdir -p "$WORK/hf"
  local spec file expected
  for spec in \
    "encoder.int8.onnx:$ENCODER_SHA256" \
    "decoder.int8.onnx:$DECODER_SHA256" \
    "joiner.int8.onnx:$JOINER_SHA256" \
    "tokens.txt:$TOKENS_SHA256"; do
    file="${spec%%:*}"
    expected="${spec##*:}"
    echo "downloading fallback file $file from HF revision $HF_REVISION..."
    curl -sSL --fail --retry 5 --retry-delay 3 -C - -o "$WORK/hf/$file" "$HF_BASE/$file" \
      || fail "fallback download failed for $file (no further source is used)"
    check "$WORK/hf/$file" "$expected" || fail "fallback file $file did not match its pin"
  done
  # Stage only after every fallback file verified, so a partial fallback
  # never leaves half-installed model assets.
  mkdir -p "$ASSETS"
  for file in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
    cp "$WORK/hf/$file" "$ASSETS/$file"
  done
  echo "installed from fallback source: HF revision $HF_REVISION"
}

if fetch_archive; then
  install_from_archive
else
  if [ "$HF_FALLBACK" = "1" ]; then
    install_from_hf
  else
    fail "the pinned archive could not be fetched or verified, and PARAKEET_HF_FALLBACK=0 forbids the fallback"
  fi
fi

check "$ASSETS/encoder.int8.onnx" "$ENCODER_SHA256"
check "$ASSETS/decoder.int8.onnx" "$DECODER_SHA256"
check "$ASSETS/joiner.int8.onnx" "$JOINER_SHA256"
check "$ASSETS/tokens.txt" "$TOKENS_SHA256"

echo "installed: $ASSETS"
ls -la "$ASSETS"
