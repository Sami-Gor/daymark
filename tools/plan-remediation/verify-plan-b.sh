#!/usr/bin/env bash
# Plan B verifier -- asserts a working tree is in the consistent OLD (Plan B)
# state: old pins + old staged bytes + MODEL_VERSION sha256-1, with the
# pre-Plan-B bytes preserved in a backup dir. Read-only.
#
# Remediation copy (Round 7, agent B):
#   A1  --repo may be a linked worktree or subdirectory.
#   B1  backup verification is now target-aware (targets.tsv): every recorded
#       target's manifest is checked, so an --include-negative backup can no
#       longer hide a collided/overwritten target. Backup files are verified
#       against the canonical NEW sizes/digests and against their manifest.
#   A4/B3 stale manifests are detected: provenance stores the sha256 of
#       targets.tsv and of every target manifest, so a stale or tampered
#       manifest fails verification instead of being silently trusted.
#
# Canonical suite (main staging OLD + v2 backup + archives): 30 checks.
#
# Usage: ./verify-plan-b.sh [--repo DIR] [--staging DIR] [--backup-dir DIR]
#                           [--include-negative] [--negative-staging DIR]
#                           [--no-archives]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/parakeet-pins.env"
. "$HERE/plans-lib.sh"

REPO=$REPO_ROOT
STAGING=$STAGING_DIR
BACKUP_DIR=""
INCLUDE_NEGATIVE=0
NEGATIVE_STAGING="$NEGATIVE_STAGING_DIR"
WITH_ARCHIVES=1

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift 2 ;;
    --staging) STAGING=$2; shift 2 ;;
    --backup-dir) BACKUP_DIR=$2; shift 2 ;;
    --include-negative) INCLUDE_NEGATIVE=1; shift ;;
    --negative-staging) NEGATIVE_STAGING=$2; shift 2 ;;
    --no-archives) WITH_ARCHIVES=0; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd shasum
require_cmd grep

REPO=$(repo_dir "$REPO")
STAGING=$(cd "$STAGING" 2>/dev/null && pwd -P) || STAGING=$STAGING

log "Verifying Plan B (OLD staged assets restored, old pins) in $REPO"

# ---------------------------------------------------------------------------
# Backup layout helpers local to this verifier.
backup_target_rows() { # -> id<TAB>path rows (legacy: single row t1 + STAGING)
  local b=$1 layout
  layout=$(backup_layout "$b")
  if [ "$layout" = v2 ]; then
    backup_read_targets "$b"
  elif [ "$layout" = legacy ]; then
    printf 't1\t%s\n' "$STAGING"
  fi
}

backup_records_staging() { # backup-dir -> 0 when a recorded target path == STAGING
  local b=$1 tid path pre
  if [ "$(backup_layout "$b")" = legacy ]; then return 0; fi
  while IFS=$'\t' read -r tid path pre; do
    [ -n "$tid" ] || continue
    if [ "$path" = "$STAGING" ]; then return 0; fi
  done <<EOF
$(backup_target_rows "$b")
EOF
  return 1
}

backup_target_for_negative() { # backup-dir -> path of the non-staging target (empty when absent)
  local b=$1 tid path pre found=""
  while IFS=$'\t' read -r tid path pre; do
    [ -n "$tid" ] || continue
    if [ "$path" != "$STAGING" ]; then found=$path; fi
  done <<EOF
$(backup_target_rows "$b")
EOF
  echo "$found"
}

check_backup_file() { # display-name file expected-sha expected-size
  local disp=$1 f=$2 esha=$3 esize=$4 ok=1 seen=0 rows tid path pre0 tdir manifest entry pre size sha
  rows=$(backup_target_rows "$BACKUP_DIR")
  while IFS=$'\t' read -r tid path pre0; do
    [ -n "$tid" ] || continue
    if [ "$(backup_layout "$BACKUP_DIR")" = v2 ]; then
      tdir="$BACKUP_DIR/targets/$tid"
    else
      tdir="$BACKUP_DIR"
    fi
    manifest="$tdir/$BACKUP_TARGET_MANIFEST"
    [ -f "$manifest" ] || { ok=0; continue; }
    entry=$(awk -F'\t' -v want="$f" '!/^#/ && $1==want {print; exit}' "$manifest" 2>/dev/null || true)
    [ -n "$entry" ] || continue
    seen=1
    if [ "$(backup_layout "$BACKUP_DIR")" = v2 ]; then
      pre=$(printf '%s' "$entry" | cut -f2)
      size=$(printf '%s' "$entry" | cut -f3)
      sha=$(printf '%s' "$entry" | cut -f4)
      [ "$pre" = missing ] && continue
    else
      size=$(printf '%s' "$entry" | cut -f2)
      sha=$(printf '%s' "$entry" | cut -f3)
    fi
    if [ "$sha" != "$esha" ] || [ "$size" != "$esize" ]; then ok=0; fi
    if [ ! -f "$tdir/$f" ]; then ok=0; continue; fi
    if [ "$(sha256_file "$tdir/$f")" != "$esha" ]; then ok=0; fi
    if [ "$(file_size "$tdir/$f")" != "$esize" ]; then ok=0; fi
  done <<EOF
$rows
EOF
  if [ "$seen" = 0 ]; then
    # tokens.txt is byte-identical in both states, so it is never replaced and
    # needs no backup; every other canonical file must be recorded.
    if [ "$f" = tokens.txt ]; then
      pass "backup $disp (shared bytes; no replacement needed)"
    else
      fail "backup $disp (no manifest entry recorded)"
    fi
  elif [ "$ok" = 1 ]; then
    pass "backup $disp (manifest + bytes = canonical NEW)"
  else
    fail "backup $disp (manifest or bytes do not match canonical NEW)"
  fi
}

check_backup_manifests() { # combined: every recorded target manifest is exact
  local rows tid path pre detail ok=1
  rows=$(backup_target_rows "$BACKUP_DIR")
  while IFS=$'\t' read -r tid path pre; do
    [ -n "$tid" ] || continue
    if ! detail=$(backup_check_manifest "$BACKUP_DIR" "$tid" 2>&1); then
      ok=0
      printf '%s\n' "$detail" | sed 's/^/      /'
    fi
  done <<EOF
$rows
EOF
  if [ "$ok" = 1 ]; then
    pass "backup manifests cover exactly the pre-Plan-B NEW bytes"
  else
    fail "backup manifests inconsistent (stale/tampered or incomplete)"
  fi
}
# ---------------------------------------------------------------------------

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

# 3. Negative worktree when requested: must be OLD and recorded in the backup.
if [ "$INCLUDE_NEGATIVE" = 1 ]; then
  NEG_PATH=$NEGATIVE_STAGING
  if [ -n "$BACKUP_DIR" ] && [ "$(backup_layout "$BACKUP_DIR")" = v2 ]; then
    REC=$(backup_target_for_negative "$BACKUP_DIR")
    if [ -n "$REC" ]; then NEG_PATH=$REC; else
      warn "backup does not record a second (negative) target"
      NEG_PATH="$NEGATIVE_STAGING/.missing-backup-target"
    fi
  fi
  check_eq "negative target is OLD" old "$(staged_class "$NEG_PATH")"
fi

# 4. Pre-Plan-B bytes must be preserved for reversibility (6 checks).
if [ -n "$BACKUP_DIR" ]; then
  if [ ! -f "$BACKUP_DIR/$BACKUP_PROVENANCE_FILE" ]; then
    fail "backup provenance present and consistent (missing: $BACKUP_DIR/$BACKUP_PROVENANCE_FILE)"
  elif detail=$(backup_check_provenance "$BACKUP_DIR" 2>&1); then
    if backup_records_staging "$BACKUP_DIR"; then
      pass "backup provenance present and records the staging target(s) + manifest hashes"
    else
      fail "backup provenance does not record this staging target ($STAGING)"
    fi
  else
    fail "backup provenance inconsistent (stale/tampered or wrong layout)"
    printf '%s\n' "$detail" | sed 's/^/      /'
  fi
  check_backup_file "encoder (NEW)" encoder.int8.onnx "$NEW_ENCODER_SHA256" "$NEW_ENCODER_SIZE"
  check_backup_file "decoder (NEW)" decoder.int8.onnx "$NEW_DECODER_SHA256" "$NEW_DECODER_SIZE"
  check_backup_file "joiner (NEW)" joiner.int8.onnx "$NEW_JOINER_SHA256" "$NEW_JOINER_SIZE"
  check_backup_file "tokens (NEW, shared bytes)" tokens.txt "$NEW_TOKENS_SHA256" "$NEW_TOKENS_SIZE"
  check_backup_manifests
fi

# 5. Archive evidence.
if [ "$WITH_ARCHIVES" = 1 ]; then
  check_archives
fi

echo
echo "Plan B state: pins OLD + staged OLD (consistent with ParakeetModelAssets,"
echo "ParakeetModelAssetsTest, verifyParakeetAssets expectations)."
echo "Caveat: old bytes are only reproducible from the preserved old archive;"
echo "the upstream URL now serves the new archive, so fetch cannot recreate them."
summary
