#!/usr/bin/env bash
# Plan B -- restore the OLD staged Parakeet assets (rollback to a consistent
# pinned-old state). DRY-RUN BY DEFAULT: nothing is written unless --apply.
#
# The old bytes are restored from the preserved T5 evidence, never from the
# network: the upstream URL now serves the NEW archive, so re-fetching cannot
# reproduce the pinned OLD bytes.
#
# The current NEW staged bytes are backed up first (default location under
# quarantine/), so the change is reversible with restore-staged-backup.sh.
#
# Usage:
#   ./apply-plan-b.sh [--repo DIR] [--staging DIR] [--source extracted|archive]
#                     [--backup-dir DIR] [--apply] [--idempotent]
#                     [--include-negative]
#
# Exit: 0 = dry-run clean / old bytes restored and verified; 1 = refusal/failure.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/parakeet-pins.env"
. "$HERE/plans-lib.sh"

REPO=$REPO_ROOT
STAGING=$STAGING_DIR
SOURCE=extracted
BACKUP_DIR=""
APPLY=0
IDEMPOTENT=0
INCLUDE_NEGATIVE=0
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

usage() { sed -n '2,18p' "$0"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift 2 ;;
    --staging) STAGING=$2; shift 2 ;;
    --source) SOURCE=$2; shift 2 ;;
    --backup-dir) BACKUP_DIR=$2; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --idempotent) IDEMPOTENT=1; shift ;;
    --include-negative) INCLUDE_NEGATIVE=1; shift ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd tar
require_cmd shasum
require_cmd grep

[ -z "$BACKUP_DIR" ] && BACKUP_DIR="$QUARANTINE_DIR/staged-new-backup-$STAMP"

log "Plan B preflight (mode: $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN))"

# 1. must start from OLD pins; Plan B is a rollback of staged bytes only.
PINS=$(pins_state "$REPO")
[ "$PINS" = old ] || die "pin state is '$PINS', expected 'old'; Plan B cannot restore old assets under new pins (use Plan A or a full revert first)"
log "pin state is OLD (MODEL_VERSION sha256-1, all old digests)"

# 2. archived evidence.
check_archives

# 3. resolve the OLD source bytes and verify them against pins.
SRC=""
if [ "$SOURCE" = extracted ]; then
  SRC=$OLD_EXTRACTED
  [ -d "$SRC" ] || die "extracted-old directory missing: $SRC (re-extract from the preserved archive or use --source archive)"
elif [ "$SOURCE" = archive ]; then
  TMPEX=$(mktemp -d "${TMPDIR:-/tmp}/r4b-plan-b-XXXXXX") || die "mktemp failed"
  trap 'rm -rf "$TMPEX"' EXIT
  log "extracting preserved old archive to $TMPEX (read-only source)"
  tar -xjf "$OLD_ARCHIVE" -C "$TMPEX" || die "old archive extraction failed"
  SRC="$TMPEX/$ARCHIVE_MEMBER_DIR"
else
  die "--source must be extracted or archive"
fi
for f in $MODEL_FILES; do
  [ -f "$SRC/$f" ] || die "old source file missing: $SRC/$f"
done
check_eq "old source encoder size" "$OLD_ENCODER_SIZE" "$(file_size "$SRC/encoder.int8.onnx")"
check_eq "old source encoder sha256" "$OLD_ENCODER_SHA256" "$(sha256_file "$SRC/encoder.int8.onnx")"
check_eq "old source decoder size" "$OLD_DECODER_SIZE" "$(file_size "$SRC/decoder.int8.onnx")"
check_eq "old source decoder sha256" "$OLD_DECODER_SHA256" "$(sha256_file "$SRC/decoder.int8.onnx")"
check_eq "old source joiner size" "$OLD_JOINER_SIZE" "$(file_size "$SRC/joiner.int8.onnx")"
check_eq "old source joiner sha256" "$OLD_JOINER_SHA256" "$(sha256_file "$SRC/joiner.int8.onnx")"
check_eq "old source tokens size" "$OLD_TOKENS_SIZE" "$(file_size "$SRC/tokens.txt")"
check_eq "old source tokens sha256" "$OLD_TOKENS_SHA256" "$(sha256_file "$SRC/tokens.txt")"
[ "$FAIL_COUNT" = 0 ] || die "old source bytes do not match the pinned old values"

# 4. target state and action plan.
TARGETS="$STAGING"
if [ "$INCLUDE_NEGATIVE" = 1 ]; then
  [ -d "$NEGATIVE_STAGING_DIR" ] || die "negative staging dir missing: $NEGATIVE_STAGING_DIR"
  TARGETS="$TARGETS $NEGATIVE_STAGING_DIR"
fi

NEW_BACKUP_BYTES=0
for d in $TARGETS; do
  cls=$(staged_class "$d")
  case "$cls" in
    new)
      [ "$APPLY" = 1 ] && [ -e "$BACKUP_DIR" ] && die "backup dir already exists: $BACKUP_DIR"
      log "target $d is NEW bytes -> will back up then restore OLD"
      for f in $MODEL_FILES; do
        if [ -f "$d/$f" ]; then NEW_BACKUP_BYTES=$((NEW_BACKUP_BYTES + $(file_size "$d/$f"))); fi
      done
      ;;
    old)
      if [ "$IDEMPOTENT" = 1 ]; then
        log "target $d already OLD -> idempotent mode, will verify only"
      else
        die "target $d already has OLD bytes; pass --idempotent to verify only"
      fi
      ;;
    missing)
      warn "target $d has missing model files; will install the full old set"
      ;;
    *)
      die "target $d is in state '$cls' (not new/old/missing); inspect before restoring"
      ;;
  esac
done

echo
echo "== Planned Plan B change =="
echo "source        $SRC"
echo "backup dir    $BACKUP_DIR (approx $((NEW_BACKUP_BYTES / 1024 / 1024)) MiB of NEW bytes)"
for d in $TARGETS; do
  echo "target        $d (state $(staged_class "$d"))"
done
echo "files         $MODEL_FILES"
echo

if [ "$APPLY" -ne 1 ]; then
  echo "DRY-RUN OK: old source verified, targets classified, no files were written."
  echo "Re-run with --apply to back up NEW bytes and restore the OLD staged bytes."
  exit 0
fi

mkdir -p "$BACKUP_DIR" || die "cannot create backup dir: $BACKUP_DIR"
log "backup dir: $BACKUP_DIR"

# 5. back up existing NEW bytes and write provenance.
{
  echo "# Plan B staged-asset backup"
  echo "created_utc=$STAMP"
  echo "source_repo=$REPO"
  echo "plan_script=apply-plan-b.sh"
  echo "old_archive_sha256=$OLD_ARCHIVE_SHA256"
  echo "new_archive_sha256=$NEW_ARCHIVE_SHA256"
} > "$BACKUP_DIR/BACKUP-PROVENANCE.txt"
: > "$BACKUP_DIR/backup-manifest.tsv"
for d in $TARGETS; do
  if [ "$(staged_class "$d")" = new ]; then
    for f in $MODEL_FILES; do
      cp -p "$d/$f" "$BACKUP_DIR/$f" || die "backup copy failed: $f"
      check_eq "backup $f sha256 (NEW)" "$(sha256_file "$d/$f")" "$(sha256_file "$BACKUP_DIR/$f")"
      printf '%s\t%s\t%s\n' "$f" "$(file_size "$BACKUP_DIR/$f")" "$(sha256_file "$BACKUP_DIR/$f")" >> "$BACKUP_DIR/backup-manifest.tsv"
      BACKUP_HAS_NEW=1
    done
  fi
done
[ "$FAIL_COUNT" = 0 ] || die "backup verification failed; target staging was not modified"

# 6. install OLD bytes atomically (same filesystem: copy to temp then rename).
for d in $TARGETS; do
  if [ "$(staged_class "$d")" = old ]; then
    log "skip (already old): $d"
    continue
  fi
  log "restoring OLD bytes into $d"
  for f in $MODEL_FILES; do
    tmp="$d/.plan-b-tmp.$f"
    cp -p "$SRC/$f" "$tmp" || die "copy failed: $SRC/$f -> $tmp"
    got=$(sha256_file "$tmp")
    if [ "$got" != "$(sha256_file "$SRC/$f")" ]; then
      rm -f "$tmp"
      die "temp copy hash mismatch for $f"
    fi
    mv -f "$tmp" "$d/$f" || die "rename failed: $tmp -> $d/$f"
    log "  restored $f"
  done
done

# 7. verify final state.
if ! "$HERE/verify-plan-b.sh" --repo "$REPO" --staging "$STAGING" --backup-dir "$BACKUP_DIR"; then
  die "post-apply verification FAILED; restore NEW bytes with: ./restore-staged-backup.sh --backup-dir $BACKUP_DIR --staging $STAGING --apply"
fi

cat <<'GATES'

Plan B applied: staged model bytes are OLD again and consistent with the OLD pins.
Remaining OWNER-GATED steps (not run here):
  1. Confirm: ./check-state.sh --expect old --with-archives
  2. The NEW staged bytes are preserved in the backup dir shown above; the new
     archive remains in quarantine/ for a future Plan A window.
  3. Do NOT run fetch-parakeet-assets.sh while the old pins are in place: the
     upstream URL now serves the NEW archive, so the archive pin check fails
     (this was true before Plan B as well).
  4. Record why adoption was deferred (owner decision) in the release evidence.
GATES
