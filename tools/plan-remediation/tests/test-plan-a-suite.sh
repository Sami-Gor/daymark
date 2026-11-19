#!/usr/bin/env bash
# Plan A remediation regression suite (Round 7, agent B).
#
# Covers defect fixes A1 (linked worktree + repo root), A2 (transactional
# rollback + archive pre-gate), A3 (--allow-missing-staging), A4 (stale evidence
# manifest tooling), plus the canonical 55-check Plan A verifier suite and
# byte-identical apply/revert evidence. All writes happen under the disposable
# T5 cache scratch; the real repo/staging/quarantine files are only read.
TEST_SUITE=plan-a
export TEST_SUITE
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/test-lib.sh"

suite_setup
require_fixtures

KIT="$KIT"
LOG="$LOGS"
PASS=0
FAIL=0

t_info "kit: $KIT"
t_info "scratch: $SCRATCH"

# ---- fixture read-only snapshot (proves no production bytes were changed) ---
hash_set "$NEW_EXTRACTED" "$SCRATCH/fixtures-new-pre.sha"
hash_set "$OLD_EXTRACTED" "$SCRATCH/fixtures-old-pre.sha"
shasum -a 256 "$OLD_ARCHIVE" "$NEW_ARCHIVE" > "$SCRATCH/archives-pre.sha"

# ---- 1. static / syntax -----------------------------------------------------
SYNTAX_FAIL=0
for s in "$KIT"/*.sh "$KIT"/parakeet-pins.env "$KIT"/tests/*.sh; do
  bash -n "$s" || SYNTAX_FAIL=$((SYNTAX_FAIL + 1))
done
assert_eq "all plan/remediation scripts + pins env parse (bash -n)" 0 "$SYNTAX_FAIL"

if grep -v '^[[:space:]]*#' "$KIT/apply-plan-a.sh" | grep -q '\[ -d "\$REPO/\.git" \]'; then
  t_fail "A1: apply-plan-a.sh still uses the [ -d \$REPO/.git ] worktree-unsafe check"
else
  t_pass "A1: apply-plan-a.sh no longer assumes .git is a directory"
fi
if grep -q 'rev-parse --show-toplevel' "$KIT/plans-lib.sh"; then
  t_pass "A1: repo root is resolved with git rev-parse --show-toplevel"
else
  t_fail "A1: git rev-parse root resolution missing from plans-lib.sh"
fi
if grep -q 'pre-gate' "$KIT/apply-plan-a.sh"; then
  t_pass "A2: apply-plan-a.sh has an archive pre-gate before writing"
else
  t_fail "A2: archive pre-gate missing"
fi

# ---- 2. scratch repositories (main + linked worktree) -----------------------
make_pin_repo "$SCRATCH/repo-main"
git -C "$SCRATCH/repo-main" worktree add -q --detach "$SCRATCH/wt-linked" 2>>"$LOG/setup.log" \
  || t_fail "could not create linked worktree fixture"
if [ -f "$SCRATCH/wt-linked/.git" ]; then
  t_pass "A1 fixture: linked worktree has a .git file (not a directory)"
else
  t_fail "A1 fixture: linked worktree .git file missing"
fi
hash_pin_files "$SCRATCH/repo-main" "$SCRATCH/baseline.sha"
assert_pins_old "baseline scratch repo pins are OLD" "$SCRATCH/repo-main"

# ---- 3. main-worktree apply / verify / revert -------------------------------
run_expect_ok "main-worktree: Plan A apply + auto-verify" "$LOG/apply-main.log" \
  "$KIT/apply-plan-a.sh" --repo "$SCRATCH/repo-main" --staging "$NEW_EXTRACTED" --allow-head --apply
assert_grep "main-worktree: root resolution logged" "repository root" "$LOG/apply-main.log"
assert_grep "main-worktree: apply log shows 55/0 verification" "checks passed: 55" "$LOG/apply-main.log"

run_expect_ok "main-worktree: explicit verify-plan-a run" "$LOG/verify-main.log" \
  "$KIT/verify-plan-a.sh" --repo "$SCRATCH/repo-main" --staging "$NEW_EXTRACTED"
assert_counts "canonical Plan A suite (staging NEW) = 55 checks" "$LOG/verify-main.log" 55 0

cat > "$SCRATCH/expected-post.sha" <<'EXPECTED'
0cc63e1ef6c341404d8cfb890b4f970c46d0ce8edbeea3d2b9f77a451b3b758a  android/kokoro-poc/scripts/fetch-parakeet-assets.sh
25c1a5fe721f15ba5609d9281b69305998a585276d66d8b0dfdc544386c9f0b2  artifacts/weather-app/android/parakeet-assets/build.gradle
9c7dd88bfcf4dbb2978140bdddab48b4d85020dbb637ae172eb80e1b01188acb  artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/ParakeetModelAssets.java
6ddd6c373c7808458c94866e410563e67048995f1dcef34f7d04e02838e79019  artifacts/weather-app/android/daymark-voice/src/test/java/io/github/sami_gor/daymark/voice/ParakeetModelAssetsTest.java
1651f7110eee83c331de659c37b56082ff6ab99c5fd6661f6cb2f2387b907c2b  THIRD-PARTY-NOTICES.md
a89ed582d279ec65e5b2ba7fe3e242ac38987e383f802557b4a2aef4d9bd31a5  docs/release/reproducible-build-guide.md
EXPECTED
hash_pin_files "$SCRATCH/repo-main" "$SCRATCH/post.sha"
assert_same_bytes "post-Plan-A pin-file hashes match the reviewed expected set" "$SCRATCH/expected-post.sha" "$SCRATCH/post.sha"

run_expect_ok "check-state classifies patched main worktree as plan-a" "$LOG/check-a-new.log" \
  "$KIT/check-state.sh" --repo "$SCRATCH/repo-main" --staging "$NEW_EXTRACTED" --expect new

run_expect_fail "repeated apply is refused (pins already NEW)" "$LOG/apply-twice.log" \
  "$KIT/apply-plan-a.sh" --repo "$SCRATCH/repo-main" --staging "$NEW_EXTRACTED" --allow-head --apply

run_expect_ok "plan-a-revert.patch applies to the patched tree" "$LOG/revert-patch.log" \
  git -C "$SCRATCH/repo-main" apply "$KIT/plan-a-revert.patch"
assert_eq "revert patch leaves a clean working tree" "" "$(git -C "$SCRATCH/repo-main" status --porcelain)"
hash_pin_files "$SCRATCH/repo-main" "$SCRATCH/reverted.sha"
assert_same_bytes "revert patch restores the six pin files byte-identically" "$SCRATCH/baseline.sha" "$SCRATCH/reverted.sha"

run_expect_ok "repeat: apply again (repeated execution)" "$LOG/apply-again.log" \
  "$KIT/apply-plan-a.sh" --repo "$SCRATCH/repo-main" --staging "$NEW_EXTRACTED" --allow-head --apply
run_expect_ok "repeat: reverse with git apply -R" "$LOG/apply-reverse.log" \
  git -C "$SCRATCH/repo-main" apply -R "$KIT/plan-a-adoption.patch"
hash_pin_files "$SCRATCH/repo-main" "$SCRATCH/reverted2.sha"
assert_same_bytes "git apply -R restores the six pin files byte-identically" "$SCRATCH/baseline.sha" "$SCRATCH/reverted2.sha"


# ---- 4. linked-worktree apply / verify / revert -----------------------------
run_expect_ok "linked-worktree: Plan A apply + auto-verify (A1 fix)" "$LOG/apply-linked.log" \
  "$KIT/apply-plan-a.sh" --repo "$SCRATCH/wt-linked" --staging "$NEW_EXTRACTED" --allow-head --apply
assert_grep "linked-worktree: git root resolution logged" "repository root" "$LOG/apply-linked.log"
run_expect_ok "linked-worktree: verify-plan-a" "$LOG/verify-linked.log" \
  "$KIT/verify-plan-a.sh" --repo "$SCRATCH/wt-linked" --staging "$NEW_EXTRACTED"
assert_counts "linked-worktree Plan A verifier = 55 checks" "$LOG/verify-linked.log" 55 0
run_expect_ok "linked-worktree: revert patch" "$LOG/revert-linked.log" \
  git -C "$SCRATCH/wt-linked" apply "$KIT/plan-a-revert.patch"
hash_pin_files "$SCRATCH/wt-linked" "$SCRATCH/linked-reverted.sha"
assert_same_bytes "linked-worktree revert is byte-identical" "$SCRATCH/baseline.sha" "$SCRATCH/linked-reverted.sha"

run_expect_fail "linked-worktree: refuses OLD staging (Plan A needs NEW bytes)" "$LOG/apply-linked-old.log" \
  "$KIT/apply-plan-a.sh" --repo "$SCRATCH/wt-linked" --staging "$OLD_EXTRACTED" --allow-head

# ---- 5. dry-run is side-effect free ----------------------------------------
hash_pin_files "$SCRATCH/wt-linked" "$SCRATCH/dry-before.sha"
run_expect_ok "dry-run on linked worktree" "$LOG/dry-linked.log" \
  "$KIT/apply-plan-a.sh" --repo "$SCRATCH/wt-linked" --staging "$NEW_EXTRACTED" --allow-head
hash_pin_files "$SCRATCH/wt-linked" "$SCRATCH/dry-after.sha"
assert_same_bytes "dry-run leaves pin files byte-identical" "$SCRATCH/dry-before.sha" "$SCRATCH/dry-after.sha"

# ---- 6. A3: --allow-missing-staging fresh-checkout workflow ----------------
run_expect_ok "A3: apply with --allow-missing-staging succeeds" "$LOG/apply-missing.log" \
  "$KIT/apply-plan-a.sh" --repo "$SCRATCH/wt-linked" --staging "$SCRATCH/absent-staging" --allow-head --allow-missing-staging --apply
assert_grep "A3: verifier reports the 42-check missing-staging mode" "checks passed: 42" "$LOG/apply-missing.log"
run_expect_fail "A3: missing staging is still refused without the flag" "$LOG/apply-missing-refused.log" \
  "$KIT/apply-plan-a.sh" --repo "$SCRATCH/wt-linked" --staging "$SCRATCH/absent-staging" --allow-head --apply
run_expect_ok "A3: revert after missing-staging apply" "$LOG/revert-missing.log" \
  git -C "$SCRATCH/wt-linked" apply -R "$KIT/plan-a-adoption.patch"
hash_pin_files "$SCRATCH/wt-linked" "$SCRATCH/missing-reverted.sha"
assert_same_bytes "A3: revert after missing-staging apply is byte-identical" "$SCRATCH/baseline.sha" "$SCRATCH/missing-reverted.sha"

# ---- 7. A2: transactional rollback when post-verify fails ------------------
make_fake_kit "$SCRATCH/fake-kit-verify"
cat > "$SCRATCH/fake-kit-verify/verify-plan-a.sh" <<'FAKE'
#!/usr/bin/env bash
echo "FAIL  forced verifier failure (fault injection)" >&2
exit 1
FAKE
chmod +x "$SCRATCH/fake-kit-verify/verify-plan-a.sh"
run_expect_fail "A2: failed post-verify is detected" "$LOG/rollback.log" \
  "$SCRATCH/fake-kit-verify/apply-plan-a.sh" --repo "$SCRATCH/wt-linked" --staging "$NEW_EXTRACTED" --allow-head --apply
assert_grep "A2: rollback message present" "reversing the Plan A patch" "$LOG/rollback.log"
assert_eq "A2: failed post-verify leaves no tracked changes" "" "$(git -C "$SCRATCH/wt-linked" status --porcelain)"
hash_pin_files "$SCRATCH/wt-linked" "$SCRATCH/rollback.sha"
assert_same_bytes "A2: failed post-verify restores byte-identical pin files" "$SCRATCH/baseline.sha" "$SCRATCH/rollback.sha"
assert_eq "A2: no temp pre-hash files leaked into scratch repo" "" "$(git -C "$SCRATCH/wt-linked" status --porcelain)"

# ---- 8. A2: archive failure pre-gate (no write before gate) ----------------
make_fake_kit "$SCRATCH/fake-kit-gate"
sed -i '' "s|^OLD_ARCHIVE=.*|OLD_ARCHIVE=\"$SCRATCH/absent-old.tar.bz2\"|" "$SCRATCH/fake-kit-gate/parakeet-pins.env"
run_expect_fail "A2: bad old archive aborts the apply" "$LOG/gate.log" \
  "$SCRATCH/fake-kit-gate/apply-plan-a.sh" --repo "$SCRATCH/wt-linked" --staging "$NEW_EXTRACTED" --allow-head --apply
assert_grep "A2: archive pre-gate error names the pre-gate" "pre-gate" "$LOG/gate.log"
assert_eq "A2: archive pre-gate aborts before touching the tree" "" "$(git -C "$SCRATCH/wt-linked" status --porcelain)"
hash_pin_files "$SCRATCH/wt-linked" "$SCRATCH/gate.sha"
assert_same_bytes "A2: archive pre-gate leaves byte-identical pin files" "$SCRATCH/baseline.sha" "$SCRATCH/gate.sha"

# ---- 9. A4: stale evidence manifest tooling --------------------------------
MB="$SCRATCH/manifest-bundle"
mkdir -p "$MB"
printf 'alpha\n' > "$MB/a.txt"
printf 'beta\n' > "$MB/b.txt"
run_expect_ok "A4: refresh-evidence-manifest --write" "$LOG/manifest-write.log" \
  "$KIT/refresh-evidence-manifest.sh" "$MB"
run_expect_ok "A4: fresh manifest verifies with --check" "$LOG/manifest-check.log" \
  "$KIT/refresh-evidence-manifest.sh" --check "$MB"
printf 'alpha-changed\n' > "$MB/a.txt"
run_expect_fail "A4: stale manifest detected after a byte changes" "$LOG/manifest-stale.log" \
  "$KIT/refresh-evidence-manifest.sh" --check "$MB"
run_expect_ok "A4: manifest regenerated after change" "$LOG/manifest-rewrite.log" \
  "$KIT/refresh-evidence-manifest.sh" "$MB"
printf 'gamma\n' > "$MB/c.txt"
run_expect_fail "A4: manifest missing an added file is detected" "$LOG/manifest-added.log" \
  "$KIT/refresh-evidence-manifest.sh" --check "$MB"
run_expect_ok "A4: manifest regenerated after file addition" "$LOG/manifest-rewrite2.log" \
  "$KIT/refresh-evidence-manifest.sh" "$MB"
printf '0000000000000000000000000000000000000000000000000000000000000000  ./SHA256SUMS\n' >> "$MB/SHA256SUMS"
run_expect_fail "A4: self-listing manifest is detected as stale" "$LOG/manifest-self.log" \
  "$KIT/refresh-evidence-manifest.sh" --check "$MB"
run_expect_ok "A4: manifest regenerated cleanly after self-entry" "$LOG/manifest-rewrite3.log" \
  "$KIT/refresh-evidence-manifest.sh" "$MB"
run_expect_ok "A4: final manifest is current" "$LOG/manifest-final.log" \
  "$KIT/refresh-evidence-manifest.sh" --check "$MB"

# ---- 10. fixture integrity --------------------------------------------------
hash_set "$NEW_EXTRACTED" "$SCRATCH/fixtures-new-post.sha"
hash_set "$OLD_EXTRACTED" "$SCRATCH/fixtures-old-post.sha"
assert_same_bytes "production NEW extracted bytes unchanged by suite" "$SCRATCH/fixtures-new-pre.sha" "$SCRATCH/fixtures-new-post.sha"
assert_same_bytes "production OLD extracted bytes unchanged by suite" "$SCRATCH/fixtures-old-pre.sha" "$SCRATCH/fixtures-old-post.sha"
shasum -a 256 "$OLD_ARCHIVE" "$NEW_ARCHIVE" > "$SCRATCH/archives-post.sha"
assert_same_bytes "preserved OLD/NEW archives unchanged by suite" "$SCRATCH/archives-pre.sha" "$SCRATCH/archives-post.sha"

suite_finish
