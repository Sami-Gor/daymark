# Round 7 Agent C - Parakeet pin strategies: evidence and recommendation inputs

Owner: **Agent C (`r7-c-parakeet`)** - Round 7, 2026-11-19 (UTC). Parent: `lead`.
Worktree: `/Volumes/DaymarkWorkspace/Daymark/worktrees/r7-pin` (branch `r7/pin`,
HEAD `9002641a7faede2a16434b12e7eeaa94e295a0aa`, base `release/v2-candidate`).
Scratch (T5): `/Volumes/DaymarkWorkspace/Daymark/cache/round7/parakeet`.
Evidence root: this directory.

**No production pin, asset, AAR, source file or workflow was changed. Nothing was pushed.
The production pin remains `ARCHIVE_SHA256 = 5793d0fd...b16bf` with
`MODEL_VERSION = parakeet-tdt-0.6b-v3-int8-sha256-1`. The only repository-side additions
are untracked draft files under `android/kokoro-poc/scripts/drafts-agent-c/` (SHA-256
recorded in `evidence/30-draft-files.txt`).**

---

## TL;DR

1. **The preserved archive is intact and verified.** 487,170,055 B,
   SHA-256 `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`,
   10 members (2 dirs + 8 files), all four model files hash to the expected pins
   (encoder `acfc2b44...`, decoder `179e50c4...`, joiner `3164c13f...`, tokens
   `d5854467...`), and the same bytes are byte-identical on the independent T5Backup
   volume. The full chain of custody (T5Backup 2026-10-19 -> preservation copy 2026-11-14
   -> T5 archive 2026-11-17) is documented. `drafts/verify-parakeet-mirror.sh` re-runs
   every check and exits non-zero on any mismatch.
2. **The current CI is red, correctly failing closed.** Upstream replaced the pinned
   release asset on 2026-11-07 (same URL now serves 487,211,443 B, `1495e91b...`). Running
   today's `fetch-parakeet-assets.sh` against the live URL downloads that file and exits 1
   on the pinned digest. This is why the model job cannot go green without a source change.
3. **Hugging Face fixed revision `2bda32ec70b097a55adaa07d9a7173915b43cc78` exists and
   reproduces the pins exactly.** All four files were downloaded (resumably, T5 scratch),
   hashed, and match the committed per-file pins; the revision is an ancestor commit of
   `main`, whose tip is now `ed5d7456...` (the 2026-11-07 replacement). `-C -` resume was
   tested (HTTP 206) and works.
4. **Both strategies are deliverables, not applied changes:**
   - strategy 1 (recommended primary): a **34-line draft patch** replacing the mutable
     upstream URL with a placeholder for a **Daymark-controlled immutable release asset**,
     with the digest and per-file pins unchanged; plus a verified `SHA256SUMS.parakeet`
     (9 lines) and the exact owner runbook. Needs one owner admin action (enable immutable
     releases + upload) before it can be used. Draft functional tests: mirrored URL via
     `PARAKEET_ARCHIVE_URL` installs and hashes match; wrong/unpublished URL fails closed
     with no assets (`evidence/34-strategy1-draft-functional-tests.log`).
   - strategy 2: a **137-line draft patch** adding a pinned-HF-revision **per-file fallback**
     used only when the archive cannot be fetched/verified, with all four file pins still
     enforced (fail closed). Functional tests on throw-away repo roots: fallback installs
     the pinned files (exit 0); both-sources-fail exits 1 and installs nothing; archive path
     undisturbed; `PARAKEET_HF_FALLBACK=0` disables it.
5. **Do not adopt `1495e91b...` / HF `ed5d7456...`.** Different encoder/decoder/joiner
   bytes, no upstream change statement, no on-device validation. Both strategies above
   deliberately reproduce the original pinned bytes only.
6. **Recommendation inputs for the owner** (detail in `03-comparison-and-recommendation.md`):
   make the immutable Daymark release the primary source (it is the only owner-controlled,
   silent-substitution-proof option and matches existing project precedent); keep HF pinned
   revision as a cross-check/emergency recovery source; decide whether the fallback is
   allowed/default-on in CI. Open questions: release owner/admin, release tag/retention,
   fallback policy, 3-2-1 second copy, documentation/licence edits, and formal decision not
   to adopt the replacement bytes.

## Deliverables

| Path | What |
|---|---|
| `01-immutable-mirror-strategy.md` | Strategy 1: verification results, provenance, exact CI pinning/verification (URL placeholder, unchanged hash checks, SHA256SUMS coverage), reproducibility, rollback, residual risks |
| `02-hf-fixed-revision-strategy.md` | Strategy 2: revision verification, per-file fetch+verify procedure, resumability, fail-closed behaviour, reproducibility, network dependency, required code change, draft patch description, rollback |
| `03-comparison-and-recommendation.md` | Side-by-side comparison (integrity/provenance, reproducibility, CI reliability/network, maintenance/rollback, silent-change risk), recommendation inputs, decision menu, unresolved owner questions, acceptance criteria |
| `drafts/` | `fetch-parakeet-assets.controlled-source.patch`, `fetch-parakeet-assets.hf-fallback.patch` + full draft script, `SHA256SUMS.parakeet`, `verify-parakeet-mirror.sh`, `fetch-hf-pinned-revision.sh`, `README.md` |
| `evidence/` | 30+ hash/command/API evidence files, see `evidence/00-EVIDENCE-INDEX.md`; machine summary `evidence/32-summary.json` |
| `android/kokoro-poc/scripts/drafts-agent-c/` (in r7/pin) | byte-identical copies of the drafts; untracked; SHA-256 in `evidence/30-draft-files.txt` |

## Key identities (single table)

| Item | Value |
|---|---|
| Pinned archive | `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` |
| Archive size / SHA-256 | 487,170,055 B / `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf` |
| encoder.int8.onnx (652,184,281 B) | `acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247` |
| decoder.int8.onnx (11,845,275 B) | `179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e` |
| joiner.int8.onnx (6,355,277 B) | `3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3` |
| tokens.txt (93,939 B) | `d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d` |
| HF fallback repo / revision | `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8` / `2bda32ec70b097a55adaa07d9a7173915b43cc78` (2025-08-16T09:29:07Z) |
| Replacement (NOT adopted) | archive 487,211,443 B `1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9`; HF `main` `ed5d745623472f97cfc2e6c2916ee248798fc5a8` (2026-11-07) |

## Draft SHA-256 (also in r7/pin; copies verified byte-identical)

```
1f90d171450433f33fffa1f5e7332ad98b456d4b68790fab3f2d25c3c6382a3f  README.md
afaa849323c2f5c625ecf4abb6d7c6b6f180c7127d162b21c43990fa78503467  fetch-parakeet-assets.controlled-source.patch
8432e319e29a7b3950224096de1722eb4f92a2ac0919912a2bb1020c3e68c211  fetch-parakeet-assets.hf-fallback.patch
82a2c14e7dabcff4ea4f8cdb94978785f9ea0bd347c0f2703c8b0de78862d400  fetch-parakeet-assets.hf-fallback.sh
bb7bbbca8d5dfbb275d4c00bd4fb89fde4d7e888c1efbcea088e51148676c621  SHA256SUMS.parakeet
5bbbb96c9bf6f7b04d1162a57605ad766e5d33c8c8e6edbbed21056c4e698377  verify-parakeet-mirror.sh
74ea8e55250f1fbe7e2c85224fb533f5f7166239d2a894f8da978421d7eaddcc  fetch-hf-pinned-revision.sh
```

## Reproduce the checks

```bash
# 1. archive identity + members + per-file pins (read-only; extracts to a temp dir)
bash archive/reports/ROUND7-AGENT-EVIDENCE/agentC/drafts/verify-parakeet-mirror.sh

# 2. archive hash (5 s)
shasum -a 256 /Volumes/DaymarkWorkspace/Daymark/archive/assets/parakeet-preservation/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2

# 3. SHA256SUMS draft against archive + extracted tree
#    (copy the manifest next to the archive and an extracted copy, then)
shasum -a 256 -c SHA256SUMS.parakeet

# 4. HF fixed revision (resumable; ~30 s, 670 MB) - see 02-... section 2 for the loop
# 5. current production script fails closed today (downloads 487 MB; exits 1)
#    evidence: evidence/26-current-fetch-failclosed-T5TEMP.log

# 6. draft patches apply cleanly but are NOT applied
git -C /Volumes/DaymarkWorkspace/Daymark/worktrees/r7-pin \
  apply --check android/kokoro-poc/scripts/drafts-agent-c/fetch-parakeet-assets.controlled-source.patch
git -C /Volumes/DaymarkWorkspace/Daymark/worktrees/r7-pin \
  apply --check android/kokoro-poc/scripts/drafts-agent-c/fetch-parakeet-assets.hf-fallback.patch
```

## Caveats / limitations (full transparency)

- **Temp-volume incident:** the first current-script fail-closed test ran the unmodified
  script; macOS `mktemp` ignores `TMPDIR`, so its ~487 MB download went to the internal
  per-user temp dir and was deleted by the script's `trap` on exit. The test was re-run with
  a test-only copy whose temp dir is pinned to T5 (`evidence/26`), same result; no temporary
  files or space were left behind. All other downloads (HF files, test artifacts) are on T5.
- **HF API rate limiting:** a burst of HF API probes temporarily returned HTML WAF challenge
  pages. The final JSON evidence (`16`-`20`) was re-fetched with `Accept: application/json`,
  a browser-like User-Agent and backoff; each file is valid JSON at the recorded sizes.
- **Full-volume size scan abandoned:** a `find` for other copies of the archive across the
  whole 170 GB volume was too slow under concurrent load; known locations were checked
  instead (`evidence/31`). No full-volume negative proof is claimed.
- **Draft functional tests** ran in throw-away repository roots on T5 with a test-only temp
  path substitution; timings and paths in the log are therefore not production paths.
- **Immutable-release setting** is read via the authenticated `gh` CLI (read-only); the
  unauthenticated REST endpoint returns 401 for that field on a public repo.
- **Time:** "today" is 2026-11-19 UTC; upstream/HF metadata was captured then and can change
  later - the file hashes and URLs are the durable evidence.
- **Availability of HF evidence directories:** the four HF files and the extracted mirror are
  deliberately kept in the T5 scratch dir (`cache/round7/parakeet/`) as reproduction inputs.

## Open items for the owner / parent

See section 5 of `03-comparison-and-recommendation.md` (10 questions: release owner/tag,
fallback policy, second copy, licence/docs edits, formal non-adoption of `1495e91b...`,
CI hardening order, device-validation expectations, SHA256SUMS scope). None of these blocks
the recommendation that the immutable mirror is the preferred primary.
