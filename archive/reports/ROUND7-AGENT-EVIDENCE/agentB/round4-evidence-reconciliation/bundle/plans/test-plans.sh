#!/usr/bin/env bash
# Offline validation harness for Round 4 Plans A and B.
#
# Proves, without touching the real repository or real staged assets:
#   1. every plan script parses (bash -n);
#   2. Plan A patch applies cleanly to the planning baseline (git apply --check);
#   3. Plan A applies to a scratch replica and passes verify-plan-a;
#   4. the Plan A revert patch restores the original six files byte-for-byte;
#   5. Plan A preflight refuses to run when staging holds OLD bytes;
#   6. Plan B restores OLD bytes into a scratch staging dir, passes verify-plan-b,
#      preserves NEW bytes in a backup, refuses double-apply, and is reversible
#      (restore-staged-backup -> back to NEW).
#
# Scratch lives under archive/reports/round4-b-plans/_validation (disposable).
# Usage: ./test-plans.sh [--keep]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/parakeet-pins.env"
. "$HERE/plans-lib.sh"

KEEP=0
[ "$#" -gt 0 ] && [ "$1" = "--keep" ] && KEEP=1
BUILD="$PLAN_ROOT/_validation"
LOG="$BUILD/logs"
rm -rf "$BUILD"
mkdir -p "$BUILD/plan-a-repo" "$BUILD/plan-a-revert-repo" "$BUILD/repo-old" "$LOG"

run_expect_ok() { # description logfile command...
  local desc=$1 lf=$2; shift 2
  if "$@" >"$lf" 2>&1; then pass "$desc"; else fail "$desc (see $lf)"; fi
}
run_expect_fail() { # description logfile command...
  local desc=$1 lf=$2; shift 2
  if "$@" >"$lf" 2>&1; then fail "$desc (unexpectedly succeeded)"; else pass "$desc"; fi
}

copy_pin_files() { # src-repo dst-repo
  local src=$1 dst=$2 f
  for f in $PIN_FILES; do
    mkdir -p "$dst/$(dirname "$f")"
    cp -p "$src/$f" "$dst/$f"
  done
}

clone_staging() { # src-dir dst-dir  (APFS clone when possible; dst must not exist)
  local src=$1 dst=$2
  if cp -cR "$src" "$dst" >/dev/null 2>&1; then :; else cp -R "$src" "$dst"; fi
}

echo "== Build scratch =="
copy_pin_files "$REPO_ROOT" "$BUILD/plan-a-repo"
copy_pin_files "$REPO_ROOT" "$BUILD/plan-a-revert-repo"
copy_pin_files "$REPO_ROOT" "$BUILD/repo-old"
clone_staging "$NEW_EXTRACTED" "$BUILD/staging-new"
clone_staging "$OLD_EXTRACTED" "$BUILD/staging-old"

step() { echo; echo "### $*"; }

step "1. Shell syntax of every plan artifact"
for s in "$HERE"/*.sh "$HERE/parakeet-pins.env"; do
  if bash -n "$s"; then pass "bash -n $(basename "$s")"; else fail "bash -n $(basename "$s")"; fi
done

step "2. Plan A patch dry-run against the real repository (read-only)"
run_expect_ok "plan-a-adoption.patch applies cleanly to real HEAD" "$LOG/git-apply-check.log" \
  git -C "$REPO_ROOT" apply --check "$HERE/$PLAN_A_PATCH_NAME"
run_expect_ok "plan-a-revert.patch is the byte-exact inverse (dry-run)" "$LOG/git-apply-revert-check.log" \
  bash -c "git -C \"$REPO_ROOT\" apply --check \"$HERE/$PLAN_A_PATCH_NAME\" && ! git -C \"$REPO_ROOT\" apply --check \"$HERE/$PLAN_A_REVERT_PATCH_NAME\""

step "3. Plan A applies to a scratch replica and verifies"
run_expect_ok "apply plan-a-adoption.patch to scratch replica" "$LOG/patch-a.log" \
  bash -c "cd \"$BUILD/plan-a-repo\" && patch -p1 --batch --forward < \"$HERE/$PLAN_A_PATCH_NAME\""
run_expect_ok "verify-plan-a on scratch replica" "$LOG/verify-a.log" \
  "$HERE/verify-plan-a.sh" --repo "$BUILD/plan-a-repo" --staging "$BUILD/staging-new"
run_expect_ok "check-state classifies scratch Plan A as new" "$LOG/check-a-new.log" \
  "$HERE/check-state.sh" --repo "$BUILD/plan-a-repo" --staging "$BUILD/staging-new" --expect new
run_expect_fail "check-state rejects new pins with old staging" "$LOG/check-a-mixed.log" \
  "$HERE/check-state.sh" --repo "$BUILD/plan-a-repo" --staging "$BUILD/staging-old" --expect new

step "4. Plan A revert patch restores byte-identical files"
cp -p "$HERE/$PLAN_A_PATCH_NAME" "$BUILD/plan-a-revert-repo/"
bash -c "cd \"$BUILD/plan-a-revert-repo\" && patch -p1 --batch --forward < \"$HERE/$PLAN_A_PATCH_NAME\"" >"$LOG/patch-a2.log" 2>&1
if bash -c "cd \"$BUILD/plan-a-revert-repo\" && patch -p1 --batch --reverse < \"$HERE/$PLAN_A_PATCH_NAME\"" >>"$LOG/revert-a.log" 2>&1; then
  DIFFS=0
  for f in $PIN_FILES; do
    if ! cmp -s "$BUILD/plan-a-revert-repo/$f" "$REPO_ROOT/$f"; then DIFFS=$((DIFFS + 1)); fi
  done
  check_eq "revert restores all six files byte-identically" 0 "$DIFFS"
else
  fail "revert patch applies to scratch replica"
fi
run_expect_ok "check-state classifies reverted + new staged as hazard" "$LOG/check-reverted.log" \
  "$HERE/check-state.sh" --repo "$BUILD/plan-a-revert-repo" --staging "$BUILD/staging-new" --expect mixed

step "5. Plan A preflight refusals"
git -C "$BUILD/repo-old" init -q
git -C "$BUILD/repo-old" add -A
git -C "$BUILD/repo-old" -c user.email=plan@test -c user.name=plan commit -q -m "scratch old-pin baseline"
run_expect_ok "dry-run Plan A on old pins + new staging" "$LOG/apply-a-dry.log" \
  "$HERE/apply-plan-a.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-new" --allow-head
run_expect_fail "Plan A refuses when staging is OLD" "$LOG/apply-a-refuse-old.log" \
  "$HERE/apply-plan-a.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-old" --allow-head
run_expect_ok "check-state after Plan A dry-run still reports hazard" "$LOG/check-a-dry.log" \
  "$HERE/check-state.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-new" --expect mixed

step "6. Plan B restores OLD bytes into scratch staging"
mkdir -p "$BUILD/staging-b"
cp -p "$BUILD/staging-new"/*.onnx "$BUILD/staging-new"/*.txt "$BUILD/staging-b/"
run_expect_ok "dry-run Plan B on committed NEW staging" "$LOG/apply-b-dry.log" \
  "$HERE/apply-plan-b.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --backup-dir "$BUILD/backup-b"
run_expect_ok "apply Plan B (restores OLD, backs up NEW)" "$LOG/apply-b.log" \
  "$HERE/apply-plan-b.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --backup-dir "$BUILD/backup-b" --apply
run_expect_ok "verify-plan-b passes" "$LOG/verify-b.log" \
  "$HERE/verify-plan-b.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --backup-dir "$BUILD/backup-b"
run_expect_ok "check-state classifies scratch Plan B as old" "$LOG/check-b-old.log" \
  "$HERE/check-state.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --expect old
run_expect_fail "Plan B refuses a second apply without --idempotent" "$LOG/apply-b-twice.log" \
  "$HERE/apply-plan-b.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --backup-dir "$BUILD/backup-b2" --apply
run_expect_ok "Plan B --idempotent verifies an already-old staging" "$LOG/apply-b-idem.log" \
  "$HERE/apply-plan-b.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --backup-dir "$BUILD/backup-b3" --idempotent

step "7. Reverse Plan B (rollback of the rollback)"
run_expect_ok "restore-staged-backup returns NEW bytes" "$LOG/restore-new.log" \
  "$HERE/restore-staged-backup.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --backup-dir "$BUILD/backup-b" --apply
run_expect_ok "check-state classifies restored staging + old pins as hazard" "$LOG/check-restored.log" \
  "$HERE/check-state.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --expect mixed
run_expect_ok "Plan B can be re-applied to the restored staging" "$LOG/apply-b-again.log" \
  "$HERE/apply-plan-b.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --backup-dir "$BUILD/backup-b-again" --apply
run_expect_ok "final scratch state is consistent OLD" "$LOG/check-b-final.log" \
  "$HERE/check-state.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-b" --expect old

step "8. Plan B refusal under new pins; archive-source dry-run"
run_expect_fail "Plan B refuses when pins are NEW" "$LOG/apply-b-refuse-new.log" \
  "$HERE/apply-plan-b.sh" --repo "$BUILD/plan-a-repo" --staging "$BUILD/staging-old" --backup-dir "$BUILD/backup-refuse"
run_expect_ok "Plan B dry-run from preserved archive source" "$LOG/apply-b-archive-dry.log" \
  "$HERE/apply-plan-b.sh" --repo "$BUILD/repo-old" --staging "$BUILD/staging-new" --source archive --backup-dir "$BUILD/backup-archive"

echo
echo "== Result =="
echo "validation scratch: $BUILD"
[ "$KEEP" = 1 ] || log "scratch kept for inspection (remove with: rm -rf $BUILD)"
summary
