#!/usr/bin/env bash
# Shared read-only helpers for the Parakeet Plan A/B rollout scripts.
#
# Remediation copy (Round 7, agent B). Behaviour is identical to
# archive/reports/round4-b-plans/plans-lib.sh for every existing helper; the
# additions are repo/worktree resolution, per-file classification, APFS-clone
# copies, and Plan B backup-layout verification used by the fixed scripts.
#
# Sourced after parakeet-pins.env. No side effects at source time.

PASS_COUNT=0
FAIL_COUNT=0

die()  { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARN:  $*" >&2; }
log()  { echo "[*] $*"; }
note() { echo "NOTE:  $*"; }
pass() { PASS_COUNT=$((PASS_COUNT + 1)); echo "PASS  $*"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); echo "FAIL  $*"; }

check_eq() { # name expected actual
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected $2, got $3)"; fi
}

check_ne() { # name value forbidden
  if [ "$2" != "$3" ]; then pass "$1"; else fail "$1 (forbidden value present: $3)"; fi
}

check_file() { # name path
  if [ -f "$2" ]; then pass "$1"; else fail "$1 (missing: $2)"; fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

file_size() { # prints decimal byte size
  wc -c < "$1" | tr -d ' '
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

# ---------------------------------------------------------------------------
# Repository / worktree resolution (defect A1).
# A linked git worktree has a .git *file*, not a directory, so the round 4
# preflight [ -d "$REPO/.git" ] rejected every worktree. Resolve through git
# itself instead, and always operate on the repository top level (defect A1
# repo-root handling: git apply is cwd-relative, so a subdirectory argument
# must never be used as the apply root).
# ---------------------------------------------------------------------------

# repo_dir DIR -> absolute directory that holds the six pin files. Uses the git
# top level when DIR is inside a worktree; falls back to DIR for plain copies
# (the read-only verifiers must also work on non-git scratch replicas).
repo_dir() {
  local dir=$1 top
  [ -d "$dir" ] || die "directory not found: $dir"
  if command -v git >/dev/null 2>&1; then
    top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || true)
    if [ -n "$top" ] && [ -d "$top" ]; then echo "$top"; return 0; fi
  fi
  (cd "$dir" && pwd -P)
}

# git_repo_root DIR -> absolute top level of a real git checkout/worktree,
# dying (not falling back) when DIR is not a git repository.
git_repo_root() {
  local dir=$1 top
  command -v git >/dev/null 2>&1 || die "required command not found: git"
  top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || true)
  [ -n "$top" ] || die "not a git repository or linked worktree: $dir (linked worktrees have a .git file; git -C must resolve it)"
  [ -d "$top" ] || die "git reported a missing top level for $dir: $top"
  echo "$top"
}

# copy_preserving SRC DST -> APFS clone when the filesystem supports it
# (copy-on-write, cheap for the ~639 MiB model files), else a byte copy.
# A clone is a real independent file: later writes/renames cannot modify SRC.
copy_preserving() {
  local src=$1 dst=$2
  cp -c -p "$src" "$dst" >/dev/null 2>&1 && return 0
  cp -p "$src" "$dst"
}

count_literal() { # file literal -> occurrence count
  local file=$1 lit=$2
  if [ ! -f "$file" ]; then echo 0; return 0; fi
  grep -F -o -- "$lit" "$file" 2>/dev/null | wc -l | tr -d ' '
}

count_in_pins() { # repo literal -> total occurrences across the six pin files
  local repo=$1 lit=$2 total=0 f n
  for f in $PIN_FILES; do
    n=$(count_literal "$repo/$f" "$lit")
    total=$((total + n))
  done
  echo "$total"
}

pins_state() { # repo -> new | old | mixed | missing
  local repo=$1 f
  for f in $PIN_FILES; do
    if [ ! -f "$repo/$f" ]; then echo missing; return 0; fi
  done
  local na ne nd nj nv nt oa oe od oj ov ot nse nsd ose osd
  na=$(count_in_pins "$repo" "$NEW_ARCHIVE_SHA256")
  ne=$(count_in_pins "$repo" "$NEW_ENCODER_SHA256")
  nd=$(count_in_pins "$repo" "$NEW_DECODER_SHA256")
  nj=$(count_in_pins "$repo" "$NEW_JOINER_SHA256")
  nv=$(count_in_pins "$repo" "$NEW_MODEL_VERSION")
  nt=$(count_in_pins "$repo" "$NEW_TOKENS_SHA256")
  oa=$(count_in_pins "$repo" "$OLD_ARCHIVE_SHA256")
  oe=$(count_in_pins "$repo" "$OLD_ENCODER_SHA256")
  od=$(count_in_pins "$repo" "$OLD_DECODER_SHA256")
  oj=$(count_in_pins "$repo" "$OLD_JOINER_SHA256")
  ov=$(count_in_pins "$repo" "$OLD_MODEL_VERSION")
  ot=$(count_in_pins "$repo" "$OLD_TOKENS_SHA256")
  nse=$(count_in_pins "$repo" "${NEW_ENCODER_SIZE}L")
  nsd=$(count_in_pins "$repo" "${NEW_DECODER_SIZE}L")
  ose=$(count_in_pins "$repo" "${OLD_ENCODER_SIZE}L")
  osd=$(count_in_pins "$repo" "${OLD_DECODER_SIZE}L")
  local new_ok=0 old_ok=0
  if [ "$na" = "$PIN_COUNT_ARCHIVE" ] && [ "$ne" = "$PIN_COUNT_MEMBER" ] && [ "$nd" = "$PIN_COUNT_MEMBER" ] &&
     [ "$nj" = "$PIN_COUNT_MEMBER" ] && [ "$nt" = "$PIN_COUNT_MEMBER" ] && [ "$nv" = "$PIN_COUNT_MODEL_VERSION" ] &&
     [ "$nse" = "$PIN_COUNT_SIZE" ] && [ "$nsd" = "$PIN_COUNT_SIZE" ] &&
     [ "$oa" = 0 ] && [ "$oe" = 0 ] && [ "$od" = 0 ] && [ "$oj" = 0 ] && [ "$ov" = 0 ]; then new_ok=1; fi
  if [ "$na" = 0 ] && [ "$ne" = 0 ] && [ "$nd" = 0 ] && [ "$nj" = 0 ] && [ "$nv" = 0 ] &&
     [ "$oa" = "$PIN_COUNT_ARCHIVE" ] && [ "$oe" = "$PIN_COUNT_MEMBER" ] && [ "$od" = "$PIN_COUNT_MEMBER" ] &&
     [ "$oj" = "$PIN_COUNT_MEMBER" ] && [ "$ot" = "$PIN_COUNT_MEMBER" ] && [ "$ov" = "$PIN_COUNT_MODEL_VERSION" ] &&
     [ "$ose" = "$PIN_COUNT_SIZE" ] && [ "$osd" = "$PIN_COUNT_SIZE" ] &&
     [ "$nse" = 0 ] && [ "$nsd" = 0 ]; then old_ok=1; fi
  if [ "$new_ok" = 1 ]; then echo new
  elif [ "$old_ok" = 1 ]; then echo old
  else echo mixed; fi
}

pins_table() { # repo -> human-readable literal counts (label count)
  local repo=$1
  echo "new_archive=$(count_in_pins "$repo" "$NEW_ARCHIVE_SHA256")"
  echo "new_encoder=$(count_in_pins "$repo" "$NEW_ENCODER_SHA256")"
  echo "new_decoder=$(count_in_pins "$repo" "$NEW_DECODER_SHA256")"
  echo "new_joiner=$(count_in_pins "$repo" "$NEW_JOINER_SHA256")"
  echo "new_model_version=$(count_in_pins "$repo" "$NEW_MODEL_VERSION")"
  echo "old_archive=$(count_in_pins "$repo" "$OLD_ARCHIVE_SHA256")"
  echo "old_encoder=$(count_in_pins "$repo" "$OLD_ENCODER_SHA256")"
  echo "old_decoder=$(count_in_pins "$repo" "$OLD_DECODER_SHA256")"
  echo "old_joiner=$(count_in_pins "$repo" "$OLD_JOINER_SHA256")"
  echo "old_model_version=$(count_in_pins "$repo" "$OLD_MODEL_VERSION")"
  echo "tokens=$(count_in_pins "$repo" "$NEW_TOKENS_SHA256")"
  echo "new_encoder_size=$(count_in_pins "$repo" "${NEW_ENCODER_SIZE}L")"
  echo "new_decoder_size=$(count_in_pins "$repo" "${NEW_DECODER_SIZE}L")"
  echo "old_encoder_size=$(count_in_pins "$repo" "${OLD_ENCODER_SIZE}L")"
  echo "old_decoder_size=$(count_in_pins "$repo" "${OLD_DECODER_SIZE}L")"
}

staged_class() { # staging-dir -> new | old | mixed | missing
  local dir=$1 f h
  local new_hits=0 old_hits=0 missing=0 other=0
  for f in $MODEL_FILES; do
    if [ ! -f "$dir/$f" ]; then missing=1; continue; fi
    h=$(sha256_file "$dir/$f")
    case "$f" in
      encoder.int8.onnx)
        if [ "$h" = "$NEW_ENCODER_SHA256" ]; then new_hits=$((new_hits + 1));
        elif [ "$h" = "$OLD_ENCODER_SHA256" ]; then old_hits=$((old_hits + 1)); else other=1; fi ;;
      decoder.int8.onnx)
        if [ "$h" = "$NEW_DECODER_SHA256" ]; then new_hits=$((new_hits + 1));
        elif [ "$h" = "$OLD_DECODER_SHA256" ]; then old_hits=$((old_hits + 1)); else other=1; fi ;;
      joiner.int8.onnx)
        if [ "$h" = "$NEW_JOINER_SHA256" ]; then new_hits=$((new_hits + 1));
        elif [ "$h" = "$OLD_JOINER_SHA256" ]; then old_hits=$((old_hits + 1)); else other=1; fi ;;
      tokens.txt)
        # tokens.txt is byte-identical in the OLD and NEW archives: it must not
        # influence the OLD/NEW class, only prove it is one of the two.
        if [ "$h" != "$NEW_TOKENS_SHA256" ] && [ "$h" != "$OLD_TOKENS_SHA256" ]; then other=1; fi ;;
    esac
  done
  if [ "$missing" = 1 ]; then echo missing
  elif [ "$other" = 1 ]; then echo mixed
  elif [ "$new_hits" = 3 ] && [ "$old_hits" = 0 ]; then echo new
  elif [ "$old_hits" = 3 ] && [ "$new_hits" = 0 ]; then echo old
  else echo mixed; fi
}

staged_report() { # staging-dir -> per-file hash/size/class
  local dir=$1 f h s
  for f in $MODEL_FILES; do
    if [ ! -f "$dir/$f" ]; then echo "$f missing - -"; continue; fi
    h=$(sha256_file "$dir/$f")
    s=$(file_size "$dir/$f")
    local cls=other
    case "$f" in
      encoder.int8.onnx)
        if [ "$h" = "$NEW_ENCODER_SHA256" ]; then cls=new; elif [ "$h" = "$OLD_ENCODER_SHA256" ]; then cls=old; fi ;;
      decoder.int8.onnx)
        if [ "$h" = "$NEW_DECODER_SHA256" ]; then cls=new; elif [ "$h" = "$OLD_DECODER_SHA256" ]; then cls=old; fi ;;
      joiner.int8.onnx)
        if [ "$h" = "$NEW_JOINER_SHA256" ]; then cls=new; elif [ "$h" = "$OLD_JOINER_SHA256" ]; then cls=old; fi ;;
      tokens.txt)
        if [ "$h" = "$NEW_TOKENS_SHA256" ] || [ "$h" = "$OLD_TOKENS_SHA256" ]; then cls=shared; fi ;;
    esac
    echo "$f $s $h $cls"
  done
}

# ---- per-file canonical values (Plan B per-file transaction support) -------

new_sha() { case "$1" in
  encoder.int8.onnx) echo "$NEW_ENCODER_SHA256" ;;
  decoder.int8.onnx) echo "$NEW_DECODER_SHA256" ;;
  joiner.int8.onnx) echo "$NEW_JOINER_SHA256" ;;
  tokens.txt) echo "$NEW_TOKENS_SHA256" ;;
  *) echo "" ;; esac; }

new_size() { case "$1" in
  encoder.int8.onnx) echo "$NEW_ENCODER_SIZE" ;;
  decoder.int8.onnx) echo "$NEW_DECODER_SIZE" ;;
  joiner.int8.onnx) echo "$NEW_JOINER_SIZE" ;;
  tokens.txt) echo "$NEW_TOKENS_SIZE" ;;
  *) echo "" ;; esac; }

old_sha() { case "$1" in
  encoder.int8.onnx) echo "$OLD_ENCODER_SHA256" ;;
  decoder.int8.onnx) echo "$OLD_DECODER_SHA256" ;;
  joiner.int8.onnx) echo "$OLD_JOINER_SHA256" ;;
  tokens.txt) echo "$OLD_TOKENS_SHA256" ;;
  *) echo "" ;; esac; }

old_size() { case "$1" in
  encoder.int8.onnx) echo "$OLD_ENCODER_SIZE" ;;
  decoder.int8.onnx) echo "$OLD_DECODER_SIZE" ;;
  joiner.int8.onnx) echo "$OLD_JOINER_SIZE" ;;
  tokens.txt) echo "$OLD_TOKENS_SIZE" ;;
  *) echo "" ;; esac; }

# file_state DIR FILE -> new | old | shared | other | missing
# "shared" is returned for tokens.txt, whose bytes are identical in both states.
file_state() {
  local dir=$1 f=$2 h
  if [ ! -e "$dir/$f" ]; then echo missing; return 0; fi
  if [ ! -f "$dir/$f" ]; then echo other; return 0; fi
  h=$(sha256_file "$dir/$f")
  case "$f" in
    encoder.int8.onnx)
      if [ "$h" = "$NEW_ENCODER_SHA256" ]; then echo new; return 0; fi
      if [ "$h" = "$OLD_ENCODER_SHA256" ]; then echo old; return 0; fi ;;
    decoder.int8.onnx)
      if [ "$h" = "$NEW_DECODER_SHA256" ]; then echo new; return 0; fi
      if [ "$h" = "$OLD_DECODER_SHA256" ]; then echo old; return 0; fi ;;
    joiner.int8.onnx)
      if [ "$h" = "$NEW_JOINER_SHA256" ]; then echo new; return 0; fi
      if [ "$h" = "$OLD_JOINER_SHA256" ]; then echo old; return 0; fi ;;
    tokens.txt)
      if [ "$h" = "$NEW_TOKENS_SHA256" ] || [ "$h" = "$OLD_TOKENS_SHA256" ]; then echo shared; return 0; fi ;;
  esac
  echo other
}

check_archives() { # verifies both archives size+sha; logs PASS/FAIL
  if [ -f "$OLD_ARCHIVE" ]; then
    check_eq "old archive size" "$OLD_ARCHIVE_SIZE" "$(file_size "$OLD_ARCHIVE")"
    check_eq "old archive sha256" "$OLD_ARCHIVE_SHA256" "$(sha256_file "$OLD_ARCHIVE")"
  else
    fail "old archive present ($OLD_ARCHIVE)"
  fi
  if [ -f "$NEW_ARCHIVE" ]; then
    check_eq "new archive size" "$NEW_ARCHIVE_SIZE" "$(file_size "$NEW_ARCHIVE")"
    check_eq "new archive sha256" "$NEW_ARCHIVE_SHA256" "$(sha256_file "$NEW_ARCHIVE")"
  else
    fail "new archive present ($NEW_ARCHIVE)"
  fi
}

summary() {
  echo "----------------------------------------"
  echo "checks passed: $PASS_COUNT   failed: $FAIL_COUNT"
  if [ "$FAIL_COUNT" -ne 0 ]; then return 1; fi
  return 0
}

# ---------------------------------------------------------------------------
# Plan B backup layout helpers (defects B1/B2/B3).
#
# v2 layout:
#   BACKUP_DIR/BACKUP-PROVENANCE.txt
#   BACKUP_DIR/targets.tsv                       id <TAB> target path <TAB> pre-class
#   BACKUP_DIR/targets/<id>/backup-manifest.tsv  file <TAB> pre_state <TAB> size <TAB> sha256
#   BACKUP_DIR/targets/<id>/<file>               backed-up pre-existing bytes
#
# legacy layout (round 4): BACKUP_DIR/backup-manifest.tsv (file size sha) +
# flat files; only a single target and only pre_state=new rows.
# ---------------------------------------------------------------------------

backup_layout() { # backup-dir -> v2 | legacy | none
  local b=$1
  if [ -f "$b/$BACKUP_TARGETS_TSV" ]; then echo v2; return 0; fi
  if [ -f "$b/backup-manifest.tsv" ]; then echo legacy; return 0; fi
  echo none
}

backup_provenance_get() { # backup-dir key -> value (empty when absent)
  local b=$1 k=$2
  [ -f "$b/$BACKUP_PROVENANCE_FILE" ] || return 0
  grep "^$k=" "$b/$BACKUP_PROVENANCE_FILE" 2>/dev/null | head -1 | cut -d= -f2-
}

backup_target_dir() { # backup-dir target-id -> directory holding that target's backup
  local b=$1 tid=$2 layout
  layout=$(backup_layout "$b")
  if [ "$layout" = v2 ]; then echo "$b/targets/$tid"; else echo "$b"; fi
}

backup_target_manifest() { # backup-dir target-id -> manifest path
  echo "$(backup_target_dir "$1" "$2")/$BACKUP_TARGET_MANIFEST"
}

backup_read_targets() { # backup-dir -> id<TAB>path<TAB>pre_class lines (v2 only)
  local b=$1
  [ "$(backup_layout "$b")" = v2 ] || return 0
  grep -v '^#' "$b/$BACKUP_TARGETS_TSV" 2>/dev/null | grep -v '^[[:space:]]*$' || true
}

backup_target_count() { # backup-dir -> number of recorded targets
  local b=$1 n=0
  if [ "$(backup_layout "$b")" = v2 ]; then
    n=$(backup_read_targets "$b" | wc -l | tr -d ' ')
  elif [ "$(backup_layout "$b")" = legacy ]; then
    n=1
  fi
  echo "$n"
}

# backup_check_provenance BACKUP_DIR -> 0 ok, 1 bad; prints issue lines.
backup_check_provenance() {
  local b=$1 layout issues=0 fmt count actual rec tid path pre
  if [ ! -f "$b/$BACKUP_PROVENANCE_FILE" ]; then
    echo "missing provenance: $b/$BACKUP_PROVENANCE_FILE"; return 1
  fi
  layout=$(backup_layout "$b")
  if [ "$layout" = none ]; then
    echo "backup dir has neither targets.tsv nor backup-manifest.tsv"; return 1
  fi
  if [ "$layout" = legacy ]; then
    for k in created_utc source_repo plan_script old_archive_sha256 new_archive_sha256; do
      if [ -z "$(backup_provenance_get "$b" "$k")" ]; then echo "legacy provenance missing $k"; issues=$((issues + 1)); fi
    done
    [ "$issues" = 0 ] && return 0
    return 1
  fi
  fmt=$(backup_provenance_get "$b" format_version)
  if [ "$fmt" != "$BACKUP_FORMAT_VERSION" ]; then
    echo "provenance format_version '$fmt' != '$BACKUP_FORMAT_VERSION'"; issues=$((issues + 1))
  fi
  if [ ! -f "$b/$BACKUP_TARGETS_TSV" ]; then
    echo "missing targets.tsv"; issues=$((issues + 1))
  else
    actual=$(sha256_file "$b/$BACKUP_TARGETS_TSV")
    rec=$(backup_provenance_get "$b" targets_tsv_sha256)
    if [ -z "$rec" ]; then echo "provenance missing targets_tsv_sha256"; issues=$((issues + 1))
    elif [ "$rec" != "$actual" ]; then echo "targets.tsv sha256 mismatch (stale/tampered manifest)"; issues=$((issues + 1)); fi
  fi
  count=$(backup_provenance_get "$b" target_count)
  actual=$(backup_target_count "$b")
  if [ -z "$count" ]; then echo "provenance missing target_count"; issues=$((issues + 1))
  elif [ "$count" != "$actual" ]; then echo "provenance target_count $count != recorded $actual"; issues=$((issues + 1)); fi
  while IFS=$'\t' read -r tid path pre; do
    [ -n "$tid" ] || continue
    if [ -z "$path" ] || [ -z "$pre" ]; then
      echo "malformed targets.tsv line: $tid"; issues=$((issues + 1)); continue
    fi
    rec=$(backup_provenance_get "$b" "manifest_sha256_$tid")
    if [ -z "$rec" ]; then
      echo "provenance missing manifest_sha256_$tid"; issues=$((issues + 1)); continue
    fi
    if [ ! -f "$(backup_target_manifest "$b" "$tid")" ]; then
      echo "missing manifest for target $tid"; issues=$((issues + 1)); continue
    fi
    actual=$(sha256_file "$(backup_target_manifest "$b" "$tid")")
    if [ "$rec" != "$actual" ]; then
      echo "manifest sha256 mismatch for target $tid (stale/tampered manifest)"; issues=$((issues + 1))
    fi
  done <<EOF
$(backup_read_targets "$b")
EOF
  if [ "$issues" -ne 0 ]; then return 1; fi
  return 0
}

# backup_check_manifest BACKUP_DIR TARGET_ID -> 0 ok, 1 bad; prints issues.
# Validates: file names, pre_state values, duplicates, per-file size/hash against
# the canonical NEW values, no unlisted/missing backup files.
backup_check_manifest() {
  local b=$1 tid=$2 layout tdir manifest f pre size sha extra issues=0 seen=" " m found
  layout=$(backup_layout "$b")
  tdir=$(backup_target_dir "$b" "$tid")
  manifest="$tdir/$BACKUP_TARGET_MANIFEST"
  if [ ! -f "$manifest" ]; then echo "missing manifest: $manifest"; return 1; fi
  if [ "$layout" = v2 ]; then
    while IFS=$'\t' read -r f pre size sha extra; do
      [ -n "$f" ] || continue
      case "$f" in \#*) continue ;; esac
      found=0
      for m in $MODEL_FILES; do [ "$m" = "$f" ] && found=1; done
      if [ "$found" != 1 ]; then echo "manifest lists unknown file: $f"; issues=$((issues + 1)); continue; fi
      case "$seen" in *" $f "*) echo "duplicate manifest entry: $f"; issues=$((issues + 1)); continue ;; esac
      seen="$seen$f "
      case "$pre" in
        new)
          if [ "$size" != "$(new_size "$f")" ]; then echo "$f manifest size $size != canonical $(new_size "$f")"; issues=$((issues + 1)); fi
          if [ "$sha" != "$(new_sha "$f")" ]; then echo "$f manifest sha256 != canonical NEW digest"; issues=$((issues + 1)); fi
          if [ ! -f "$tdir/$f" ]; then echo "backup file missing: $f"; issues=$((issues + 1));
          else
            if [ "$(file_size "$tdir/$f")" != "$(new_size "$f")" ]; then echo "$f backup size mismatch"; issues=$((issues + 1)); fi
            if [ "$(sha256_file "$tdir/$f")" != "$(new_sha "$f")" ]; then echo "$f backup sha256 mismatch (stale/tampered backup)"; issues=$((issues + 1)); fi
          fi ;;
        missing)
          if [ -e "$tdir/$f" ]; then echo "backup file present although pre_state=missing: $f"; issues=$((issues + 1)); fi ;;
        *) echo "invalid pre_state '$pre' for $f"; issues=$((issues + 1)) ;;
      esac
    done < "$manifest"
  else
    while IFS=$'\t' read -r f size sha extra; do
      [ -n "$f" ] || continue
      case "$f" in \#*) continue ;; esac
      found=0
      for m in $MODEL_FILES; do [ "$m" = "$f" ] && found=1; done
      if [ "$found" != 1 ]; then echo "manifest lists unknown file: $f"; issues=$((issues + 1)); continue; fi
      case "$seen" in *" $f "*) echo "duplicate manifest entry: $f"; issues=$((issues + 1)); continue ;; esac
      seen="$seen$f "
      if [ "$size" != "$(new_size "$f")" ]; then echo "$f manifest size $size != canonical $(new_size "$f")"; issues=$((issues + 1)); fi
      if [ "$sha" != "$(new_sha "$f")" ]; then echo "$f manifest sha256 != canonical NEW digest"; issues=$((issues + 1)); fi
      if [ ! -f "$tdir/$f" ]; then echo "backup file missing: $f"; issues=$((issues + 1));
      else
        if [ "$(file_size "$tdir/$f")" != "$(new_size "$f")" ]; then echo "$f backup size mismatch"; issues=$((issues + 1)); fi
        if [ "$(sha256_file "$tdir/$f")" != "$(new_sha "$f")" ]; then echo "$f backup sha256 mismatch (stale/tampered backup)"; issues=$((issues + 1)); fi
      fi
    done < "$manifest"
  fi
  # Every model file that exists in the backup dir must be listed; no strays.
  for m in $MODEL_FILES; do
    if [ -e "$tdir/$m" ]; then
      case "$seen" in *" $m "*) : ;; *) echo "unlisted backup file: $m"; issues=$((issues + 1)) ;; esac
    fi
  done
  for f in "$tdir"/*; do
    [ -e "$f" ] || continue
    [ -f "$f" ] || continue
    m=$(basename "$f")
    [ "$m" = "$BACKUP_TARGET_MANIFEST" ] && continue
    case " $MODEL_FILES " in *" $m "*) : ;; *) echo "unexpected file in backup dir: $m"; issues=$((issues + 1)) ;; esac
  done
  if [ "$seen" = " " ]; then echo "manifest has no entries"; issues=$((issues + 1)); fi
  if [ "$issues" -ne 0 ]; then return 1; fi
  return 0
}

# backup_check_tree BACKUP_DIR [TARGET_ID...] -> 0 ok; prints issue lines.
# Cross-checks provenance, targets, manifests and bytes. With no target ids it
# checks every recorded target.
backup_check_tree() {
  local b=$1 issues=0 tid rest ids="" target
  shift || true
  if [ "$#" -gt 0 ]; then ids="$*"; else
    if [ "$(backup_layout "$b")" = v2 ]; then
      while IFS=$'\t' read -r tid rest; do [ -n "$tid" ] && ids="$ids $tid"; done <<EOF
$(backup_read_targets "$b")
EOF
    else
      ids="t1"
    fi
  fi
  backup_check_provenance "$b" || issues=$((issues + 1))
  for target in $ids; do
    backup_check_manifest "$b" "$target" || issues=$((issues + 1))
  done
  if [ "$issues" -ne 0 ]; then return 1; fi
  return 0
}
