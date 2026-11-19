# Round 4 Plans A and B -- Parakeet pin adoption / old-asset restoration

Status: PREPARED, VALIDATED IN SCRATCH, NOT APPLIED. No model file, pin,
archive, worktree or repository was changed. Authority: T5
/Volumes/DaymarkWorkspace/Daymark; planning baseline repositories/daymark HEAD
45d12748679fa67723e6a5b2d997eb7711f05c43 (clean).

Current state: known hazard -- all tracked pins OLD (MODEL_VERSION sha256-1),
staged model assets NEW in both staging locations (3/4 digests mismatch pins).
Two exclusive resolutions are prepared; never mix them.

- Plan A (coordinated replacement adoption): applies every pin change
  (12 of 20 pin references, 24 literal replacements in 6 files, 7 coordinated
  sites) plus MODEL_VERSION -> sha256-2, adopting the NEW staged bytes.
  Owner-gated (on-device parity evidence, single reviewed commit, fetch/build/
  CI/AAB/device gates).
- Plan B (restore OLD staged assets): back up NEW staged bytes, restore the
  verified OLD bytes from the preserved archive, keep OLD pins -> consistent
  buildable OLD state; reversible with restore-staged-backup.sh.

## Files

| File | Purpose |
|---|---|
| parakeet-pins.env | Canonical OLD/NEW digests, sizes, versions, paths |
| plans-lib.sh | Read-only helpers (hashing, literal counts, classification) |
| check-state.sh | Classify tree: plan-a / plan-b / hazard-* / inconsistent |
| plan-a-adoption.patch | Unified diff: 6 files, 24 literal replacements + version bump |
| plan-a-revert.patch | Byte-exact inverse of the adoption patch |
| plan-a-replacements.tsv | All replacement rows (site, file, old, new, count) |
| apply-plan-a.sh | Plan A preflight + apply (dry-run default, --apply writes) |
| verify-plan-a.sh | Assert consistent NEW state |
| apply-plan-b.sh | Plan B preflight + backup + atomic OLD restore (dry-run default) |
| verify-plan-b.sh | Assert consistent OLD state + NEW-byte backup integrity |
| restore-staged-backup.sh | Reverse Plan B (restore backed-up NEW bytes) |
| test-plans.sh | Offline validation harness (scratch only) |
| _validation/ | Disposable test scratch; _build/ = patch-generation scratch |

## Usage (owner-gated)

    cd archive/reports/round4-b-plans
    ./check-state.sh --expect any --include-negative --with-archives
    ./apply-plan-a.sh                  # dry-run
    ./apply-plan-a.sh --apply          # apply + auto-verify
    ./apply-plan-b.sh                  # dry-run
    ./apply-plan-b.sh --apply          # back up NEW, restore OLD, verify
    ./restore-staged-backup.sh --backup-dir DIR --apply   # reverse Plan B
    ./test-plans.sh --keep             # offline validation, scratch only

Exit codes: 0 success/match, 1 failure/mismatch/refusal, 2 usage.

## Sites

S1 fetch script archive pin (P1); S2 fetch script member pins (P2-P5);
S3 parakeet-assets/build.gradle modelSha256 (P6); S4 ParakeetModelAssets.java
sizes/digests/MODEL_VERSION (P7-P9); S5 ParakeetModelAssetsTest.java sizes
(P10); S6 THIRD-PARTY-NOTICES.md (P11-P12); S7
docs/release/reproducible-build-guide.md (P13). Tokens digest is unchanged.

## Gates

1. Owner decision recorded (adopt or defer/restore) + owner acceptance of
   documented model differences and round3 A2/A5 on-device gates.
2. Plan A: one coordinated reviewed commit; git log -S shows new hashes once;
   fetch twice, verifyParakeetAssets, JVM tests, bundleRelease/AAB member
   digests, model-dependent CI and device matrix green.
3. Preserve old archive (unchanged), new archive in quarantine, and the NEW
   staged-byte backup as rollback evidence.
4. Do not ship an intermediate state; do not run fetch while pins are OLD.

Full report: archive/reports/round4-b-integrity-rollback-20261118.md
