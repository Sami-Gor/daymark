# Technical Remediation Round 7 - 2026-11-19

T5 workspace: /Volumes/DaymarkWorkspace/Daymark (mount verified). Canonical repo: repositories/daymark. All reads, edits, tests, caches and evidence on T5.

## Starting state

- Repo HEAD 45d12748679fa67723e6a5b2d997eb7711f05c43 (branch public/pr54-n1-error-propagation-release-v2), working tree clean, 245 refs, 41 linked worktrees.
- Workspace image: 170 GiB, ~33 GiB free at start (32 GiB after work); host T5 volume 65 GiB free.
- Isolated worktrees created and used: r7-pr80 (from candidate aedfe8ae), r7-plans (9002641), r7-pin (9002641).

## Agent A - PR #80 V2.1 integration

- Worktree /worktrees/r7-pr80, branch r7/pr80-v21; work commit e09c34c40f7396079d73449478323eb6b80dde9c (18 files, +230/-569; tests/config only). Working tree clean; nothing pushed.
- Fixed Vite 8 / Vitest TSX failure: vitest.config.ts now applies @vitejs/plugin-react (existing devDependency); weather-errors tests load and pass; no tests disabled.
- Ported the main E2E suite to v2.1 web behaviour: voice is Android-native only (hidden on web; browser speech stubs and voice controls page object removed, voice.spec rewritten as hidden-voice regressions), V2 privacy wording, 0.025-degree geolocation grid (latitude=51.5, longitude=-0.125), V2 location-notice flow, hostile-transcript sanitization moved to Android/unit coverage. No fixed sleeps added; waits are deterministic.
- Final counts: 164 -> 154 E2E tests (10 browser-voice scenarios cannot exist on web; replaced by voice-must-stay-hidden regressions; Android voice covered by unit suites).
- Results on e09c34c: frozen install 0; typecheck 0; build 0; sync:android-web 0 (27 files match); unit 32 files / 414 passed + 1 pre-existing skipped; lint:e2e 0; full Playwright chromium E2E 154 passed / 0 failed.
- Coordinator independently re-ran on e09c34c: typecheck 0, build 0, unit 414 passed + 1 skipped, E2E 154 passed.
- PR #80 remains draft at 04ec4cc (not pushed); candidate is ready for review, with the coverage trade-off disclosed.

## Agent B - Plan A/B rollback remediation

- Worktree /worktrees/r7-plans, branch r7/plans; deliverable commit a076df3f1366de83e9607dad697f01fe088cd1ff (tools/plan-remediation/, 18 files; portable current SHA256SUMS; archive originals untouched).
- Plan A fixes: A1 linked-worktree/root detection via git rev-parse --show-toplevel; A2 archive pre-gate + transactional rollback proving six pin files byte-identical; A3 verifier --allow-missing-staging threaded through apply; A4 refreshed evidence manifests (self-entry removed, stale entries corrected).
- Plan B fixes: B1 multi-target backup (targets.tsv + per-target manifests) making --include-negative reversible; B2 per-file pre-stage + all-or-nothing commit + rollback on injected failure; B3 recovery sources backup, extracted-new, archive all hash/size verified; --negative-staging avoids touching real worktrees.
- Exact results: Plan A canonical 55/0; missing-staging 42/0; Plan B canonical 30/0; include-negative 31/0; Plan A regression 55/0 (main + linked worktree, rollback, stale manifest, byte-identical); Plan B regression 82/0 (partial failure, repeated/idempotent, 3 recovery sources, reverse cycles); master static+suite 16/0. Coordinator verified the deliverable SHA256SUMS: all OK.
- Recommendation: Plan B safe for the current window (byte-proven reversible); Plan A now technically safe but remains a shipped-model change requiring owner parity/performance/device gates.
- Disclosure: one pre-fix intermediate test iteration transiently wrote OLD bytes to the default negative staging and restored NEW about 2 minutes later; net hashes unchanged; root cause fixed in a076df3 via --negative-staging (timeline and hash proof in agentB/TRANSIENT-NEGATIVE-STAGING-DISCLOSURE.md).

## Agent C - Parakeet pin strategies

- Worktree /worktrees/r7-pin at 9002641 with untracked drafts under android/kokoro-poc/scripts/drafts-agent-c/; no tracked production change.
- Strategy 1 (immutable mirror) verified: preserved archive 487,170,055 B = 5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf; 10-entry allow-list; model files match pins (encoder acfc2b44..., decoder 179e50c4..., joiner 3164c13f..., tokens d5854467...); provenance chain T5Backup original -> pres-1 copy -> T5 archive; current CI is correctly fail-closed (live URL now serves 1495e91b..., 487,211,443 B). Draft URL-only patch (34 lines, git-apply clean) keeps archive and per-file pins, adds a Daymark-controlled mirror placeholder plus override; draft SHA256SUMS.parakeet (9 verified lines) ready.
- Strategy 2 (fixed HF revision) verified: csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8 at 2bda32ec70b097a55adaa07d9a7173915b43cc78 exists (2025-08-16, ancestor of main); four files downloaded with resume and hash-match all existing pins; coordinator confirmed encoder acfc2b44...; HF LFS oids independently corroborate. Draft pinned-revision per-file fallback patch (137 lines, not applied) fails closed and leaves the archive path unchanged.
- Comparison: Strategy 1 preferred primary (owner-controlled/immutable, pins unchanged, works for fork PRs); Strategy 2 as independent cross-check/emergency fallback, default off. Do not adopt 1495e91b... or HF ed5d7456... without owner re-validation.
- Owner decision required: release owner/tag/immutability, fallback policy, retention/second copy, docs and SHA256SUMS scope, device-validation expectation, formal non-adoption record.

## Safety and boundaries

- No production pin change: fetch-parakeet-assets.sh still pins 5793d0fd...; preserved archive re-verified untouched.
- No AAR, signing material, release-baseline, staged-production-model or workflow changes. The pre-existing hazard remains unchanged: staged assets are NEW bytes while pins are OLD.
- No pushes, merges, force-pushes, tags, branch deletions, resets or GC. r7 branches exist only locally (remote r7 refs = 0). PR #71 (049b484) and PR #74 (772cc94) remote heads unchanged.
- Repository history, refs and worktrees preserved (44 worktrees listed, all expected).

## Remaining work / owner decisions

1. PR #80: review candidate e09c34c on r7/pr80-v21; push/PR update only with authorization; confirm the 164 -> 154 E2E coverage trade-off (Android voice covered by unit suites).
2. Parakeet: choose Strategy 1 (mirror, recommended) or Strategy 2 (HF fallback) and authorize implementation; required before release PRs #73/#75/#76/#81/#82 can pass verify.
3. Plan A: owner-gated model-change window (55/0 now passing); Plan B recommended for immediate safe use with retained backup.
4. PR #71 and #74 remain drafts awaiting human review.

## Evidence

- archive/reports/ROUND7-AGENT-EVIDENCE/agentA/ (17 files: README plus unit/E2E/typecheck/build/sync logs, baseline and final runs)
- archive/reports/ROUND7-AGENT-EVIDENCE/agentB/ (109 files; REMEDIATION-REPORT.md, PLAN-A-VS-PLAN-B.md, transient-staging disclosure, backup evidence)
- archive/reports/ROUND7-AGENT-EVIDENCE/agentC/ (53 files; strategy docs, comparison, evidence index, hashes and download logs)
- archive/reports/ROUND7-AGENT-EVIDENCE/starting-state.txt and coordinator-verification.txt
