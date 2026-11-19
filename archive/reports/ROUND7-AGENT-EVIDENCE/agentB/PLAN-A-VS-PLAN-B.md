# Plan A vs Plan B -- remediation evidence and safe-option recommendation

Round 7, agent B. Baseline: r7/plans worktree at release/v2-candidate
`9002641` (working tree `45d1274` for the six pin files); production repo
`45d1274`. **Neither plan was executed against production**: no pin, model,
archive, AAR or worktree file was changed. The production state remains the
documented hazard (pins OLD, staged NEW: 3/4 digests mismatch).

## What changed in the remediation (why this comparison is now fair)

| Defect | Round 4 behaviour | Remediated behaviour (proven by tests) |
|---|---|---|
| A1 | `apply-plan-a.sh` refused any linked worktree (`.git` is a file) | resolves `git rev-parse --show-toplevel`; main and linked-worktree applies both pass 55/0 |
| A2 | post-verify failure left six pin files modified; bad archive discovered after apply | archive pre-gate + EXIT-trap rollback; failed post-verify restores all six files byte-identically (pre/post SHA-256 equal) |
| A3 | `--allow-missing-staging` could never pass verify | 42/0 verifier in missing-staging mode; strict 55/0 when staging present |
| A4 | stale evidence manifest (`plans-lib.sh` stale, impossible self-entry) | byte-regenerated manifest tool; corrected round-4 bundle manifest verifies `shasum -c` 100% |
| B1 | `--include-negative` not reversible; targets collided in one flat backup | `targets.tsv` + per-target dirs/manifests; restore `--include-negative` returns both targets byte-identically; 31/0 verifier |
| B2 | per-file install; partial/absent targets unrecoverable; idempotent apply broke | pre-staged all-or-nothing commit, manifest rollback, injected rename failure leaves target byte-identical, absent target installed then exactly undone |
| B3 | recovery depended on one backup dir | `--source backup|extracted-new|archive`, all source bytes hash-verified |

Canonical suites after remediation: **Plan A 55/0**, **Plan B 30/0**
(Plan B 31/0 with `--include-negative`), plus the regression suites
(main-worktree + linked-worktree, positive/negative modes, partial failure,
repeated execution, stale manifests, byte-identical before/after hashes).
Exact logs and counts: `logs/plan-a/plan-a-55-check.log`,
`logs/plan-b/plan-b-30-check.log`, `logs/suite-plan-a.run.log`,
`logs/suite-plan-b.run.log`, `logs/remediation-run-*.log`.

## Decision matrix

| Dimension | Plan A -- adopt NEW pins + NEW staged bytes | Plan B -- keep OLD pins + restore OLD staged bytes |
|---|---|---|
| Resulting state | `plan-a` (pins sha256-2 + NEW staged) -- self-consistent | `plan-b` (pins sha256-1 + OLD staged) -- self-consistent |
| Model behaviour | **changes** (new ONNX bytes adopted) | **unchanged** (returns to the pinned old model) |
| Execution evidence | patch applies cleanly in main + linked worktrees; 55/0; transactional rollback proven; byte-exact revert | v2 backup + pre-staged atomic restore; 30/0 (31/0 with negative); reverse restore byte-identical; 3 alternate recovery sources |
| Reversibility | working-tree patch reverse / revert patch byte-exact; **after commit** requires `git revert` + a staged-state decision | backup retained + alternate sources; exact pre-state undo including absent files; re-apply proven |
| Blast radius | 6 tracked files, 24 literals, one MODEL_VERSION bump; staged model files untouched | 4 staged model files per target (~639 MiB, git-ignored); repo files and pins untouched |
| Provenance reproducibility | NEW archive is quarantined + verified and re-fetchable from the upstream release URL (pinned) | OLD bytes are **not** re-fetchable upstream (URL now serves NEW); restore depends on the preserved OLD archive and the verified backup |
| Residual risk | **model-behaviour change** requires owner item G2/G3 (on-device parity/performance/integrity); one coordinated commit + CI/AAB/device gates | freezes the older model and records an adoption deferral; relies on retained local evidence (archive + backup) |
| Execution risk after remediation | low (rollback automatic; archive pre-gate) | low (all-or-nothing; rollback automatic; stale backups refused) |
| Owner gates remaining | commit once, fetch twice, verifyParakeetAssets, bundleRelease/AAB member digests, model-dependent CI, device matrix | keep preserved archive + backup, confirm `check-state --expect old`, never run fetch under OLD pins, record deferral rationale |

## Recommendation -- the safe option

**Plan B is the safe option for the current release/rollback window.** It restores
a consistent, buildable, *unchanged-behaviour* OLD state while keeping the OLD
pins, and the remediation now makes it provably reversible: the pre-Plan-B bytes
are preserved in a provenance-pinned v2 backup, the reverse script restores both
the main and the negative staging targets byte-identically, and three independent
recovery sources are hash-verified. It does not require the owner to accept a
model change before the release is safe, and it removes the current hazard state
(pins OLD + staged NEW).

**Plan A is now technically safe to execute but is not the low-risk default.**
The A1/A2/A3 fixes mean an adoption attempt cannot leave the six pin files
half-applied (rollback is automatic and byte-proven) and works from a linked
worktree; however, it still changes the shipped model bytes and therefore still
requires the full owner-gated parity/performance/device evidence (round 3 A2/A5)
and a single reviewed commit before it can be called safe. Recommended sequencing:
keep Plan B as the safe rollback; adopt Plan A later in a dedicated approved
window once the model-difference gates are signed off -- the remediated scripts
are ready for that window.

## Evidence index

* `logs/plan-a/plan-a-55-check.log` -- canonical Plan A verifier, 55/0
* `logs/plan-b/plan-b-30-check.log` -- canonical Plan B verifier, 30/0
* `logs/suite-plan-a.run.log`, `logs/suite-plan-b.run.log` -- full regression suites
* `hashes/` -- production staged/archive hashes, pin-file before/after sets,
  backup hash snapshots
* `backup-evidence/` -- v2 provenance, targets.tsv, per-target manifests for
  main, negative and missing-target runs
* `patches/plan-remediation.patch` -- exact deliverable diff
* `hashes/deliverable-SHA256SUMS.txt` -- SHA-256 of every delivered file
* `round4-evidence-reconciliation/` -- corrected round-4 evidence manifest,
  `shasum -c` result and A4 stale-entry analysis
