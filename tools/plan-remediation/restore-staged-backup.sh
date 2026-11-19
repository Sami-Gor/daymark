#!/usr/bin/env bash
# Reverse Plan B -- restore the pre-Plan-B staged model bytes (normally the NEW
# bytes backed up by apply-plan-b.sh). DRY-RUN BY DEFAULT.
#
# Remediation copy (Round 7, agent B) fixes:
#   B1  restores every target recorded in BACKUP_DIR/targets.tsv, including the
#       negative worktree via --include-negative, instead of silently restoring
#       only one staging dir. Per-file hash verification against the manifest
#       (or the canonical NEW digests for recovery sources) is mandatory.
#   B2  pre-stage all bytes + verify, then commit renames; current bytes are
#       saved first so a commit failure can be rolled back.
#   B3  alternate recovery sources: --source backup (default; exact pre-state,
#       including removing files that were absent before Plan B),
#       --source extracted-new, --source archive (force a consistent NEW set).
#   A4  stale/tampered backup manifests are refused (provenance pins the
#       targets.tsv and per-target manifest sha256 values).
#
# Usage:
#   ./restore-staged-backup.sh --backup-dir DIR [--repo DIR] [--staging DIR]
#                              [--source backup|extracted-new|archive]
#                              [--include-negative] [--apply] [--idempotent]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/parakeet-pins.env"
. "$HERE/plans-lib.sh"

REPO=$REPO_ROOT
STAGING=$STAGING_DIR
BACKUP_DIR=""
SOURCE=backup
APPLY=0
IDEMPOTENT=0
INCLUDE_NEGATIVE=0

WORK=""
TMP_FILES=""
PRE_FILES=""
COMMIT_STARTED=0
TARGET_IDS=()
TARGET_PATHS=()
TARGET_SRCS=()

usage() { sed -n '2,28p' "$0"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift 2 ;;
    --staging) STAGING=$2; shift 2 ;;
    --backup-dir) BACKUP_DIR=$2; shift 2 ;;
    --source) SOURCE=$2; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --idempotent) IDEMPOTENT=1; shift ;;
    --include-negative) INCLUDE_NEGATIVE=1; shift ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd shasum
require_cmd grep
[ -n "$BACKUP_DIR" ] || die "--backup-dir is required"
[ -d "$BACKUP_DIR" ] || die "backup dir not found: $BACKUP_DIR"
LAYOUT=$(backup_layout "$BACKUP_DIR")
[ "$LAYOUT" != none ] || die "backup dir is not a Plan B backup (no targets.tsv/backup-manifest.tsv): $BACKUP_DIR"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/r7-plan-b-restore.XXXXXX") || die "mktemp failed"

cleanup_on_exit() {
  local rc=$? t
  for t in $TMP_FILES; do rm -f "$t" 2>/dev/null || true; done
  for t in $PRE_FILES; do rm -f "$t" 2>/dev/null || true; done
  if [ -n "$WORK" ] && [ -d "$WORK" ]; then rm -rf "$WORK" 2>/dev/null || true; fi
  exit "$rc"
}
trap cleanup_on_exit EXIT

remove_tmp_path() { # path
  local p=$1 out="" t
  for t in $TMP_FILES; do [ "$t" = "$p" ] || out="$out $t"; done
  TMP_FILES=$out
}

STAGING=$(cd "$STAGING" 2>/dev/null && pwd -P) || STAGING=$STAGING

log "Reverse Plan B preflight (mode: $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN), source: $SOURCE)"

# ---------------------------------------------------------------------------
# 1. Validate the backup itself (manifests + backed-up bytes) for the backup
#    source; for alternate sources the manifests are still the target record.
# ---------------------------------------------------------------------------
if ! detail=$(backup_check_tree "$BACKUP_DIR" 2>&1); then
  printf '%s\n' "$detail" | sed 's/^/      /'
  die "backup is stale/tampered/incomplete; refusing to restore from it"
fi
log "backup provenance, targets and per-target manifests verified"

# 2. Build the target list (v2 multi-target or legacy single-target).
if [ "$LAYOUT" = v2 ]; then
  ROWS=$(backup_read_targets "$BACKUP_DIR")
  COUNT=$(backup_target_count "$BACKUP_DIR")
  [ -n "$ROWS" ] || die "targets.tsv records no targets"
  MAIN_ID=""
  MAIN_PATH=""
  OTHER_ID=""
  OTHER_PATH=""
  while IFS=$'\t' read -r tid path pre; do
    [ -n "$tid" ] || continue
    if [ "$path" = "$STAGING" ]; then
      MAIN_ID=$tid; MAIN_PATH=$path
    else
      if [ -n "$OTHER_ID" ]; then die "backup records more than two targets; refusing (unsupported layout)"; fi
      OTHER_ID=$tid; OTHER_PATH=$path
    fi
  done <<EOF
$ROWS
EOF
  if [ -z "$MAIN_ID" ]; then
    if [ "$COUNT" = 1 ]; then
      while IFS=$'\t' read -r tid path pre; do [ -n "$tid" ] || continue; MAIN_ID=$tid; MAIN_PATH=$path; done <<EOF
$ROWS
EOF
      warn "--staging $STAGING does not match the recorded target $MAIN_PATH; using the recorded target"
    else
      die "backup records targets but none matches --staging $STAGING; pass the recorded path (see $BACKUP_DIR/$BACKUP_TARGETS_TSV)"
    fi
  fi
  if [ -n "$OTHER_ID" ]; then
    if [ "$INCLUDE_NEGATIVE" != 1 ]; then
      die "backup records a second target ($OTHER_PATH); re-run with --include-negative to restore all recorded targets"
    fi
    TARGET_IDS+=("$MAIN_ID"); TARGET_PATHS+=("$MAIN_PATH")
    TARGET_IDS+=("$OTHER_ID"); TARGET_PATHS+=("$OTHER_PATH")
  else
    if [ "$INCLUDE_NEGATIVE" = 1 ]; then
      die "backup has no second (negative) target; drop --include-negative"
    fi
    TARGET_IDS+=("$MAIN_ID"); TARGET_PATHS+=("$MAIN_PATH")
  fi
else
  # legacy flat backup: one target, positional --staging.
  if [ "$INCLUDE_NEGATIVE" = 1 ]; then
    die "legacy (round 4) backup has no negative target record; --include-negative is not reversible for it"
  fi
  TARGET_IDS+=("t1"); TARGET_PATHS+=("$STAGING")
fi
log "targets: ${#TARGET_PATHS[@]} (main $STAGING)"

# ---------------------------------------------------------------------------
# 3. Resolve the recovery source.
# ---------------------------------------------------------------------------
case "$SOURCE" in
  backup)
    log "source bytes: the verified backup (exact pre-Plan-B state)"
    ;;
  extracted-new)
    [ -d "$NEW_EXTRACTED" ] || die "extracted-new directory missing: $NEW_EXTRACTED"
    for f in $MODEL_FILES; do
      [ -f "$NEW_EXTRACTED/$f" ] || die "recovery source missing: $NEW_EXTRACTED/$f"
      check_eq "recovery source $f size" "$(new_size "$f")" "$(file_size "$NEW_EXTRACTED/$f")"
      check_eq "recovery source $f sha256" "$(new_sha "$f")" "$(sha256_file "$NEW_EXTRACTED/$f")"
    done
    [ "$FAIL_COUNT" = 0 ] || die "extracted-new recovery source does not match canonical NEW bytes"
    PASS_COUNT=0; FAIL_COUNT=0
    ;;
  archive)
    log "extracting NEW archive to $WORK (read-only recovery source)"
    tar -xjf "$NEW_ARCHIVE" -C "$WORK" || die "new archive extraction failed"
    NEW_EXTRACTED="$WORK/$ARCHIVE_MEMBER_DIR"
    for f in $MODEL_FILES; do
      [ -f "$NEW_EXTRACTED/$f" ] || die "recovery source missing: $NEW_EXTRACTED/$f"
      check_eq "recovery source $f size" "$(new_size "$f")" "$(file_size "$NEW_EXTRACTED/$f")"
      check_eq "recovery source $f sha256" "$(new_sha "$f")" "$(sha256_file "$NEW_EXTRACTED/$f")"
    done
    [ "$FAIL_COUNT" = 0 ] || die "archive recovery source does not match canonical NEW bytes"
    PASS_COUNT=0; FAIL_COUNT=0
    ;;
  *) die "--source must be backup, extracted-new or archive" ;;
esac

# ---------------------------------------------------------------------------
# 4. Build the per-file action plan.
#    backup source  -> restore manifest pre_state: new = write recorded bytes,
#                      missing = remove the file Plan B installed.
#    other sources  -> force every model file to its canonical NEW bytes.
# ---------------------------------------------------------------------------
PLAN_TSV="$WORK/restore-plan.tsv"
: > "$PLAN_TSV"
ANY_WRITE=0
i=0
while [ "$i" -lt "${#TARGET_PATHS[@]}" ]; do
  tid=${TARGET_IDS[$i]}
  tp=${TARGET_PATHS[$i]}
  if [ ! -d "$tp" ]; then warn "target dir does not exist: $tp"; fi
  if [ "$SOURCE" = backup ]; then
    tdir=$(backup_target_dir "$BACKUP_DIR" "$tid")
    manifest="$tdir/$BACKUP_TARGET_MANIFEST"
    if [ "$LAYOUT" = legacy ]; then tdir="$BACKUP_DIR"; manifest="$BACKUP_DIR/backup-manifest.tsv"; fi
    while IFS=$'\t' read -r f pre size sha extra; do
      [ -n "$f" ] || continue
      case "$f" in \#*) continue ;; esac
      if [ "$LAYOUT" != v2 ]; then sha=$size; size=$pre; pre=new; fi
      case "$pre" in
        new)
          if [ -f "$tp/$f" ] && [ "$(sha256_file "$tp/$f")" = "$sha" ]; then
            act=skip
          else
            act=write
          fi
          printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$tid" "$tp" "$f" "$act" "$size" "$sha" >> "$PLAN_TSV"
          ;;
        missing)
          if [ -e "$tp/$f" ]; then act=remove; else act=skip; fi
          printf '%s\t%s\t%s\t%s\t-\t-\n' "$tid" "$tp" "$f" "$act" >> "$PLAN_TSV"
          ;;
        *) die "invalid pre_state '$pre' in $manifest" ;;
      esac
      [ "$act" = skip ] || ANY_WRITE=1
    done < "$manifest"
  else
    for f in $MODEL_FILES; do
      st=missing
      if [ -e "$tp/$f" ]; then st=$(file_state "$tp" "$f"); fi
      case "$st" in
        new|shared) act=skip ;;
        old|missing) act=write ;;
        *) warn "target $tp file $f holds unknown bytes; recovery source will overwrite it"; act=write ;;
      esac
      printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$tid" "$tp" "$f" "$act" "$(new_size "$f")" "$(new_sha "$f")" >> "$PLAN_TSV"
      [ "$act" = skip ] || ANY_WRITE=1
    done
  fi
  i=$((i + 1))
done

echo
echo "== Planned reverse-Plan-B change =="
echo "backup dir    $BACKUP_DIR"
echo "source        $SOURCE"
echo "mode          $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)"
i=0
while [ "$i" -lt "${#TARGET_PATHS[@]}" ]; do
  echo "target        ${TARGET_IDS[$i]} ${TARGET_PATHS[$i]} (state $(staged_class "${TARGET_PATHS[$i]}"))"
  i=$((i + 1))
done
echo "actions       $(grep -c -v 'skip$' "$PLAN_TSV" || true) write/remove, $(grep -c 'skip$' "$PLAN_TSV" || true) skip"
echo

if [ "$ANY_WRITE" = 0 ]; then
  if [ "$IDEMPOTENT" = 1 ]; then
    log "targets already match the requested source state; --idempotent given, verifying only"
    APPLY=0
  else
    die "targets already match the requested source state; pass --idempotent to verify only"
  fi
fi

if [ "$APPLY" -ne 1 ]; then
  echo "DRY-RUN OK: backup/source verified and action plan built; no files were written."
  echo "Re-run with --apply to restore the staged bytes."
  exit 0
fi

# ---------------------------------------------------------------------------
# 5. Pre-stage every write, saving current bytes for commit rollback.
# ---------------------------------------------------------------------------
while IFS=$'\t' read -r tid tp f act size sha; do
  [ -n "$f" ] || continue
  [ "$act" = skip ] && continue
  mkdir -p "$tp" || die "cannot create target dir: $tp"
  if [ "$act" = remove ]; then
    # save the current file for rollback, but stage no replacement
    presave="$WORK/pre.$tid.$f"
    copy_preserving "$tp/$f" "$presave" || die "cannot save current bytes: $tp/$f"
    PRE_FILES="$PRE_FILES $presave"
    continue
  fi
  if [ "$SOURCE" = backup ]; then
    src_file="$(backup_target_dir "$BACKUP_DIR" "$tid")/$f"
    if [ "$LAYOUT" = legacy ]; then src_file="$BACKUP_DIR/$f"; fi
  else
    src_file="$NEW_EXTRACTED/$f"
  fi
  [ -f "$src_file" ] || die "source file missing: $src_file"
  if [ -e "$tp/$f" ]; then
    presave="$WORK/pre.$tid.$f"
    copy_preserving "$tp/$f" "$presave" || die "cannot save current bytes: $tp/$f"
    PRE_FILES="$PRE_FILES $presave"
  fi
  tmp="$tp/.plan-b-restore-tmp.$$.$f"
  copy_preserving "$src_file" "$tmp" || die "pre-stage copy failed: $src_file -> $tmp"
  TMP_FILES="$TMP_FILES $tmp"
  got=$(sha256_file "$tmp")
  if [ "$got" != "$sha" ] || [ "$(file_size "$tmp")" != "$size" ]; then
    die "pre-staged $f hash/size mismatch (got $got); no destination was touched"
  fi
done < "$PLAN_TSV"
log "pre-staged and hash-verified every replacement; destination bytes saved for rollback"

restore_commit_rollback() {
  local tid tp f act size sha presave ok=1
  warn "commit failure: restoring the pre-restore bytes saved in $WORK"
  while IFS=$'\t' read -r tid tp f act size sha; do
    [ -n "$f" ] || continue
    [ "$act" = skip ] && continue
    presave="$WORK/pre.$tid.$f"
    if [ -f "$presave" ]; then
      cp -p "$presave" "$tp/.plan-b-restore-rb.$f" 2>/dev/null || { ok=0; continue; }
      mv -f "$tp/.plan-b-restore-rb.$f" "$tp/$f" || ok=0
    else
      rm -f "$tp/$f"
    fi
  done < "$PLAN_TSV"
  [ "$ok" = 1 ] || warn "rollback incomplete; re-run this script with --apply to converge"
}

# 6. Commit the renames/removals; roll back on failure.
COMMIT_STARTED=1
while IFS=$'\t' read -r tid tp f act size sha; do
  [ -n "$f" ] || continue
  [ "$act" = skip ] && continue
  if [ "$act" = remove ]; then
    if ! rm -f "$tp/$f"; then
      restore_commit_rollback
      die "failed to remove $tp/$f"
    fi
    log "  removed $f (was absent before Plan B)"
    continue
  fi
  tmp="$tp/.plan-b-restore-tmp.$$.$f"
  if ! mv -f "$tmp" "$tp/$f"; then
    restore_commit_rollback
    die "rename failed: $tmp -> $tp/$f"
  fi
  remove_tmp_path "$tmp"
  got=$(sha256_file "$tp/$f")
  if [ "$got" != "$sha" ]; then
    restore_commit_rollback
    die "restored $f hash mismatch after rename"
  fi
  log "  restored $f"
done < "$PLAN_TSV"
COMMIT_STARTED=0

# ---------------------------------------------------------------------------
# 7. Verify the final state byte-for-byte against the requested source.
# ---------------------------------------------------------------------------
FAILED=0
i=0
while [ "$i" -lt "${#TARGET_PATHS[@]}" ]; do
  tid=${TARGET_IDS[$i]}
  tp=${TARGET_PATHS[$i]}
  if [ "$SOURCE" = backup ]; then
    tdir=$(backup_target_dir "$BACKUP_DIR" "$tid")
    manifest="$tdir/$BACKUP_TARGET_MANIFEST"
    if [ "$LAYOUT" = legacy ]; then
      tdir="$BACKUP_DIR"
      manifest="$BACKUP_DIR/backup-manifest.tsv"
    fi
    while IFS=$'\t' read -r f pre size sha extra; do
      [ -n "$f" ] || continue
      case "$f" in \#*) continue ;; esac
      if [ "$LAYOUT" != v2 ]; then sha=$size; size=$pre; pre=new; fi
      case "$pre" in
        new)
          if [ ! -f "$tp/$f" ] || [ "$(sha256_file "$tp/$f")" != "$sha" ]; then
            warn "post-restore mismatch: $tp/$f"; FAILED=$((FAILED + 1))
          fi ;;
        missing)
          if [ -e "$tp/$f" ]; then warn "post-restore file should be absent: $tp/$f"; FAILED=$((FAILED + 1)); fi ;;
      esac
    done < "$manifest"
  else
    if [ "$(staged_class "$tp")" != new ]; then
      warn "post-restore target is not a consistent NEW set: $tp"
      staged_report "$tp" | sed 's/^/      /'
      FAILED=$((FAILED + 1))
    fi
  fi
  i=$((i + 1))
done

if [ "$FAILED" -ne 0 ]; then
  die "reverse Plan B verification failed ($FAILED target/file mismatches)"
fi

echo
echo "OK: staged bytes restored from source '$SOURCE' for ${#TARGET_PATHS[@]} target(s)."
echo "Backup retained at $BACKUP_DIR (can be removed once Plan A pins are applied and the"
echo "old archive is preserved; keep it until the owner-gated window closes)."
if [ "$SOURCE" = backup ]; then
  echo "State: pre-Plan-B hazard (pins OLD + staged NEW) unless Plan A pins are applied."
else
  echo "State: staged NEW (hazard with OLD pins; run apply-plan-a.sh under an approved window)."
fi
