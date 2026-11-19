#!/usr/bin/env bash
# Plan B verifier -- asserts a working tree is in the consistent OLD (Plan B)
# state: old pins + old staged bytes + MODEL_VERSION sha256-1, with the NEW
# staged bytes preserved in a backup dir. Read-only.
#
# Usage: ./verify-plan-b.sh [--repo DIR] [--staging DIR] [--backup-dir DIR]
#                           [--include-negative] [--no-archives]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/parakeet-pins.env"
. "$HERE/plans-lib.sh"

REPO=$REPO_ROOT
STAGING=$STAGING_DIR
BACKUP_DIR=""
INCLUDE_NEGATIVE=0
WITH_ARCHIVES=1

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift 2 ;;
    --staging) STAGING=$2; shift 2 ;;
    --backup-dir) BACKUP_DIR=$2; shift 2 ;;
    --include-negative) INCLUDE_NEGATIVE=1; shift ;;
    --no-archives) WITH_ARCHIVES=0; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd shasum
require_cmd grep

log "Verifying Plan B (OLD staged assets restored, old pins) in $REPO"

# 1. Pins must remain OLD.
check_eq "pin state is OLD" old "$(pins_state "$REPO")"
check_eq "MODEL_VERSION sha256-1 present" 1 "$(count_in_pins "$REPO" "$OLD_MODEL_VERSION")"
check_eq "MODEL_VERSION sha256-2 absent" 0 "$(count_in_pins "$REPO" "$NEW_MODEL_VERSION")"
check_eq "new archive digest absent from pins" 0 "$(count_in_pins "$REPO" "$NEW_ARCHIVE_SHA256")"
check_eq "new encoder digest absent from pins" 0 "$(count_in_pins "$REPO" "$NEW_ENCODER_SHA256")"
check_eq "new decoder digest absent from pins" 0 "$(count_in_pins "$REPO" "$NEW_DECODER_SHA256")"
check_eq "new joiner digest absent from pins" 0 "$(count_in_pins "$REPO" "$NEW_JOINER_SHA256")"

# 2. Main staging must be OLD bytes matching old pins exactly.
check_eq "staged model state is OLD" old "$(staged_class "$STAGING")"
for f in $MODEL_FILES; do
  check_file "staged file present: $f" "$STAGING/$f"
done
check_eq "staged encoder size" "$OLD_ENCODER_SIZE" "$(file_size "$STAGING/encoder.int8.onnx")"
check_eq "staged encoder sha256" "$OLD_ENCODER_SHA256" "$(sha256_file "$STAGING/encoder.int8.onnx")"
check_eq "staged decoder size" "$OLD_DECODER_SIZE" "$(file_size "$STAGING/decoder.int8.onnx")"
check_eq "staged decoder sha256" "$OLD_DECODER_SHA256" "$(sha256_file "$STAGING/decoder.int8.onnx")"
check_eq "staged joiner size" "$OLD_JOINER_SIZE" "$(file_size "$STAGING/joiner.int8.onnx")"
check_eq "staged joiner sha256" "$OLD_JOINER_SHA256" "$(sha256_file "$STAGING/joiner.int8.onnx")"
check_eq "staged tokens size" "$OLD_TOKENS_SIZE" "$(file_size "$STAGING/tokens.txt")"
check_eq "staged tokens sha256 (unchanged bytes)" "$OLD_TOKENS_SHA256" "$(sha256_file "$STAGING/tokens.txt")"

if [ "$INCLUDE_NEGATIVE" = 1 ]; then
  check_eq "negative worktree staging is OLD" old "$(staged_class "$NEGATIVE_STAGING_DIR")"
fi

# 3. New bytes must be preserved for reversibility if a backup dir is supplied.
if [ -n "$BACKUP_DIR" ]; then
  check_file "backup provenance present" "$BACKUP_DIR/BACKUP-PROVENANCE.txt"
  check_file "backup manifest present" "$BACKUP_DIR/backup-manifest.tsv"
  check_eq "backup encoder sha256 (NEW)" "$NEW_ENCODER_SHA256" "$(sha256_file "$BACKUP_DIR/encoder.int8.onnx")"
  check_eq "backup decoder sha256 (NEW)" "$NEW_DECODER_SHA256" "$(sha256_file "$BACKUP_DIR/decoder.int8.onnx")"
  check_eq "backup joiner sha256 (NEW)" "$NEW_JOINER_SHA256" "$(sha256_file "$BACKUP_DIR/joiner.int8.onnx")"
  check_eq "backup tokens sha256 (NEW)" "$NEW_TOKENS_SHA256" "$(sha256_file "$BACKUP_DIR/tokens.txt")"
fi

# 4. Archive evidence.
if [ "$WITH_ARCHIVES" = 1 ]; then
  check_archives
fi

echo
echo "Plan B state: pins OLD + staged OLD (consistent with ParakeetModelAssets,"
echo "ParakeetModelAssetsTest, verifyParakeetAssets expectations)."
echo "Caveat: old bytes are only reproducible from the preserved old archive;"
echo "the upstream URL now serves the new archive, so fetch cannot recreate them."
summary
