#!/usr/bin/env bash
# Reverse Plan B -- restore the NEW staged model bytes that apply-plan-b.sh
# backed up. This returns staging to the pre-Plan-B state (new bytes staged),
# which is only consistent once Plan A pins are applied; with old pins it
# recreates the known hazard state and is therefore reversible again.
# DRY-RUN BY DEFAULT.
#
# Usage:
#   ./restore-staged-backup.sh --backup-dir DIR [--repo DIR] [--staging DIR]
#                              [--apply] [--idempotent]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/parakeet-pins.env"
. "$HERE/plans-lib.sh"

REPO=$REPO_ROOT
STAGING=$STAGING_DIR
BACKUP_DIR=""
APPLY=0
IDEMPOTENT=0

usage() { sed -n '2,12p' "$0"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift 2 ;;
    --staging) STAGING=$2; shift 2 ;;
    --backup-dir) BACKUP_DIR=$2; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --idempotent) IDEMPOTENT=1; shift ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd shasum
[ -n "$BACKUP_DIR" ] || die "--backup-dir is required"
[ -d "$BACKUP_DIR" ] || die "backup dir not found: $BACKUP_DIR"
require_cmd grep

log "Reverse Plan B preflight (mode: $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN))"

# 1. backup must hold the NEW bytes recorded by Plan B.
check_file "backup provenance present" "$BACKUP_DIR/BACKUP-PROVENANCE.txt"
check_file "backup manifest present" "$BACKUP_DIR/backup-manifest.tsv"
for f in $MODEL_FILES; do
  check_file "backup file present: $f" "$BACKUP_DIR/$f"
done
check_eq "backup encoder sha256 (NEW)" "$NEW_ENCODER_SHA256" "$(sha256_file "$BACKUP_DIR/encoder.int8.onnx")"
check_eq "backup decoder sha256 (NEW)" "$NEW_DECODER_SHA256" "$(sha256_file "$BACKUP_DIR/decoder.int8.onnx")"
check_eq "backup joiner sha256 (NEW)" "$NEW_JOINER_SHA256" "$(sha256_file "$BACKUP_DIR/joiner.int8.onnx")"
check_eq "backup tokens sha256 (NEW)" "$NEW_TOKENS_SHA256" "$(sha256_file "$BACKUP_DIR/tokens.txt")"
[ "$FAIL_COUNT" = 0 ] || die "backup does not contain the expected NEW bytes"

# 2. repository pins must not be 'missing'.
PINS=$(pins_state "$REPO")
[ "$PINS" != missing ] || die "pin files missing in $REPO"

# 3. target staging must currently be OLD (or missing) so the restore is meaningful.
CLS=$(staged_class "$STAGING")
case "$CLS" in
  old|missing) log "target staging state: $CLS -> will restore NEW bytes" ;;
  new)
    if [ "$IDEMPOTENT" = 1 ]; then
      log "target staging already NEW -> idempotent verify only"
    else
      die "target staging already has NEW bytes; pass --idempotent to verify only"
    fi ;;
  *) die "target staging state '$CLS' is not old/missing/new" ;;
esac

if [ "$APPLY" -ne 1 ]; then
  echo "DRY-RUN OK: backup verified as NEW; no files were written."
  echo "Re-run with --apply to restore NEW staged bytes from $BACKUP_DIR."
  exit 0
fi

for f in $MODEL_FILES; do
  tmp="$STAGING/.plan-b-restore-tmp.$f"
  cp -p "$BACKUP_DIR/$f" "$tmp" || die "copy failed: $tmp"
  got=$(sha256_file "$tmp")
  if [ "$got" != "$(sha256_file "$BACKUP_DIR/$f")" ]; then
    rm -f "$tmp"; die "temp copy hash mismatch for $f"
  fi
  mv -f "$tmp" "$STAGING/$f" || die "rename failed: $tmp -> $STAGING/$f"
  log "restored NEW $f"
done

check_eq "restored staging state is NEW" new "$(staged_class "$STAGING")"
if [ "$FAIL_COUNT" -ne 0 ]; then die "restore verification failed"; fi
echo "OK: staged NEW bytes restored from $BACKUP_DIR"
echo "Current state: pins '$PINS' + staged NEW. Run ./check-state.sh for the classification."
