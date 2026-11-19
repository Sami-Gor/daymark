# Round 7 agent B -- Plan A/B rollback script remediation report

Status: **COMPLETE in disposable T5 scratch -- NO PRODUCTION CHANGE.**
Authority: T5 `/Volumes/DaymarkWorkspace/Daymark`.
Deliverable: `worktrees/r7-plans/tools/plan-remediation/` on branch `r7/plans`.
Evidence: this directory (`archive/reports/ROUND7-AGENT-EVIDENCE/agentB/`).

## 1. Scope and guardrails

* Corrected the Round 5/6 review defects A1-A4 (Plan A) and B1-B3 (Plan B) in
  copies of the round-4 plan kit; originals in
  `archive/reports/round4-b-plans` were copied to scratch and never modified.
* Added regression suites covering main-worktree and linked-worktree scenarios,
  positive/negative modes, partial failure, repeated execution, stale manifests
  and byte-identical before/after hashes.
* Re-ran the canonical Plan A and Plan B verifier suites and recorded exact
  counts (section 4).
* **No production model/pin/AAR/archive changes. No pushes, no merges, no
  production staged-asset writes.** The real staged assets, both archives and
  the quarantine extracts were only hashed read-only; the suites assert their
  SHA-256 sets are unchanged before/after (see `logs/plan-*/\*.log` and
  `hashes/production-staging.sha256`).
* Local commits only on `r7/plans` (SHA in section 7).

## 2. Defect remediation

### Plan A

* **A1 -- linked-worktree detection / repo root.** `[ -d "$REPO/.git" ]`
  rejects linked worktrees (their `.git` is a file) and `git apply` is
  cwd-relative. Replaced with `plans-lib.sh:git_repo_root()` using
  `git -C <dir> rev-parse --show-toplevel`; `apply-plan-a.sh` resolves and
  operates at that root, and `verify-plan-a.sh`/`check-state.sh` use
  `repo_dir()` (git root when available, plain directory for scratch
  replicas). Proven: apply+revert 55/0 in an ordinary `.git` directory and in a
  real `git worktree add` linked worktree.
* **A2 -- transactional rollback + archive pre-gate.** `apply-plan-a.sh` now
  (a) runs `check_archives` and refuses before any write when it fails, and
  (b) installs an EXIT trap that reverses the patch on any failure after
  `git apply`, then proves the six files are byte-identical to pre-apply
  SHA-256 values. Proven by a fault-injected verifier (exit 1) and by a
  fault-injected archive path: both leave the tree clean and hash-identical.
* **A3 -- `--allow-missing-staging`.** `verify-plan-a.sh` accepts the flag,
  skips the 13 staged-byte checks with a warning (42 checks), and
  `apply-plan-a.sh` threads it through. Proven by applying in a fresh checkout
  with no staging and reverting byte-identically.
* **A4 -- stale evidence manifest.** `refresh-evidence-manifest.sh` regenerates
  a manifest from actual bytes, requires complete coverage, refuses self-entries
  and `--check` detects any deviation. A corrected round-4 evidence bundle
  manifest is included (`round4-evidence-reconciliation/`) with a computed
  stale-entry analysis; the original manifest was not edited.

### Plan B

* **B1 -- `--include-negative` reversibility.** v2 backup layout:
  `BACKUP_DIR/targets.tsv` (`id, path, pre-class`) plus
  `targets/<id>/backup-manifest.tsv` and per-target file copies. The flat
  namespace collision is gone. `restore-staged-backup.sh --include-negative`
  restores every recorded target; a two-target backup refuses a flagless
  restore. Every byte is checked against canonical NEW size/SHA-256. Proven
  with a main + negative run: 31/0 verifier and byte-identical restore of both
  targets.
* **B2 -- per-file atomicity / pre-stage.** Per-file planning
  (replace/install/skip; unknown bytes refused), backup of every byte to be
  replaced (verified against canonical NEW values) before touching a destination,
  all OLD files pre-staged and hash-verified next to their destinations, then a
  rename commit; commit/post-verify failure rolls every target back from the
  manifest and discards the just-created backup when the rollback is
  byte-identical. Absent targets are installed and can be undone exactly
  (files removed). `--idempotent --apply` verifies only, writes nothing, creates
  no backup. Proven with a PATH `mv` shim failing the 2nd rename: target bytes
  unchanged, no temp files, no dangling backup; a recovery apply then passes
  30/0.
* **B3 -- alternate recovery sources.** `restore-staged-backup.sh
  --source backup|extracted-new|archive`: exact pre-state undo from the
  provenance-pinned backup (including removing files that did not exist before
  Plan B), or forced-NEW recovery from the verified `extracted-new` tree /
  quarantined NEW archive. All source bytes are hash/size-verified. Proven for
  all three sources.

## 3. Regression suites added

`tools/plan-remediation/tests/`:

* `test-plan-a-suite.sh` -- main and linked worktree apply/verify/revert,
  dry-run side-effect freedom, repeated apply refusal, byte-identical revert
  both ways, A2 rollback fault injection, A2 archive pre-gate, A3 missing
  staging (42/0), A4 stale-manifest scenarios, production fixture re-hash.
* `test-plan-b-suite.sh` -- canonical apply + restore cycle, byte-identical
  before/after cycles, stale/tampered manifest + backup-bytes + targets.tsv
  refusal, repeated apply and idempotent no-write mode, B3 alternate sources,
  B1 two-target include-negative cycle, absent-target install/undo, B2 injected
  rename failure + recovery, linked-worktree repo acceptance, production
  fixture/staging re-hash.
* `test-plans-remediation.sh` -- static defect checks + both suites + canonical
  55/30 count verification.

## 4. Exact test results

Final master run: `logs/master-run.out` (full output) and
`test-run/remediation-run-<UTC>.log` (static-check transcript).

| Suite | Checks | Result |
|---|---|---|
| **Plan A canonical verifier** (`verify-plan-a.sh`, staging NEW, archives) | **55** | **55 passed / 0 failed** |
| Plan A missing-staging mode (`--allow-missing-staging`) | 42 | 42 passed / 0 failed |
| **Plan B canonical verifier** (`verify-plan-b.sh`, main OLD staging + v2 backup + archives) | **30** | **30 passed / 0 failed** |
| Plan B include-negative verifier | 31 | 31 passed / 0 failed |
| Plan A regression suite (`tests/test-plan-a-suite.sh`) | suite assertions | **55 passed / 0 failed** |
| Plan B regression suite (`tests/test-plan-b-suite.sh`) | suite assertions | **82 passed / 0 failed** |
| Master runner (`tests/test-plans-remediation.sh`) static + suite orchestration | 16 | **16 passed / 0 failed** (exit 0) |

The authoritative final master run is `logs/master-run.out`:
`TOTAL: static+suite checks passed=16 failed=0`,
`Plan A suite: pass=55 fail=0`, `Plan B suite: pass=82 fail=0`,
`Plan A verifier (55-check suite): 55 passed / 0 failed`,
`Plan B verifier (30-check suite): 30 passed / 0 failed`.
Measured wall time for the full master run: ~12 minutes (Plan A ~3 min, Plan B ~9 min) on the T5 APFS volume.

Exact count lines are preserved verbatim in
`logs/plan-a/plan-a-55-check.log` and `logs/plan-b/plan-b-30-check.log`.

## 5. Evidence of no production change

* `hashes/production-staging.sha256` -- production main + negative staging
  hashes at collection time (NEW bytes, still the known hazard; unchanged).
* `hashes/real-staging-pre.sha` == `hashes/real-staging-post.sha` and
  `hashes/real-negative-pre.sha` == `hashes/real-negative-post.sha` (asserted
  byte-identical by the final Plan B suite).
* `hashes/archives.sha256` -- both preserved archives still match the pins env.
* The suites hash the real staging, quarantine extracts and archives before and
  after; any difference would fail the suite.
* Production repo HEAD recorded in `production-repo-head.txt` (unchanged
  `45d1274...`); `r7/plans` worktree contains only the new
  `tools/plan-remediation/` directory.


## 5a. Disclosure -- transient test write to the default negative staging

An intermediate (pre-final) Plan B test iteration wrote OLD bytes into the
default negative-worktree staging because the include-negative test had not yet
passed `--negative-staging`; the same suite's restore step restored the exact
NEW bytes ~2 minutes later. **Net production state is unchanged** (canonical
NEW hashes re-verified; the suite's final "production negative-worktree staged
assets unchanged" assertion passed), the main staging/AAR/pins/archives were
never touched, and the delivered kit fixes the root cause by adding
`--negative-staging` and using scratch clones in every test. Full disclosure,
timeline and hash evidence: `TRANSIENT-NEGATIVE-STAGING-DISCLOSURE.md` and
`logs/incident-plan-b-suite-pre-fix.run.log`.

## 6. Runtime and reproduction

    cd /Volumes/DaymarkWorkspace/Daymark/worktrees/r7-plans/tools/plan-remediation
    ./tests/test-plans-remediation.sh      # ~12 min measured, all writes under T5 cache

Fixtures are cloned with APFS copy-on-write from
`quarantine/parakeet-20261118/extracted-{old,new}`; no 639 MiB file is
duplicated and production bytes are read-only. Plan B's full-size hashing makes
the suites deliberately slow; this is the same 4-file SHA-256 surface the
production scripts will hash.

## 7. Local commits (branch `r7/plans`)

Commit **`a076df3`** ("tools(plan-remediation): fix Plan A/B rollback
scripts (A1-A4, B1-B3) with regression suites") on branch `r7/plans`, parent
`9002641`. The deliverable commit contains only `tools/plan-remediation/`
(18 files: corrected scripts, byte-identical patches/TSV, tests, README,
portable SHA256SUMS). `git status` is clean. Nothing was pushed or merged.
`git-head.txt`, `git-log.txt`, `patches/plan-remediation.patch` and
`patches/commit-metadata.txt` record the exact contents.

## 8. Recommendation

See `PLAN-A-VS-PLAN-B.md`. Short version: **Plan B is the safe option for the
current window** (returns to a consistent, unchanged-behaviour OLD state;
byte-proven reversible; no model-difference acceptance needed). Plan A is now
technically safe to execute (transactional, linked-worktree-capable) but remains
a model change that needs the owner parity/performance/device gates before it
can be called safe.

## 9. Limitations

* Scripts still depend on the T5 evidence paths (archives/quarantine extracts).
* Legacy round-4 flat backups restore one target only; `--include-negative`
  refuses them.
* Owner gates (round 4 G1-G8, round 3 A2/A5 device gates) remain open; this
  report proves script safety, not model parity.
* Runtime of the Plan B suite is dominated by hashing the real 639 MiB model
  files; it is not suitable for high-frequency CI without a smaller fixture.
