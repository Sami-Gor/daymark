#!/usr/bin/env bash
#
# Downloads the pinned Parakeet TDT 0.6B v3 (int8) model into the Android
# app. Build-time only; the app itself never downloads the model or runtime
# (weather and place-search requests are separate network flows).
#
# The model is what Daymark V2 uses for on-device speech-to-text, through
# sherpa-onnx. It is the model that was evaluated on a physical device; see
# docs/release/parakeet-v3-android-phone-evaluation.md.
#
# RETRIEVAL POLICY (documented in docs/release/reproducible-build-guide.md):
#   * Primary source: a Daymark-controlled, immutable GitHub release asset
#     (CONTROLLED_ARCHIVE_URL below). PARAKEET_ARCHIVE_URL may point at an
#     approved mirror instead (for example a CI cache); it is the only
#     configurable input. The archive SHA-256 and the four per-file SHA-256
#     pins are constants and always win, so a wrong, substituted, truncated
#     or unreachable download fails the build instead of shipping.
#   * The mutable upstream release asset is not used. Upstream replaced it on
#     2026-11-07 with different bytes; that revision is not adopted here. The
#     pins below reproduce the originally evaluated bytes only.
#   * Optional Hugging Face fallback, DISABLED by default. It is used only
#     when PARAKEET_HF_FALLBACK=1 is set explicitly, only at the pinned commit
#     HF_REVISION below, and every fallback file must still match the same
#     per-file pins. A failed mirror never falls back silently.
#
# The download is deterministic: one pinned URL, no branch/tag resolution, a
# closed archive member allow-list, and hash verification before extraction
# and again before installation.
set -euo pipefail

LC_ALL=C
export LC_ALL

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../../.."
ASSETS="$REPO/artifacts/weather-app/android/parakeet-assets/src/main/assets/parakeet"

# --- pinned model identity (do not change without a new model revision) ----
ARCHIVE_SHA256="5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf"

ENCODER_SHA256="acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247"
DECODER_SHA256="179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e"
JOINER_SHA256="3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3"
TOKENS_SHA256="d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d"

MODEL_PINS="encoder.int8.onnx|$ENCODER_SHA256
decoder.int8.onnx|$DECODER_SHA256
joiner.int8.onnx|$JOINER_SHA256
tokens.txt|$TOKENS_SHA256"

# Daymark-controlled immutable release asset. OWNER ACTION REQUIRED: publish
# the preserved archive as an immutable release asset, then replace this
# placeholder URL with the published one. See the retrieval-policy section of
# docs/release/reproducible-build-guide.md.
CONTROLLED_ARCHIVE_URL="https://github.com/Sami-Gor/daymark/releases/download/parakeet-tdt-0.6b-v3-int8-v1/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2"

# Approved mirror / CI-cache override. The pinned digest above is unchanged,
# so this can only ever accept the pinned bytes.
ARCHIVE_URL="${PARAKEET_ARCHIVE_URL:-$CONTROLLED_ARCHIVE_URL}"

# Historical provenance only: the mutable upstream asset that was replaced on
# 2026-11-07. Recorded for auditability; it is never fetched.
UPSTREAM_ARCHIVE_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2"

# Optional fallback source: a fixed commit of the Hugging Face mirror. Never a
# branch or tag - the mirror's main branch moved to different bytes on
# 2026-11-07. This is not a model-pin change: every file is still checked
# against the committed per-file pins below.
HF_REPO="csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
HF_REVISION="2bda32ec70b097a55adaa07d9a7173915b43cc78"
HF_BASE_URL="https://huggingface.co/$HF_REPO/resolve/$HF_REVISION"

# Closed allow-list of the pinned archive: exactly 10 members (2 directories
# and 8 files). Extraction runs only after every member name is validated.
MODEL_DIR_NAME="sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
EXPECTED_MEMBERS="sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/tokens.txt
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/joiner.int8.onnx
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/decoder.int8.onnx
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/encoder.int8.onnx
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/en.wav
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/fr.wav
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/es.wav
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/de.wav"

fail() {
  echo "error: $*" >&2
  exit 1
}

# The Hugging Face fallback is opt-in only: unset or 0 means disabled.
HF_FALLBACK="${PARAKEET_HF_FALLBACK:-0}"
case "$HF_FALLBACK" in
  1) HF_FALLBACK=1 ;;
  0) HF_FALLBACK=0 ;;
  *) fail "PARAKEET_HF_FALLBACK must be 1 (enable) or 0/unset (disable), got: '$HF_FALLBACK'" ;;
esac
[ "${#HF_REVISION}" -eq 40 ] || fail "HF_REVISION is not a fixed 40-character commit SHA"

# All temporary files stay under TMPDIR (a T5 path in this workspace, and the
# runner temp dir in CI).
WORK="$(mktemp -d "${TMPDIR:-/tmp}/parakeet-fetch.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

DOWNLOAD_RETRIES=3
DOWNLOAD_RETRY_DELAY=2

download() { # url dest
  local url="$1" dest="$2"
  curl -fsSL --retry "$DOWNLOAD_RETRIES" --retry-delay "$DOWNLOAD_RETRY_DELAY" \
    -o "$dest" "$url"
}

sha256_of() {
  shasum -a 256 "$1" | awk '{print $1}'
}

check_sha256() { # file expected label
  local file="$1" expected="$2" label="$3" actual
  [ -f "$file" ] || {
    echo "error: missing file for $label: $file" >&2
    return 1
  }
  actual="$(sha256_of "$file")"
  if [ "$actual" != "$expected" ]; then
    echo "error: SHA-256 mismatch for $label: $actual != $expected" >&2
    return 1
  fi
  echo "ok: $label sha256=$actual"
}

verify_archive_members() { # archive
  local archive="$1" count dupes actual expected member
  tar -tjf "$archive" > "$WORK/members.txt" || {
    echo "error: cannot list the archive members" >&2
    return 1
  }
  count="$(wc -l < "$WORK/members.txt" | tr -d ' ')"
  [ "$count" = "10" ] || {
    echo "error: archive has $count members; the closed allow-list has exactly 10" >&2
    return 1
  }
  dupes="$(LC_ALL=C sort "$WORK/members.txt" | uniq -d)"
  [ -z "$dupes" ] || {
    echo "error: duplicate archive members: $dupes" >&2
    return 1
  }
  while IFS= read -r member; do
    case "$member" in
      /*) echo "error: absolute member path: $member" >&2; return 1 ;;
      *..*) echo "error: parent-traversal member path: $member" >&2; return 1 ;;
      *'//'*) echo "error: double-slash member path: $member" >&2; return 1 ;;
    esac
  done < "$WORK/members.txt"
  if tar -tvjf "$archive" | awk '$1 ~ /^[lh]/ {found=1} END {exit !found}'; then
    echo "error: archive contains symlink or hardlink members" >&2
    return 1
  fi
  actual="$(LC_ALL=C sort "$WORK/members.txt")"
  expected="$(printf '%s\n' "$EXPECTED_MEMBERS" | LC_ALL=C sort)"
  [ "$actual" = "$expected" ] || {
    echo "error: archive member list differs from the closed allow-list" >&2
    return 1
  }
  echo "ok: archive member list matches the closed allow-list (10 members)"
}

extract_archive() { # archive
  local archive="$1" dest="$WORK/extract"
  mkdir -p "$dest"
  ( umask 022; tar -xjf "$archive" -C "$dest" ) || {
    echo "error: archive extraction failed" >&2
    return 1
  }
  [ -d "$dest/$MODEL_DIR_NAME" ] || {
    echo "error: archive does not contain the expected model directory" >&2
    return 1
  }
}

stage_pinned_model_files() { # source-dir label
  local src="$1" label="$2" file expected
  mkdir -p "$WORK/stage"
  while IFS='|' read -r file expected; do
    [ -f "$src/$file" ] || {
      echo "error: $label is missing $file" >&2
      return 1
    }
    cp "$src/$file" "$WORK/stage/$file"
    check_sha256 "$WORK/stage/$file" "$expected" "$file" || return 1
  done <<< "$MODEL_PINS"
}

install_staged() { # label
  local label="$1" file expected
  mkdir -p "$ASSETS"
  while IFS='|' read -r file expected; do
    cp "$WORK/stage/$file" "$ASSETS/$file"
  done <<< "$MODEL_PINS"
  # Verify what actually landed in the asset directory, not just the staging
  # copy: a broken install must fail before the build can package it.
  while IFS='|' read -r file expected; do
    check_sha256 "$ASSETS/$file" "$expected" "$file (installed)" || fail "installed file failed verification: $file"
  done <<< "$MODEL_PINS"
  echo "installed from $label: $ASSETS"
  ls -la "$ASSETS"
}

fetch_from_mirror() {
  echo "fetching the pinned Parakeet archive from the controlled mirror..."
  echo "  url: $ARCHIVE_URL"
  download "$ARCHIVE_URL" "$WORK/model.tar.bz2" || {
    echo "error: archive download failed: $ARCHIVE_URL" >&2
    return 1
  }
  check_sha256 "$WORK/model.tar.bz2" "$ARCHIVE_SHA256" "archive" || return 1
  verify_archive_members "$WORK/model.tar.bz2" || return 1
  extract_archive "$WORK/model.tar.bz2" || return 1
  stage_pinned_model_files "$WORK/extract/$MODEL_DIR_NAME" "archive" || return 1
}

fetch_from_hf() {
  local file expected url
  mkdir -p "$WORK/hf"
  echo "warning: huggingface.co is being used because PARAKEET_HF_FALLBACK=1 was set explicitly." >&2
  echo "warning: pinned HF revision: $HF_REVISION" >&2
  while IFS='|' read -r file expected; do
    url="$HF_BASE_URL/$file"
    echo "downloading fallback file $file from HF revision $HF_REVISION..."
    download "$url" "$WORK/hf/$file" || {
      echo "error: fallback download failed for $file: $url" >&2
      return 1
    }
    check_sha256 "$WORK/hf/$file" "$expected" "$file (HF fallback)" || {
      echo "error: fallback file $file did not match its committed pin; refusing to use different bytes" >&2
      return 1
    }
  done <<< "$MODEL_PINS"
  # Stage only after all four fallback files verified, so a partial fallback
  # never leaves half-installed model assets.
  stage_pinned_model_files "$WORK/hf" "pinned HF fallback" || return 1
}

if fetch_from_mirror; then
  install_staged "controlled mirror archive"
else
  if [ "$HF_FALLBACK" = "1" ]; then
    echo "warning: the controlled mirror archive could not be fetched or verified." >&2
    fetch_from_hf || fail "both the controlled mirror and the pinned HF fallback failed; no model assets were installed"
    install_staged "pinned HF fallback"
  else
    fail "the pinned archive could not be fetched or verified from $ARCHIVE_URL. The optional HF fallback is disabled by default; set PARAKEET_HF_FALLBACK=1 to opt in explicitly. No substitute source or model revision is used."
  fi
fi
