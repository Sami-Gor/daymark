#!/usr/bin/env bash
# Round 7 Plan A/B remediation -- master regression runner.
#
# 1. static defect checks (each remediation is actually present in the shipped
#    scripts, and the unsafe round-4 patterns are gone);
# 2. Plan A regression suite (main worktree + linked worktree, positive/negative,
#    rollback, missing staging, stale manifest, byte-identical revert);
# 3. Plan B regression suite (backup/restore, include-negative, partial failure,
#    repeated execution, stale manifests, alternate sources, byte-identical);
# 4. canonical verifier suite counts: Plan A 55 checks, Plan B 30 checks.
#
# Usage: ./tests/test-plans-remediation.sh
# Exit 0 only when every static check and both suites pass.
set -uo pipefail
TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
KIT=$(cd "$TEST_DIR/.." && pwd -P)
. "$KIT/parakeet-pins.env"
. "$KIT/plans-lib.sh"

ROOT=${PLANS_TEST_ROOT:-$T5/cache/round7/plans/test-run}
RUNLOG="$ROOT/remediation-run-$(date -u +%Y%m%dT%H%M%SZ).log"
mkdir -p "$ROOT"
: > "$RUNLOG"

PASS=0
FAIL=0
chk() { # name condition-result(0 ok)
  if [ "$2" = 0 ]; then PASS=$((PASS + 1)); echo "STATIC PASS  $1"; else FAIL=$((FAIL + 1)); echo "STATIC FAIL  $1"; fi
}
has() { grep -q -E "$2" "$1"; }

echo "== Static remediation checks ==" | tee -a "$RUNLOG"

if has "$KIT/apply-plan-a.sh" 'git_repo_root' &&
   ! grep -v '^[[:space:]]*#' "$KIT/apply-plan-a.sh" | grep -q '\[ -d "\$REPO/\.git" \]'; then
  chk "A1 linked-worktree-safe repo root resolution in apply-plan-a.sh" 0
else
  chk "A1 linked-worktree-safe repo root resolution in apply-plan-a.sh" 1
fi

has "$KIT/apply-plan-a.sh" 'rollback_applied_patch'
chk "A2 transactional rollback present in apply-plan-a.sh" $?

has "$KIT/apply-plan-a.sh" 'pre-gate'
chk "A2 archive failure pre-gate present in apply-plan-a.sh" $?

has "$KIT/verify-plan-a.sh" 'allow-missing-staging'
chk "A3 --allow-missing-staging implemented in verify-plan-a.sh" $?

has "$KIT/refresh-evidence-manifest.sh" 'self-hash is impossible'
chk "A4 stale evidence manifest regenerator/verifier present" $?

has "$KIT/apply-plan-b.sh" 'BACKUP_TARGETS_TSV'
chk "B1 targets.tsv multi-target backup layout present" $?

has "$KIT/restore-staged-backup.sh" 'include-negative'
chk "B1 restore --include-negative implemented" $?

has "$KIT/apply-plan-b.sh" 'pre-staged'
chk "B2 pre-stage + hash verification implemented" $?

has "$KIT/apply-plan-b.sh" 'rollback_installed'
chk "B2 transactional install rollback implemented" $?

has "$KIT/restore-staged-backup.sh" 'extracted-new'
chk "B3 alternate recovery source (extracted-new/archive) implemented" $?

if grep -q -E '(^|[^a-z])(curl|wget)[[:space:]]' "$KIT"/*.sh 2>/dev/null ||
   grep -q -E 'git[[:space:]]+(commit|push|merge|reset)[[:space:]]' "$KIT"/*.sh 2>/dev/null; then
  chk "no network calls or git write commands in remediation scripts" 1
else
  chk "no network calls or git write commands in remediation scripts" 0
fi

SYNTAX_FAIL=0
for s in "$KIT"/*.sh "$KIT"/parakeet-pins.env "$KIT"/tests/*.sh; do bash -n "$s" || SYNTAX_FAIL=$((SYNTAX_FAIL + 1)); done
chk "every remediation script parses (bash -n)" "$SYNTAX_FAIL"
echo | tee -a "$RUNLOG"

echo "== Plan A regression suite ==" | tee -a "$RUNLOG"
"$TEST_DIR/test-plan-a-suite.sh" > "$ROOT/plan-a-suite.out" 2>&1
A_RC=$?
grep -E '^(T-PASS|T-FAIL|SUITE RESULT)' "$ROOT/plan-a-suite.out" | tee -a "$RUNLOG"
A_SUM=$(grep '^SUITE RESULT' "$ROOT/plan-a-suite.out" | tail -1)
echo | tee -a "$RUNLOG"

echo "== Plan B regression suite (long: real 639 MiB model bytes, APFS clones) ==" | tee -a "$RUNLOG"
"$TEST_DIR/test-plan-b-suite.sh" > "$ROOT/plan-b-suite.out" 2>&1
B_RC=$?
grep -E '^(T-PASS|T-FAIL|SUITE RESULT)' "$ROOT/plan-b-suite.out" | tee -a "$RUNLOG"
B_SUM=$(grep '^SUITE RESULT' "$ROOT/plan-b-suite.out" | tail -1)
echo | tee -a "$RUNLOG"

# ---- canonical verifier suite counts ---------------------------------------
A_COUNTS="missing"; B_COUNTS="missing"
if [ -f "$ROOT/plan-a/logs/verify-main.log" ]; then A_COUNTS=$(awk '/checks passed:/ {print $3" passed / "$5" failed"}' "$ROOT/plan-a/logs/verify-main.log"); fi
if [ -f "$ROOT/plan-b/logs/verify.log" ]; then B_COUNTS=$(awk '/checks passed:/ {print $3" passed / "$5" failed"}' "$ROOT/plan-b/logs/verify.log"); fi

echo "== Canonical suites ==" | tee -a "$RUNLOG"
echo "Plan A verifier (55-check suite): $A_COUNTS" | tee -a "$RUNLOG"
echo "Plan B verifier (30-check suite): $B_COUNTS" | tee -a "$RUNLOG"

A_OK=0; B_OK=0
[ "$A_COUNTS" = "55 passed / 0 failed" ] && A_OK=1
[ "$B_COUNTS" = "30 passed / 0 failed" ] && B_OK=1
chk "canonical Plan A 55-check suite is 55/0" "$((1 - A_OK))"
chk "canonical Plan B 30-check suite is 30/0" "$((1 - B_OK))"
echo

if [ "$A_RC" = 0 ]; then chk "Plan A regression suite passed" 0; else chk "Plan A regression suite passed" 1; fi
if [ "$B_RC" = 0 ]; then chk "Plan B regression suite passed" 0; else chk "Plan B regression suite passed" 1; fi

echo "----------------------------------------" | tee -a "$RUNLOG"
echo "TOTAL: static+suite checks passed=$PASS failed=$FAIL" | tee -a "$RUNLOG"
echo "Plan A suite: $A_SUM" | tee -a "$RUNLOG"
echo "Plan B suite: $B_SUM" | tee -a "$RUNLOG"
echo "full output: $ROOT/plan-a-suite.out $ROOT/plan-b-suite.out" | tee -a "$RUNLOG"
[ "$FAIL" = 0 ]
