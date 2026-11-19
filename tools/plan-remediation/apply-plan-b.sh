#!/usr/bin/env bash
# Plan B -- restore the OLD staged Parakeet assets (rollback to a consistent
# pinned-old state). DRY-RUN BY DEFAULT: nothing is written unless --apply.
#
# The old bytes are restored from the preserved T5 evidence, never from the
# network: the upstream URL now serves the NEW archive, so re-fetching cannot
# reproduce the pinned OLD bytes.
#
# The current NEW staged bytes are backed up first, so the change is reversible
# with restore-staged-backup.sh.
#
# Remediation copy (Round 7, agent B) fixes:
#   B1  --include-negative is now fully reversible: each target is recorded in
#       BACKUP_DIR/targets.tsv and gets its own directory + manifest, so two
#       staging targets no longer collide in one flat backup namespace. Every
#       backed-up file is hash/size-verified against the canonical NEW bytes.
#   B2  per-file, all-or-nothing install: every OLD source file is pre-staged
#       next to its destination and hash-verified BEFORE any rename; only then
#       are the renames committed. On commit failure the pre-Plan-B bytes are
#       restored from the backup manifest. A failed post-verify also performs a
#       full transactional rollback. Files already OLD are skipped, unknown
#       bytes are refused, so a partially-restored target is repaired safely.
#   B3  recovery-source contract documented and consumed by the reverse
#       script: backup / extracted-new / NEW archive. apply-plan-b.sh keeps
#       --source extracted|extracted-old|archive for the OLD bytes.
#
# Usage:
#   ./apply-plan-b.sh [--repo DIR] [--staging DIR] [--source extracted|archive]
#                     [--backup-dir DIR] [--apply] [--idempotent]
#                     [--include-negative] [--negative-staging DIR]
#
# Exit: 0 = dry-run clean / old bytes restored and verified; 1 = refusal/failure
# (on failure after --apply, the targets are rolled back to their pre-apply bytes).
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
NEGATIVE_STAGING="$NEGATIVE_STAGING_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

WORK=""
TMP_FILES=""
CREATED_BACKUP=0
INSTALL_STARTED=0
TARGET_IDS=()
TARGET_PATHS=()
TARGET_PRE=()

usage() { sed -n '2,40p' "$0"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift 2 ;;
    --staging) STAGING=$2; shift 2 ;;
    --source) SOURCE=$2; shift 2 ;;
    --backup-dir) BACKUP_DIR=$2; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --idempotent) IDEMPOTENT=1; shift ;;
    --include-negative) INCLUDE_NEGATIVE=1; shift ;;
    --negative-staging) NEGATIVE_STAGING=$2; shift 2 ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd tar
require_cmd shasum
require_cmd grep

[ -z "$BACKUP_DIR" ] && BACKUP_DIR="$QUARANTINE_DIR/staged-new-backup-$STAMP"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/r7-plan-b.XXXXXX") || die "mktemp failed"

remove_tmp_path() { # path
  local p=$1 out="" t
  for t in $TMP_FILES; do [ "$t" = "$p" ] || out="$out $t"; done
  TMP_FILES=$out
}

cleanup_on_exit() {
  local rc=$? t
  for t in $TMP_FILES; do rm -f "$t" 2>/dev/null || true; done
  if [ -n "$WORK" ] && [ -d "$WORK" ]; then rm -rf "$WORK" 2>/dev/null || true; fi
  exit "$rc"
}
trap cleanup_on_exit EXIT

# Restore the pre-Plan-B bytes of one target from its backup manifest.
restore_target_pre_state() { # target_id target_path
  local tid=$1 tp=$2 tdir manifest f pre size sha got ok=1
  tdir="$BACKUP_DIR/targets/$tid"
  manifest="$tdir/$BACKUP_TARGET_MANIFEST"
  if [ ! -f "$manifest" ]; then warn "no manifest for target $tid"; return 1; fi
  while IFS=$'\t' read -r f pre size sha; do
    [ -n "$f" ] || continue
    case "$f" in \#*) continue ;; esac
    case "$pre" in
      new)
        if [ ! -f "$tdir/$f" ]; then warn "backup file missing during rollback: $tdir/$f"; ok=0; continue; fi
        if ! copy_preserving "$tdir/$f" "$tp/.plan-b-rb.$f"; then warn "rollback copy failed: $f"; ok=0; continue; fi
        mkdir -p "$tp"
        got=$(sha256_file "$tp/.plan-b-rb.$f")
        if [ "$got" != "$sha" ]; then rm -f "$tp/.plan-b-rb.$f"; warn "rollback temp hash mismatch: $f"; ok=0; continue; fi
        if ! mv -f "$tp/.plan-b-rb.$f" "$tp/$f"; then rm -f "$tp/.plan-b-rb.$f"; warn "rollback rename failed: $f"; ok=0; fi ;;
      missing)
        rm -f "$tp/$f" ;;
      *) warn "invalid pre_state '$pre' for $f"; ok=0 ;;
    esac
  done < "$manifest"
  [ "$ok" = 1 ] || return 1
  return 0
}

rollback_installed() { # -> 0 when every target is byte-identical to pre-apply
  local rows tid tp pre ok=1
  [ "$INSTALL_STARTED" = 1 ] || return 0
  warn "transactional rollback: restoring pre-Plan-B staged bytes for every target"
  if [ "$(backup_layout "$BACKUP_DIR")" != v2 ]; then
    warn "cannot roll back: backup is not a v2 multi-target backup"
    return 1
  fi
  rows=$(backup_read_targets "$BACKUP_DIR")
  while IFS=$'\t' read -r tid tp pre; do
    [ -n "$tid" ] || continue
    if ! restore_target_pre_state "$tid" "$tp"; then ok=0; fi
  done <<EOF
$rows
EOF
  if [ "$ok" = 1 ]; then
    log "rollback complete: targets restored to their pre-apply bytes"
    INSTALL_STARTED=0
    return 0
  fi
  warn "rollback INCOMPLETE; backup retained at $BACKUP_DIR for manual recovery"
  return 1
}

discard_backup_if_created() {
  [ "$CREATED_BACKUP" = 1 ] || return 0
  rm -rf "$BACKUP_DIR" 2>/dev/null || true
  CREATED_BACKUP=0
  log "discarded the backup directory created by this failed run (no target was changed)"
}

# ---------------------------------------------------------------------------
log "Plan B preflight (mode: $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN))"

# 1. repository/pin files (works for linked worktrees: read-only, no .git test).
REPO=$(repo_dir "$REPO")
PINS=$(pins_state "$REPO")
[ "$PINS" = old ] || die "pin state is '$PINS', expected 'old'; Plan B cannot restore old assets under new pins (use Plan A or a full revert first)"
log "pin state is OLD (MODEL_VERSION sha256-1, all old digests) in $REPO"

# 2. archived evidence -- pre-gate before any target is touched.
check_archives
if [ "$FAIL_COUNT" -ne 0 ]; then
  die "archive verification failed ($FAIL_COUNT checks); refusing to touch staged assets (pre-gate)"
fi
PASS_COUNT=0; FAIL_COUNT=0
log "archives verified (OLD preserved + NEW quarantine)"

# 3. resolve the OLD source bytes and verify them against pins.
SRC=""
case "$SOURCE" in
  extracted|extracted-old)
    SRC=$OLD_EXTRACTED
    [ -d "$SRC" ] || die "extracted-old directory missing: $SRC (re-extract from the preserved archive or use --source archive)"
    ;;
  archive)
    log "extracting preserved old archive to $WORK (read-only source)"
    tar -xjf "$OLD_ARCHIVE" -C "$WORK" || die "old archive extraction failed"
    SRC="$WORK/$ARCHIVE_MEMBER_DIR"
    ;;
  *) die "--source must be extracted (alias extracted-old) or archive" ;;
esac
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
PASS_COUNT=0; FAIL_COUNT=0
log "old source verified: $SRC"

# 4. targets (main staging, optionally the negative worktree) -- de-duplicated.
add_target() { # id path
  local id=$1 p=$2 rp i
  rp=$(cd "$p" 2>/dev/null && pwd -P) || rp=$p
  i=0
  while [ "$i" -lt "${#TARGET_PATHS[@]}" ]; do
    if [ "${TARGET_PATHS[$i]}" = "$rp" ]; then
      die "duplicate staging target: $rp (main and negative targets must differ)"
    fi
    i=$((i + 1))
  done
  TARGET_IDS+=("$id")
  TARGET_PATHS+=("$rp")
  TARGET_PRE+=("$(staged_class "$rp")")
}

add_target t1 "$STAGING"
if [ "$INCLUDE_NEGATIVE" = 1 ]; then
  [ -d "$NEGATIVE_STAGING" ] || die "negative staging dir missing: $NEGATIVE_STAGING (pass --negative-staging DIR to override)"
  add_target t2 "$NEGATIVE_STAGING"
fi

# 5. per-file plan: replace NEW->OLD, install when missing, skip OLD, refuse other.
PLAN_TSV="$WORK/plan.tsv"
: > "$PLAN_TSV"
ANY_WRITE=0
REPLACE_COUNT=0
INSTALL_COUNT=0
SKIP_COUNT=0
i=0
while [ "$i" -lt "${#TARGET_PATHS[@]}" ]; do
  tp=${TARGET_PATHS[$i]}
  tid=${TARGET_IDS[$i]}
  if [ ! -d "$tp" ]; then warn "target $tp does not exist yet; it will be created on --apply"; fi
  for f in $MODEL_FILES; do
    if [ -e "$tp/$f" ]; then st=$(file_state "$tp" "$f"); else st=missing; fi
    case "$st" in
      old|shared) act=skip ;;
      new) act=replace ;;
      missing) act=install ;;
      *) die "target $tp file $f is neither canonical OLD nor canonical NEW bytes (state '$st'); inspect before restoring" ;;
    esac
    printf '%s\t%s\t%s\t%s\n' "$tid" "$tp" "$f" "$act" >> "$PLAN_TSV"
    case "$act" in
      replace) ANY_WRITE=1; REPLACE_COUNT=$((REPLACE_COUNT + 1)) ;;
      install) ANY_WRITE=1; INSTALL_COUNT=$((INSTALL_COUNT + 1)) ;;
      skip) SKIP_COUNT=$((SKIP_COUNT + 1)) ;;
    esac
  done
  i=$((i + 1))
done

echo
echo "== Planned Plan B change =="
echo "source        $SRC"
echo "mode          $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)"
i=0
while [ "$i" -lt "${#TARGET_PATHS[@]}" ]; do
  echo "target        ${TARGET_IDS[$i]} ${TARGET_PATHS[$i]} (pre-state $(staged_class "${TARGET_PATHS[$i]}"))"
  i=$((i + 1))
done
echo "files         $MODEL_FILES (replace=$REPLACE_COUNT install=$INSTALL_COUNT skip=$SKIP_COUNT)"
echo "backup dir    $BACKUP_DIR"
echo

if [ "$ANY_WRITE" = 0 ]; then
  if [ "$IDEMPOTENT" = 1 ]; then
    log "all targets already OLD; --idempotent given, verifying only (no backup, no writes)"
    VERIFY_ARGS=(--repo "$REPO" --staging "${TARGET_PATHS[0]}")
    if [ "$INCLUDE_NEGATIVE" = 1 ]; then VERIFY_ARGS+=(--include-negative); fi
    "$HERE/verify-plan-b.sh" "${VERIFY_ARGS[@]}" || die "idempotent verify failed"
    echo "IDEMPOTENT OK: targets are already in the consistent OLD state."
    exit 0
  fi
  die "all targets already have OLD bytes; pass --idempotent to verify only"
fi

if [ "$APPLY" -ne 1 ]; then
  echo "DRY-RUN OK: old source verified, targets classified, no files were written."
  echo "Re-run with --apply to back up current bytes and restore the OLD staged bytes."
  exit 0
fi

# ---------------------------------------------------------------------------
# Apply phase 1 -- backup every byte we are about to replace (defects B1/B2).
if [ -e "$BACKUP_DIR" ]; then
  die "backup dir already exists: $BACKUP_DIR (choose a fresh --backup-dir; stale backups are never overwritten)"
fi
mkdir -p "$BACKUP_DIR/targets" || die "cannot create backup dir: $BACKUP_DIR"
CREATED_BACKUP=1
log "backup dir: $BACKUP_DIR"

{
  echo "# plan-b-backup v2 -- target_id<TAB>target_path<TAB>pre_class"
  i=0
  while [ "$i" -lt "${#TARGET_PATHS[@]}" ]; do
    printf '%s\t%s\t%s\n' "${TARGET_IDS[$i]}" "${TARGET_PATHS[$i]}" "${TARGET_PRE[$i]}"
    i=$((i + 1))
  done
} > "$BACKUP_DIR/$BACKUP_TARGETS_TSV"

i=0
while [ "$i" -lt "${#TARGET_PATHS[@]}" ]; do
  tid=${TARGET_IDS[$i]}
  tp=${TARGET_PATHS[$i]}
  tdir="$BACKUP_DIR/targets/$tid"
  mkdir -p "$tdir"
  manifest="$tdir/$BACKUP_TARGET_MANIFEST"
  : > "$manifest"
  while IFS=$'\t' read -r ptid ptp f act; do
    [ "$ptid" = "$tid" ] || continue
    case "$act" in
      replace)
        copy_preserving "$tp/$f" "$tdir/$f" || { discard_backup_if_created; die "backup copy failed: $tp/$f"; }
        got_sha=$(sha256_file "$tdir/$f")
        got_size=$(file_size "$tdir/$f")
        if [ "$got_sha" != "$(new_sha "$f")" ] || [ "$got_size" != "$(new_size "$f")" ]; then
          discard_backup_if_created
          die "backup $f does not hold the canonical NEW bytes (sha=$got_sha size=$got_size)"
        fi
        printf '%s\t%s\t%s\t%s\n' "$f" new "$got_size" "$got_sha" >> "$manifest"
        ;;
      install)
        printf '%s\t%s\t-\t-\n' "$f" missing >> "$manifest"
        ;;
    esac
  done < "$PLAN_TSV"
  i=$((i + 1))
done

{
  echo "# Plan B staged-asset backup (v2 multi-target)"
  echo "created_utc=$STAMP"
  echo "source_repo=$REPO"
  echo "plan_script=apply-plan-b.sh"
  echo "old_archive_sha256=$OLD_ARCHIVE_SHA256"
  echo "new_archive_sha256=$NEW_ARCHIVE_SHA256"
  echo "format_version=$BACKUP_FORMAT_VERSION"
  echo "target_count=${#TARGET_PATHS[@]}"
  echo "targets_tsv_sha256=$(sha256_file "$BACKUP_DIR/$BACKUP_TARGETS_TSV")"
  i=0
  while [ "$i" -lt "${#TARGET_PATHS[@]}" ]; do
    tid=${TARGET_IDS[$i]}
    echo "manifest_sha256_$tid=$(sha256_file "$BACKUP_DIR/targets/$tid/$BACKUP_TARGET_MANIFEST")"
    i=$((i + 1))
  done
} > "$BACKUP_DIR/$BACKUP_PROVENANCE_FILE"

if ! backup_check_tree "$BACKUP_DIR"; then
  discard_backup_if_created
  die "backup verification failed; refusing to modify any target"
fi
log "backup verified: $REPLACE_COUNT NEW file(s) preserved, $INSTALL_COUNT absent file(s) recorded"

# Apply phase 2 -- pre-stage every OLD file next to its destination and verify.
while IFS=$'\t' read -r tid tp f act; do
  [ "$act" = skip ] && continue
  mkdir -p "$tp" || { discard_backup_if_created; die "cannot create target dir: $tp"; }
  tmp="$tp/.plan-b-tmp.$STAMP.$$.$f"
  copy_preserving "$SRC/$f" "$tmp" || { discard_backup_if_created; die "pre-stage copy failed: $SRC/$f -> $tmp"; }
  TMP_FILES="$TMP_FILES $tmp"
  got_sha=$(sha256_file "$tmp")
  got_size=$(file_size "$tmp")
  if [ "$got_sha" != "$(old_sha "$f")" ] || [ "$got_size" != "$(old_size "$f")" ]; then
    discard_backup_if_created
    die "pre-staged $f hash/size mismatch (sha=$got_sha size=$got_size); no destination was touched"
  fi
done < "$PLAN_TSV"
log "pre-staged $REPLACE_COUNT+$INSTALL_COUNT OLD file(s) and verified every temp copy"

# Apply phase 3 -- commit the renames; all-or-nothing per run.
INSTALL_STARTED=1
while IFS=$'\t' read -r tid tp f act; do
  [ "$act" = skip ] && continue
  tmp="$tp/.plan-b-tmp.$STAMP.$$.$f"
  if ! mv -f "$tmp" "$tp/$f"; then
    warn "rename failed: $tmp -> $tp/$f"
    if rollback_installed; then
      discard_backup_if_created
    else
      warn "backup retained at $BACKUP_DIR for manual recovery"
    fi
    die "install commit failed for $f; targets were rolled back where possible"
  fi
  remove_tmp_path "$tmp"
  got_sha=$(sha256_file "$tp/$f")
  if [ "$got_sha" != "$(old_sha "$f")" ]; then
    warn "installed $f hash mismatch after rename"
    if rollback_installed; then
      discard_backup_if_created
    else
      warn "backup retained at $BACKUP_DIR for manual recovery"
    fi
    die "installed bytes for $f are not the pinned OLD bytes; targets were rolled back where possible"
  fi
done < "$PLAN_TSV"
INSTALL_STARTED=0
log "committed all renames: targets now hold the OLD bytes"

# Record what was installed (evidence; also lets a reviewer re-derive the result).
: > "$BACKUP_DIR/$BACKUP_INSTALL_MANIFEST"
while IFS=$'\t' read -r tid tp f act; do
  [ "$act" = skip ] && continue
  printf '%s\t%s\t%s\t%s\t%s\n' "$tid" "$tp" "$f" "$(file_size "$tp/$f")" "$(sha256_file "$tp/$f")" >> "$BACKUP_DIR/$BACKUP_INSTALL_MANIFEST"
done < "$PLAN_TSV"

# Apply phase 4 -- verify; a failure rolls every target back to its pre-state.
VERIFY_ARGS=(--repo "$REPO" --staging "${TARGET_PATHS[0]}" --backup-dir "$BACKUP_DIR")
if [ "$INCLUDE_NEGATIVE" = 1 ]; then VERIFY_ARGS+=(--include-negative); fi
if ! "$HERE/verify-plan-b.sh" "${VERIFY_ARGS[@]}"; then
  warn "post-apply verification FAILED"
  INSTALL_STARTED=1
  if rollback_installed; then
    discard_backup_if_created
  else
    warn "transactional rollback incomplete; backup retained at $BACKUP_DIR"
  fi
  die "Plan B apply failed verification; targets were rolled back to their pre-apply bytes"
fi

cat <<GATES

Plan B applied: staged model bytes are OLD again and consistent with the OLD pins.
Backup: $BACKUP_DIR (v2 multi-target; recorded in targets.tsv)
Remaining OWNER-GATED steps (not run here):
  1. Confirm: ./check-state.sh --expect old --with-archives
  2. The pre-Plan-B bytes are preserved in the backup dir shown above; the new
     archive remains in quarantine/ for a future Plan A window.
  3. Do NOT run fetch-parakeet-assets.sh while the old pins are in place: the
     upstream URL now serves the NEW archive, so the archive pin check fails
     (this was true before Plan B as well).
  4. Record why adoption was deferred (owner decision) in the release evidence.
GATES
