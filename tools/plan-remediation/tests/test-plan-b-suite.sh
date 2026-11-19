#!/usr/bin/env bash
# Plan B remediation regression suite (Round 7, agent B).
#
# Covers defect fixes B1 (--include-negative reversibility: targets.tsv,
# restore --include-negative, hash verification), B2 (per-file pre-stage +
# all-or-nothing commit + transactional rollback, partial-failure repair),
# B3 (alternate recovery sources backup/extracted-new/archive), stale manifest
# detection (A4/B3), repeated execution, and the canonical 30-check Plan B
# verifier suite with byte-identical before/after hashes.
#
# All staging targets are APFS clones under the disposable T5 cache scratch; the
# real repository/staged assets/quarantine/archives are only ever read.
TEST_SUITE=plan-b
export TEST_SUITE
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/test-lib.sh"

suite_setup
require_fixtures

KIT="$KIT"
LOG="$LOGS"

t_info "kit: $KIT"
t_info "scratch: $SCRATCH"

# ---- fixture / production read-only snapshots ------------------------------
hash_set "$NEW_EXTRACTED" "$SCRATCH/fixtures-new-pre.sha"
hash_set "$OLD_EXTRACTED" "$SCRATCH/fixtures-old-pre.sha"
shasum -a 256 "$OLD_ARCHIVE" "$NEW_ARCHIVE" > "$SCRATCH/archives-pre.sha"
if [ -d "$STAGING_DIR" ]; then hash_set "$STAGING_DIR" "$SCRATCH/real-staging-pre.sha"; fi
if [ -d "$NEGATIVE_STAGING_DIR" ]; then hash_set "$NEGATIVE_STAGING_DIR" "$SCRATCH/real-negative-pre.sha"; fi

SYNTAX_FAIL=0
for s in "$KIT"/*.sh "$KIT"/parakeet-pins.env "$KIT"/tests/*.sh; do bash -n "$s" || SYNTAX_FAIL=$((SYNTAX_FAIL + 1)); done
assert_eq "all plan/remediation scripts + pins env parse (bash -n)" 0 "$SYNTAX_FAIL"

if grep -q 'targets.tsv' "$KIT/apply-plan-b.sh" && grep -q 'targets.tsv' "$KIT/restore-staged-backup.sh"; then
  t_pass "B1: targets.tsv target recording present in apply and restore"
else
  t_fail "B1: targets.tsv target recording missing"
fi
if grep -q -- '--include-negative' "$KIT/restore-staged-backup.sh"; then
  t_pass "B1: restore-staged-backup.sh supports --include-negative"
else
  t_fail "B1: restore --include-negative missing"
fi

# ---- scratch repo + staging clones ----------------------------------------
make_pin_repo "$SCRATCH/repo"
git -C "$SCRATCH/repo" worktree add -q --detach "$SCRATCH/wt" 2>>"$LOG/setup.log" || t_fail "linked worktree fixture failed"
STAGE="$SCRATCH/stage"
NEG="$SCRATCH/stage-neg"
B1="$SCRATCH/backup-main"
new_staging "$STAGE"
new_staging "$NEG"
old_staging "$SCRATCH/old-ref"
hash_set "$STAGE" "$SCRATCH/stage-before.sha"
hash_set "$SCRATCH/old-ref" "$SCRATCH/old-ref.sha"

# ---- 1. dry-run is side-effect free ---------------------------------------
run_expect_ok "Plan B dry-run on NEW staging" "$LOG/dry.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$B1"
assert_grep "dry-run reports DRY-RUN OK" "DRY-RUN OK" "$LOG/dry.log"
hash_set "$STAGE" "$SCRATCH/stage-after-dry.sha"
assert_same_bytes "dry-run leaves staged bytes byte-identical" "$SCRATCH/stage-before.sha" "$SCRATCH/stage-after-dry.sha"

# ---- 2. canonical apply + 30-check verifier ------------------------------
run_expect_ok "Plan B apply: backup NEW then restore OLD" "$LOG/apply.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$B1" --apply
assert_grep "apply auto-verify reports 30/0" "checks passed: 30" "$LOG/apply.log"
hash_set "$STAGE" "$SCRATCH/stage-old.sha"
assert_same_bytes "applied staging bytes equal the canonical OLD set" "$SCRATCH/old-ref.sha" "$SCRATCH/stage-old.sha"

run_expect_ok "explicit verify-plan-b run" "$LOG/verify.log" \
  "$KIT/verify-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$B1"
assert_counts "canonical Plan B suite (main staging + backup + archives) = 30 checks" "$LOG/verify.log" 30 0

run_expect_ok "check-state classifies scratch Plan B as plan-b" "$LOG/check-old.log" \
  "$KIT/check-state.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --expect old

TARGET_ROWS=$(grep -c -v '^#' "$B1/targets.tsv" || true)
assert_eq "B1: targets.tsv records exactly one target for a main-only run" 1 "$TARGET_ROWS"
assert_grep "B1: targets.tsv records the staging path" "$SCRATCH/stage" "$B1/targets.tsv"
BACKUP_FILES=$(ls "$B1/targets/t1" | grep -c -E '^(encoder|decoder|joiner)\.int8\.onnx$' || true)
assert_eq "B1: backup preserves the 3 replaced NEW files (tokens shared -> not copied)" 3 "$BACKUP_FILES"
assert_eq "B1: backup encoder bytes = canonical NEW" "$NEW_ENCODER_SHA256" "$(sha256_file "$B1/targets/t1/encoder.int8.onnx")"
assert_eq "B1: backup decoder bytes = canonical NEW" "$NEW_DECODER_SHA256" "$(sha256_file "$B1/targets/t1/decoder.int8.onnx")"
assert_eq "B1: backup joiner bytes = canonical NEW" "$NEW_JOINER_SHA256" "$(sha256_file "$B1/targets/t1/joiner.int8.onnx")"

# ---- 3. reverse restore is byte-identical --------------------------------
hash_set "$STAGE" "$SCRATCH/pre-restore.sha"
run_expect_ok "restore dry-run on OLD staging" "$LOG/restore-dry.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$B1"
assert_grep "restore dry-run reports DRY-RUN OK" "DRY-RUN OK" "$LOG/restore-dry.log"
hash_set "$STAGE" "$SCRATCH/post-restore-dry.sha"
assert_same_bytes "restore dry-run leaves bytes unchanged" "$SCRATCH/pre-restore.sha" "$SCRATCH/post-restore-dry.sha"

run_expect_ok "restore --apply returns the NEW bytes" "$LOG/restore.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$B1" --apply
hash_set "$STAGE" "$SCRATCH/restored.sha"
assert_same_bytes "byte-identical before/after apply+restore cycle" "$SCRATCH/stage-before.sha" "$SCRATCH/restored.sha"
run_expect_ok "check-state after restore classifies the known hazard" "$LOG/check-hazard.log" \
  "$KIT/check-state.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --expect mixed


# ---- 4. stale/tampered backup artifacts are refused (A4/B3) ---------------
# Put staging OLD so verification reaches the backup checks.
rm -rf "$STAGE"; old_staging "$STAGE"

cp -cR "$B1" "$SCRATCH/backup-tamper-manifest" 2>/dev/null || cp -R "$B1" "$SCRATCH/backup-tamper-manifest"
TM="$SCRATCH/backup-tamper-manifest/targets/t1/backup-manifest.tsv"
awk 'BEGIN{OFS="\t"} $1=="encoder.int8.onnx"{$4="deadbeefdeadbeef"} {print}' "$TM" > "$TM.tmp" && mv -f "$TM.tmp" "$TM"
run_expect_fail "stale/tampered backup manifest fails verify-plan-b" "$LOG/verify-stale-manifest.log" \
  "$KIT/verify-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-tamper-manifest" --no-archives
assert_grep "stale manifest reason reported" "stale|mismatch" "$LOG/verify-stale-manifest.log"
run_expect_fail "stale/tampered backup manifest refused by restore" "$LOG/restore-stale-manifest.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-tamper-manifest"
assert_grep "restore refuses stale backup" "stale|tampered|refusing" "$LOG/restore-stale-manifest.log"

cp -cR "$B1" "$SCRATCH/backup-tamper-bytes" 2>/dev/null || cp -R "$B1" "$SCRATCH/backup-tamper-bytes"
cp -c -p "$OLD_EXTRACTED/encoder.int8.onnx" "$SCRATCH/backup-tamper-bytes/targets/t1/encoder.int8.onnx"
run_expect_fail "tampered backup bytes fail verify-plan-b" "$LOG/verify-stale-bytes.log" \
  "$KIT/verify-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-tamper-bytes" --no-archives
assert_grep "tampered byte reason reported" "sha256 mismatch|stale|tampered" "$LOG/verify-stale-bytes.log"
run_expect_fail "tampered backup bytes refused by restore" "$LOG/restore-stale-bytes.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-tamper-bytes"

cp -cR "$B1" "$SCRATCH/backup-tamper-targets" 2>/dev/null || cp -R "$B1" "$SCRATCH/backup-tamper-targets"
printf 't9\t%s\tnew\n' "$SCRATCH/other-target" >> "$SCRATCH/backup-tamper-targets/targets.tsv"
run_expect_fail "stale targets.tsv fails verify-plan-b" "$LOG/verify-stale-targets.log" \
  "$KIT/verify-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-tamper-targets" --no-archives
assert_grep "targets mismatch reported" "target_count|mismatch" "$LOG/verify-stale-targets.log"

# ---- 5. repeated execution and idempotence --------------------------------
run_expect_fail "second apply on OLD staging refused without --idempotent" "$LOG/apply-twice-refused.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-should-not-exist" --apply
assert_absent "refused second apply creates no backup dir" "$SCRATCH/backup-should-not-exist"

rm -rf "$STAGE"; new_staging "$STAGE"
B2="$SCRATCH/backup-repeat"
run_expect_ok "repeat: fresh Plan B apply after restore" "$LOG/apply-repeat.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$B2" --apply
hash_set "$STAGE" "$SCRATCH/idem-before.sha"
run_expect_ok "idempotent dry-run on already-OLD staging" "$LOG/apply-idem-dry.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-idem-dry" --idempotent
run_expect_ok "idempotent --apply verifies only and writes nothing" "$LOG/apply-idem-apply.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-idem-apply" --idempotent --apply
assert_absent "idempotent --apply creates no backup dir" "$SCRATCH/backup-idem-apply"
hash_set "$STAGE" "$SCRATCH/idem-after.sha"
assert_same_bytes "idempotent --apply leaves staged bytes byte-identical" "$SCRATCH/idem-before.sha" "$SCRATCH/idem-after.sha"

# ---- 6. B3 alternate recovery sources -------------------------------------
run_expect_ok "B3: restore from extracted-new source" "$LOG/restore-extracted-new.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$B2" --source extracted-new --apply
hash_set "$STAGE" "$SCRATCH/alt-new.sha"
assert_same_bytes "B3: extracted-new restore returns canonical NEW bytes" "$SCRATCH/stage-before.sha" "$SCRATCH/alt-new.sha"

rm -rf "$STAGE"; old_staging "$STAGE"
run_expect_ok "B3: restore from NEW archive source" "$LOG/restore-archive.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$B2" --source archive --apply
hash_set "$STAGE" "$SCRATCH/alt-archive.sha"
assert_same_bytes "B3: archive restore returns canonical NEW bytes" "$SCRATCH/stage-before.sha" "$SCRATCH/alt-archive.sha"

rm -rf "$STAGE"; old_staging "$STAGE"
run_expect_ok "B3: restore from backup source (default)" "$LOG/restore-backup.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$B2" --source backup --apply
hash_set "$STAGE" "$SCRATCH/alt-backup.sha"
assert_same_bytes "B3: backup restore returns canonical NEW bytes" "$SCRATCH/stage-before.sha" "$SCRATCH/alt-backup.sha"


# ---- 7. B1 --include-negative: two targets, reversible --------------------
rm -rf "$STAGE" "$NEG"; new_staging "$STAGE"; new_staging "$NEG"
hash_set "$STAGE" "$SCRATCH/neg-main-before.sha"
hash_set "$NEG" "$SCRATCH/neg-target-before.sha"
BNEG="$SCRATCH/backup-negative"
run_expect_ok "B1: apply --include-negative to main + negative targets" "$LOG/apply-negative.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --include-negative --negative-staging "$NEG" --backup-dir "$BNEG" --apply
assert_grep "include-negative auto-verify reports 31/0" "checks passed: 31" "$LOG/apply-negative.log"
run_expect_ok "B1: verify-plan-b --include-negative" "$LOG/verify-negative.log" \
  "$KIT/verify-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --include-negative --negative-staging "$NEG" --backup-dir "$BNEG"
assert_counts "B1: include-negative verifier = 31 checks" "$LOG/verify-negative.log" 31 0
ROWS=$(grep -c -v '^#' "$BNEG/targets.tsv" || true)
assert_eq "B1: targets.tsv records both targets" 2 "$ROWS"
assert_grep "B1: targets.tsv records the main target" "$SCRATCH/stage" "$BNEG/targets.tsv"
assert_grep "B1: targets.tsv records the negative target" "$SCRATCH/stage-neg" "$BNEG/targets.tsv"
T1F=$(ls "$BNEG/targets/t1" | grep -c -E '^(encoder|decoder|joiner)\.int8\.onnx$' || true)
T2F=$(ls "$BNEG/targets/t2" | grep -c -E '^(encoder|decoder|joiner)\.int8\.onnx$' || true)
assert_eq "B1: target t1 backup holds its 3 replaced files" 3 "$T1F"
assert_eq "B1: target t2 backup holds its 3 replaced files (no namespace collision)" 3 "$T2F"
hash_set "$NEG" "$SCRATCH/neg-main-old.sha"
assert_same_bytes "B1: negative target staged bytes are now canonical OLD" "$SCRATCH/old-ref.sha" "$SCRATCH/neg-main-old.sha"

run_expect_fail "B1: restore without --include-negative refuses a two-target backup" "$LOG/restore-negative-refused.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$BNEG"
assert_grep "B1: refusal explains --include-negative" "include-negative" "$LOG/restore-negative-refused.log"
run_expect_ok "B1: restore --include-negative --apply reverses both targets" "$LOG/restore-negative.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --include-negative --backup-dir "$BNEG" --apply
hash_set "$STAGE" "$SCRATCH/neg-main-after.sha"
hash_set "$NEG" "$SCRATCH/neg-target-after.sha"
assert_same_bytes "B1: main target byte-identical after include-negative cycle" "$SCRATCH/neg-main-before.sha" "$SCRATCH/neg-main-after.sha"
assert_same_bytes "B1: negative target byte-identical after include-negative cycle" "$SCRATCH/neg-target-before.sha" "$SCRATCH/neg-target-after.sha"

# ---- 8. missing target directory: install then exact undo ------------------
MISS="$SCRATCH/stage-missing"
rm -rf "$MISS"
BMISS="$SCRATCH/backup-missing"
run_expect_ok "B2: apply into an absent staging dir (fresh checkout)" "$LOG/apply-missing.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$MISS" --backup-dir "$BMISS" --apply
run_expect_ok "B2: verify an installed-from-absent target" "$LOG/verify-missing.log" \
  "$KIT/verify-plan-b.sh" --repo "$SCRATCH/repo" --staging "$MISS" --backup-dir "$BMISS"
assert_counts "B2: missing-target verify = 30 checks" "$LOG/verify-missing.log" 30 0
FCOUNT=$(ls "$MISS" 2>/dev/null | grep -c -E '\.(onnx|txt)$' || true)
assert_eq "B2: absent target was populated with the 4 OLD files" 4 "$FCOUNT"
run_expect_ok "B2: restore removes files that were absent before Plan B" "$LOG/restore-missing.log" \
  "$KIT/restore-staged-backup.sh" --repo "$SCRATCH/repo" --staging "$MISS" --backup-dir "$BMISS" --apply
LEFT=$(ls "$MISS" 2>/dev/null | grep -c -E '\.(onnx|txt)$' || true)
assert_eq "B2: absent pre-state restored exactly (no model files remain)" 0 "$LEFT"

# ---- 9. partial failure: commit rename fails, target untouched ------------
rm -rf "$STAGE"; new_staging "$STAGE"
hash_set "$STAGE" "$SCRATCH/partial-before.sha"
make_mv_shim "$SCRATCH/shim"
BFail="$SCRATCH/backup-partial-fail"
rm -f "$SCRATCH/mv-shim-count"
run_expect_fail "B2: injected rename failure aborts the install" "$LOG/apply-partial-fail.log" \
  env PATH="$SCRATCH/shim:$PATH" MV_SHIM_COUNTER="$SCRATCH/mv-shim-count" MV_SHIM_FAIL_AT=2 \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$BFail" --apply
assert_grep "B2: injected failure was seen by the script" "injected failure|rename failed" "$LOG/apply-partial-fail.log"
hash_set "$STAGE" "$SCRATCH/partial-after.sha"
assert_same_bytes "B2: partial failure leaves staged bytes byte-identical" "$SCRATCH/partial-before.sha" "$SCRATCH/partial-after.sha"
assert_absent "B2: partial failure discards the just-created backup dir" "$BFail"
assert_eq "B2: no pre-stage temp files leaked" "" "$(ls -a "$STAGE" | grep -E '^\.plan-b-tmp' || true)"
run_expect_ok "B2: recovery apply after partial failure succeeds" "$LOG/apply-partial-recovery.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-partial-recovery" --apply
run_expect_ok "B2: verify after recovery apply" "$LOG/verify-partial-recovery.log" \
  "$KIT/verify-plan-b.sh" --repo "$SCRATCH/repo" --staging "$STAGE" --backup-dir "$SCRATCH/backup-partial-recovery"
assert_counts "B2: recovery verify = 30 checks" "$LOG/verify-partial-recovery.log" 30 0

# ---- 10. linked worktree is accepted by Plan B ----------------------------
rm -rf "$STAGE"; new_staging "$STAGE"
run_expect_ok "Plan B dry-run with --repo pointing at a linked worktree" "$LOG/dry-linked.log" \
  "$KIT/apply-plan-b.sh" --repo "$SCRATCH/wt" --staging "$STAGE" --backup-dir "$SCRATCH/backup-linked"
assert_grep "linked-worktree Plan B dry-run OK" "DRY-RUN OK" "$LOG/dry-linked.log"

# ---- 11. production bytes unchanged by the suite -------------------------
hash_set "$NEW_EXTRACTED" "$SCRATCH/fixtures-new-post.sha"
hash_set "$OLD_EXTRACTED" "$SCRATCH/fixtures-old-post.sha"
assert_same_bytes "production NEW extracted bytes unchanged by suite" "$SCRATCH/fixtures-new-pre.sha" "$SCRATCH/fixtures-new-post.sha"
assert_same_bytes "production OLD extracted bytes unchanged by suite" "$SCRATCH/fixtures-old-pre.sha" "$SCRATCH/fixtures-old-post.sha"
shasum -a 256 "$OLD_ARCHIVE" "$NEW_ARCHIVE" > "$SCRATCH/archives-post.sha"
assert_same_bytes "preserved OLD/NEW archives unchanged by suite" "$SCRATCH/archives-pre.sha" "$SCRATCH/archives-post.sha"
if [ -f "$SCRATCH/real-staging-pre.sha" ]; then
  hash_set "$STAGING_DIR" "$SCRATCH/real-staging-post.sha"
  assert_same_bytes "production staged model assets unchanged by suite" "$SCRATCH/real-staging-pre.sha" "$SCRATCH/real-staging-post.sha"
fi
if [ -f "$SCRATCH/real-negative-pre.sha" ]; then
  hash_set "$NEGATIVE_STAGING_DIR" "$SCRATCH/real-negative-post.sha"
  assert_same_bytes "production negative-worktree staged assets unchanged by suite" "$SCRATCH/real-negative-pre.sha" "$SCRATCH/real-negative-post.sha"
fi

suite_finish
