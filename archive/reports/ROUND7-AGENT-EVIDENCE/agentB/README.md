# Agent B evidence index -- Round 7 Plan A/B rollback remediation

| Path | Contents |
|---|---|
| `REMEDIATION-REPORT.md` | Full report: defects A1-A4/B1-B3, fixes, regression suites, exact test counts, no-production-change evidence, limitations. |
| `PLAN-A-VS-PLAN-B.md` | Decision matrix and safe-option recommendation with evidence pointers. |
| `git-head.txt`, `git-log.txt`, `worktree-status.txt` | Local commit SHA(s) on `r7/plans`; no push/merge. |
| `deliverable-git-files.txt` | Files committed under `worktrees/r7-plans/tools/plan-remediation/`. |
| `logs/` | Suite + master-run logs, environment, kit manifest check. |
| `logs/plan-a/` | Plan A suite logs incl. `plan-a-55-check.log` (canonical 55/0) and apply/verify/rollback logs. |
| `logs/plan-b/` | Plan B suite logs incl. `plan-b-30-check.log` (canonical 30/0) and 31/0 include-negative log. |
| `hashes/` | Deliverable SHA256SUMS + per-file hashes, production staging/archive hashes, before/after hash sets and backup manifests. |
| `backup-evidence/` | Copied v2 provenance/targets/per-target manifests for main, negative and absent-target runs (append-only evidence for B1/B2/B3). |
| `patches/plan-remediation.patch` | Exact git diff of the deliverable commit (reviewable patch file). |
| `round4-evidence-reconciliation/` | Corrected round-4 evidence bundle manifest (A4), `shasum -c` result, computed stale-entry analysis. Original round-4 files untouched. |
| `production-repo-head.txt` | Production repo HEAD at collection time (unchanged baseline). |
| `starting-state.txt` | Ledger baseline snapshot copied from `../starting-state.txt`. |
| `environment.txt` | Host/tool versions and disk state used for the runs. |
| `TRANSIENT-NEGATIVE-STAGING-DISCLOSURE.md` | Disclosure + hash proof of a transient pre-final test write to the default negative staging (net state unchanged, fixed by `--negative-staging`). |
| `logs/incident-plan-b-suite-pre-fix.run.log` | The pre-fix suite log showing the 2 path-isolation failures and the final production-unchanged assertion. |
| `collector.log` | Evidence collection transcript. |

Everything in this directory was produced by read-only inspection of production
paths plus writes to the disposable T5 cache
(`/Volumes/DaymarkWorkspace/Daymark/cache/round7/plans`).
