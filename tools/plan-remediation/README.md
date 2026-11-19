# Plan A / Plan B remediation kit (Round 7, agent B)

Status: **REMEDIATED + REGRESSION-TESTED in disposable T5 scratch. NOT APPLIED.**
No production model byte, pin, AAR, archive, worktree or repository file was
changed. Authority: T5 `/Volumes/DaymarkWorkspace/Daymark`.

This directory is the reviewable deliverable for the Round 7 Plan A/B rollback
script remediation. It started from `archive/reports/round4-b-plans` (2.5 GiB,
originals untouched) and fixes the defects confirmed by the Round 5/6 reviews
(`round5-b4-b6-plan-tests-20261118.md`, `round5-b1-b3-plans-review-20261118.md`,
`ROUND6-AGENT-EVIDENCE/agent4-plans.md`):

| Defect | Severity | Fix in this kit |
|---|---|---|
| **A1** `apply-plan-a.sh` rejects linked worktrees (`[ -d "$REPO/.git" ]`; in a linked worktree `.git` is a file) and `git apply` is cwd-relative | medium | `plans-lib.sh:git_repo_root()` resolves `git -C <dir> rev-parse --show-toplevel`; every apply runs at the resolved repository root. Read-only verifiers keep working on plain non-git replicas via `repo_dir()`. |
| **A2** Failed post-verify leaves the six pin files half-adopted; archive failures are only noticed after the patch landed | medium | `apply-plan-a.sh` now has a pre-apply archive gate (`check_archives` + `FAIL_COUNT=0` before any write) and an EXIT-trap transactional rollback: any failure after `git apply` reverses the patch, proves the working tree clean, and compares all six files to their pre-apply SHA-256 values. |
| **A3** `--allow-missing-staging` can never pass the verifier (fresh checkout: apply pins, then fetch) | medium | `verify-plan-a.sh --allow-missing-staging` skips only the 13 staged-byte checks (42 checks instead of 55) and warns; `apply-plan-a.sh` threads the flag through. |
| **A4** Stale/inconsistent round-4 evidence manifest (`plans-lib.sh` hash stale, missing regeneration log, impossible self-entry) | low | `refresh-evidence-manifest.sh` regenerates/verifies SHA-256 manifests from the actual bytes, lists every file (omissions fail), never lists itself, and `--check` fails on any difference. Corrected manifest + analysis in the agent-B evidence bundle. |
| **B1** `--include-negative` is not reversible: both targets are flattened into one backup namespace, restore has no flag and no target record | medium/low | v2 backup layout: `BACKUP_DIR/targets.tsv` records every target path + pre-state, each target gets `targets/<id>/backup-manifest.tsv` + its own files. `restore-staged-backup.sh --include-negative` restores exactly the recorded targets; all bytes are verified against manifests and canonical NEW/OLD SHA-256 + size values. Legacy round-4 flat backups are still accepted (single target). |
| **B2** Per-file install is not transactional; partial/absent targets can be overwritten without a recoverable backup; idempotent `--apply` created a broken backup | medium | Per-file planning (`replace` / `install` / `skip`; unknown bytes refused), every existing byte backed up and verified BEFORE any destination is touched, ALL old files pre-staged next to their destinations and hash-verified, then renames committed; commit or post-verify failure rolls every target back from the manifest and deletes the just-created backup dir when the rollback is byte-identical. `missing` targets are installed and can be undone exactly (files removed again). `--idempotent --apply` verifies only, writes nothing, creates no backup. |
| **B3** Recovery depends on one backup directory | low | `restore-staged-backup.sh --source backup|extracted-new|archive`: exact pre-state undo from the backup (including removing files that were absent before Plan B), or forced-NEW recovery from the verified `extracted-new` tree / the quarantined NEW archive. Source bytes are re-verified against canonical NEW sizes/digests. |

Everything else (pin values, the adoption/revert patches, the 20-reference pin
surface, staged-byte facts, archive evidence) is copied byte-identically from
the round-4 kit; the patches are unchanged because the pin surface did not
change.

## Contents

| File | Purpose |
|---|---|
| `parakeet-pins.env` | Canonical OLD/NEW digests, sizes, versions, paths (values unchanged); `PLAN_ROOT` self-resolves; adds v2 backup-layout constants. |
| `plans-lib.sh` | Read-only helpers: hashing, literal counts, classification, repo/worktree root resolution, per-file classification, APFS-clone copies, v2/legacy backup manifest + provenance verification. |
| `check-state.sh` | Classify tree: `plan-a` / `plan-b` / `hazard-*` / `inconsistent`; `--repo` accepts a linked worktree/subdirectory. |
| `plan-a-adoption.patch` / `plan-a-revert.patch` / `plan-a-replacements.tsv` | Byte-identical round-4 artifacts (SHA-256 pinned in `SHA256SUMS`). |
| `apply-plan-a.sh` | Plan A preflight + archive gate + transactional apply (dry-run default). |
| `verify-plan-a.sh` | Assert consistent NEW state (canonical 55 checks; 42 with `--allow-missing-staging`). |
| `apply-plan-b.sh` | Plan B preflight + per-file v2 backup + pre-staged atomic restore + rollback (dry-run default). |
| `verify-plan-b.sh` | Assert consistent OLD state + v2/legacy backup integrity (canonical 30 checks; 31 with `--include-negative`). |
| `restore-staged-backup.sh` | Reverse Plan B: multi-target, `--include-negative`, `--source backup|extracted-new|archive`, hash-verified pre-stage/commit. |
| `refresh-evidence-manifest.sh` | Regenerate (`--write` default) or verify (`--check`) a SHA-256 evidence manifest. |
| `tests/test-lib.sh` | Shared harness (scratch clones, hash sets, assertions, fault injectors). |
| `tests/test-plan-a-suite.sh` | Plan A regression suite (main + linked worktree, positive/negative, rollback, missing staging, stale manifest, byte-identical revert). |
| `tests/test-plan-b-suite.sh` | Plan B regression suite (backup/restore, include-negative, partial failure, repeated/idempotent, stale manifests, alternate sources, byte-identical cycles). |
| `tests/test-plans-remediation.sh` | Master runner: static defect checks + both suites + canonical 55/30 counts. |
| `SHA256SUMS` | Regenerated manifest of this directory (never lists itself). |

## Usage (owner-gated; identical CLI to the round-4 kit)

    cd tools/plan-remediation
    ./check-state.sh --expect any --include-negative --with-archives
    ./apply-plan-a.sh                    # dry-run; refuses half-applied states
    ./apply-plan-a.sh --apply            # transactional apply + auto-verify
    ./apply-plan-a.sh --apply --allow-missing-staging   # fresh checkout, fetch later
    ./apply-plan-b.sh                    # dry-run
    ./apply-plan-b.sh --apply            # v2 backup + pre-staged OLD restore + verify
    ./apply-plan-b.sh --apply --include-negative        # main + negative worktree
    ./apply-plan-b.sh --apply --include-negative --negative-staging DIR  # isolated target override
    ./restore-staged-backup.sh --backup-dir DIR --apply # exact pre-Plan-B undo
    ./restore-staged-backup.sh --backup-dir DIR --include-negative --apply
    ./restore-staged-backup.sh --backup-dir DIR --source extracted-new --apply
    ./refresh-evidence-manifest.sh --check .            # or: . (regenerate)

`--backup-dir` is mandatory for restore; apply defaults to
`quarantine/parakeet-20261118/staged-new-backup-<UTC>` and refuses to reuse an
existing directory. `--negative-staging DIR` overrides the default
`worktrees/negative/.../parakeet` target for `--include-negative` runs (used by
the tests so they never write a real worktree).

Exit codes: 0 success/match, 1 failure/mismatch/refusal, 2 usage.

## v2 backup layout (reversibility record)

    BACKUP-PROVENANCE.txt         format_version=2, target_count,
                                  targets_tsv_sha256, manifest_sha256_<id>
    targets.tsv                   <id>	<target path>	<pre-class>
    targets/<id>/backup-manifest.tsv
                                  <file>	<pre_state>	<size>	<sha256>
    targets/<id>/<file>           backed-up pre-Plan-B bytes (NEW)
    install-manifest.tsv          what this run installed (evidence)

Every manifest and the targets file are pinned by SHA-256 in the provenance, so
a stale or tampered manifest is detected by `verify-plan-b.sh` and refused by
`restore-staged-backup.sh`. Files that were absent before Plan B are recorded as
`pre_state=missing` (restore removes them again); `tokens.txt` bytes are shared
between OLD and NEW so it is never replaced and needs no backup.

## Tests and exact counts

    ./tests/test-plans-remediation.sh

The master runner clones fixtures from T5 (APFS copy-on-write), so the ~639 MiB
model bytes are never duplicated on disk and production bytes are only read.
Canonical counts (see `archive/reports/ROUND7-AGENT-EVIDENCE/agentB/`):

* Plan A verifier suite: **55 checks passed / 0 failed** (with NEW staging).
  Missing-staging mode is **42 / 0** (13 staged-byte checks intentionally skipped).
* Plan B verifier suite: **30 checks passed / 0 failed** (main staging + v2
  backup + archives); **31 / 0** with `--include-negative`.

Runtime: Plan A suite ~3 min; Plan B suite ~12-15 min (deliberate full-size
hashing of the real 639 MiB model files).

## Guarantees / limitations

* All test writes are under `$T5/cache/round7/plans/test-run`; every target is an
  APFS clone. The suites re-hash the real staged assets, quarantine extracts and
  archives before and after and fail if anything changed.
* The scripts still require the T5 evidence paths (archives, quarantine
  extracts); they are not portable to an arbitrary CI runner without that data.
* `apply-plan-a.sh` refuses to run on a HEAD other than the planning baseline
  unless `--allow-head` is given; the linked-worktree tests use scratch repos
  whose six pin files are byte-identical to the baseline.
* Legacy (round 4) flat backups remain restorable for one target, but have no
  multi-target record; `--include-negative` is refused for them.
* The owner gates from round 4 (single reviewed commit, fetch-twice,
  `verifyParakeetAssets`, AAB member digests, model-dependent CI, on-device
  parity/performance) are unchanged and are NOT satisfied by this kit.
