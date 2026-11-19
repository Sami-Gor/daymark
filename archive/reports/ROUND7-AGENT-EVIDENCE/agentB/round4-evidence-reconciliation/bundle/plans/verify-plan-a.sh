#!/usr/bin/env bash
# Plan A verifier -- asserts a working tree is in the consistent NEW (Plan A)
# state: all 24 coordinated literal edits in place, MODEL_VERSION sha256-2,
# staged model bytes = new archive members, old archive preserved. Read-only.
#
# Usage: ./verify-plan-a.sh [--repo DIR] [--staging DIR] [--no-archives] [--quiet]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/parakeet-pins.env"
. "$HERE/plans-lib.sh"

REPO=$REPO_ROOT
STAGING=$STAGING_DIR
WITH_ARCHIVES=1
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift 2 ;;
    --staging) STAGING=$2; shift 2 ;;
    --no-archives) WITH_ARCHIVES=0; shift ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd shasum
require_cmd grep

log "Verifying Plan A (NEW coordinated pin state) in $REPO"

# 1. Global classification.
check_eq "pin state is NEW (no old literals remain)" new "$(pins_state "$REPO")"

# 2. Per-site literal placement (24 literal edits; tokens deliberately unchanged).
check_eq "S1 fetch archive pin" 1 "$(count_literal "$REPO/$PIN_FETCH" "$NEW_ARCHIVE_SHA256")"
check_eq "S2 fetch encoder pin" 1 "$(count_literal "$REPO/$PIN_FETCH" "$NEW_ENCODER_SHA256")"
check_eq "S2 fetch decoder pin" 1 "$(count_literal "$REPO/$PIN_FETCH" "$NEW_DECODER_SHA256")"
check_eq "S2 fetch joiner pin" 1 "$(count_literal "$REPO/$PIN_FETCH" "$NEW_JOINER_SHA256")"
check_eq "S2 fetch tokens pin unchanged" 1 "$(count_literal "$REPO/$PIN_FETCH" "$NEW_TOKENS_SHA256")"
check_eq "S3 build.gradle encoder digest" 1 "$(count_literal "$REPO/$PIN_GRADLE" "$NEW_ENCODER_SHA256")"
check_eq "S3 build.gradle decoder digest" 1 "$(count_literal "$REPO/$PIN_GRADLE" "$NEW_DECODER_SHA256")"
check_eq "S3 build.gradle joiner digest" 1 "$(count_literal "$REPO/$PIN_GRADLE" "$NEW_JOINER_SHA256")"
check_eq "S3 build.gradle tokens digest unchanged" 1 "$(count_literal "$REPO/$PIN_GRADLE" "$NEW_TOKENS_SHA256")"
check_eq "S4 ParakeetModelAssets encoder digest" 1 "$(count_literal "$REPO/$PIN_JAVA" "$NEW_ENCODER_SHA256")"
check_eq "S4 ParakeetModelAssets decoder digest" 1 "$(count_literal "$REPO/$PIN_JAVA" "$NEW_DECODER_SHA256")"
check_eq "S4 ParakeetModelAssets joiner digest" 1 "$(count_literal "$REPO/$PIN_JAVA" "$NEW_JOINER_SHA256")"
check_eq "S4 ParakeetModelAssets tokens digest unchanged" 1 "$(count_literal "$REPO/$PIN_JAVA" "$NEW_TOKENS_SHA256")"
check_eq "S4 ParakeetModelAssets encoder size" 1 "$(count_literal "$REPO/$PIN_JAVA" "${NEW_ENCODER_SIZE}L")"
check_eq "S4 ParakeetModelAssets decoder size" 1 "$(count_literal "$REPO/$PIN_JAVA" "${NEW_DECODER_SIZE}L")"
check_eq "S4 ParakeetModelAssets joiner size unchanged" 1 "$(count_literal "$REPO/$PIN_JAVA" "${NEW_JOINER_SIZE}L")"
check_eq "S4 ParakeetModelAssets tokens size unchanged" 1 "$(count_literal "$REPO/$PIN_JAVA" "${NEW_TOKENS_SIZE}L")"
check_eq "S4 MODEL_VERSION sha256-2" 1 "$(count_literal "$REPO/$PIN_JAVA" "$NEW_MODEL_VERSION")"
check_eq "S4 old MODEL_VERSION absent" 0 "$(count_literal "$REPO/$PIN_JAVA" "$OLD_MODEL_VERSION")"
check_eq "S5 test expected encoder size" 1 "$(count_literal "$REPO/$PIN_TEST" "${NEW_ENCODER_SIZE}L")"
check_eq "S5 test expected decoder size" 1 "$(count_literal "$REPO/$PIN_TEST" "${NEW_DECODER_SIZE}L")"
check_eq "S5 test expected joiner size unchanged" 1 "$(count_literal "$REPO/$PIN_TEST" "${NEW_JOINER_SIZE}L")"
check_eq "S5 test expected tokens size unchanged" 1 "$(count_literal "$REPO/$PIN_TEST" "${NEW_TOKENS_SIZE}L")"
check_eq "S6 notices archive digest (row + table)" 2 "$(count_literal "$REPO/$PIN_NOTICES" "$NEW_ARCHIVE_SHA256")"
check_eq "S6 notices encoder digest" 1 "$(count_literal "$REPO/$PIN_NOTICES" "$NEW_ENCODER_SHA256")"
check_eq "S6 notices decoder digest" 1 "$(count_literal "$REPO/$PIN_NOTICES" "$NEW_DECODER_SHA256")"
check_eq "S6 notices joiner digest" 1 "$(count_literal "$REPO/$PIN_NOTICES" "$NEW_JOINER_SHA256")"
check_eq "S6 notices tokens digest unchanged" 1 "$(count_literal "$REPO/$PIN_NOTICES" "$NEW_TOKENS_SHA256")"
check_eq "S7 guide encoder digest" 1 "$(count_literal "$REPO/$PIN_GUIDE" "$NEW_ENCODER_SHA256")"
check_eq "S7 guide decoder digest" 1 "$(count_literal "$REPO/$PIN_GUIDE" "$NEW_DECODER_SHA256")"
check_eq "S7 guide joiner digest" 1 "$(count_literal "$REPO/$PIN_GUIDE" "$NEW_JOINER_SHA256")"
check_eq "S7 guide archive digest" 1 "$(count_literal "$REPO/$PIN_GUIDE" "$NEW_ARCHIVE_SHA256")"
check_eq "S7 guide tokens digest unchanged" 1 "$(count_literal "$REPO/$PIN_GUIDE" "$NEW_TOKENS_SHA256")"

# 3. No old digest survives anywhere in the six files.
check_eq "old archive digest absent" 0 "$(count_in_pins "$REPO" "$OLD_ARCHIVE_SHA256")"
check_eq "old encoder digest absent" 0 "$(count_in_pins "$REPO" "$OLD_ENCODER_SHA256")"
check_eq "old decoder digest absent" 0 "$(count_in_pins "$REPO" "$OLD_DECODER_SHA256")"
check_eq "old joiner digest absent" 0 "$(count_in_pins "$REPO" "$OLD_JOINER_SHA256")"

# 4. Staged bytes equal the Plan A target (must already be new; Plan A does not move model files).
check_eq "staged model state is NEW" new "$(staged_class "$STAGING")"
for f in $MODEL_FILES; do
  check_file "staged file present: $f" "$STAGING/$f"
done
check_eq "staged encoder size" "$NEW_ENCODER_SIZE" "$(file_size "$STAGING/encoder.int8.onnx")"
check_eq "staged encoder sha256" "$NEW_ENCODER_SHA256" "$(sha256_file "$STAGING/encoder.int8.onnx")"
check_eq "staged decoder size" "$NEW_DECODER_SIZE" "$(file_size "$STAGING/decoder.int8.onnx")"
check_eq "staged decoder sha256" "$NEW_DECODER_SHA256" "$(sha256_file "$STAGING/decoder.int8.onnx")"
check_eq "staged joiner size" "$NEW_JOINER_SIZE" "$(file_size "$STAGING/joiner.int8.onnx")"
check_eq "staged joiner sha256" "$NEW_JOINER_SHA256" "$(sha256_file "$STAGING/joiner.int8.onnx")"
check_eq "staged tokens size" "$NEW_TOKENS_SIZE" "$(file_size "$STAGING/tokens.txt")"
check_eq "staged tokens sha256" "$NEW_TOKENS_SHA256" "$(sha256_file "$STAGING/tokens.txt")"

# 5. Archive evidence and preservation.
if [ "$WITH_ARCHIVES" = 1 ]; then
  check_archives
fi

echo
if [ "$QUIET" -ne 1 ]; then
  echo "Plan A state: pins NEW + staged NEW (consistent)."
  echo "Not covered here (owner/build/device gates): fetch twice, verifyParakeetAssets,"
  echo "bundleRelease/AAB member digests, model-dependent CI, on-device parity."
fi
summary
