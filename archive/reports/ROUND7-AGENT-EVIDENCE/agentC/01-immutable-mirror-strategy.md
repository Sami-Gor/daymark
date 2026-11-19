# Strategy 1 - Immutable mirror of the preserved archive (Daymark-controlled release asset)

Status: **verified, ready for owner action; no repository or pin changes made by Agent C.**
Verified: 2026-11-19T21:26Z-21:50Z (Europe/London = UTC), Round 7, Agent C (r7-c-parakeet).
Baseline: worktree `r7-pin` at `9002641a7faede2a16434b12e7eeaa94e295a0aa` (branch `r7/pin`, clean).

This document covers strategy 1 of the Round 7 pin brief: keep the **original bytes** and
serve them from a Daymark-controlled, immutable location; document exact CI pinning and
verification, reproducibility and rollback.

---

## 1. What was verified (all commands read-only; evidence in `evidence/`)

| Item | Result | Evidence |
|---|---|---|
| Archive path | `/Volumes/DaymarkWorkspace/Daymark/archive/assets/parakeet-preservation/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` | `01-archive-stat.txt` |
| Archive size | **487,170,055 bytes** (stat; matches expected) | `01-archive-stat.txt` |
| Archive SHA-256 | **`5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`** - matches the committed pin | `02-archive-sha256.txt` |
| bzip2 magic | `42 5a 68` (`BZh`) | `01-archive-stat.txt` |
| Members | **10** = 2 directories + 8 files, closed allow-list, archive order | `03-archive-members.txt` |
| Member safety | no absolute paths, no `..`, no symlink/hardlink members, no duplicates | `05-mirror-verification-run.log` |
| Model files | encoder `acfc2b44...` 652,184,281 B; decoder `179e50c4...` 11,845,275 B; joiner `3164c13f...` 6,355,277 B; tokens `d5854467...` 93,939 B - **all four match the repo pins** | `04-member-hashes.txt` |
| Test wavs | en `148b936b...`, fr `b59be434...`, es `49fd2cfa...`, de `36d3c484...` | `04-member-hashes.txt` |
| Full-manifest check | `shasum -a 256 -c SHA256SUMS.parakeet` over archive + extracted tree: **all 9 lines OK** | `drafts/SHA256SUMS.parakeet` (verified 2026-11-19) |
| Independent medium cross-check | T5Backup copy `/Volumes/T5Backup/Daymark/01-stt-evaluation/models/parakeet-v3/...` (separate physical volume, exFAT) hashes to the same value; `cmp` reports **IDENTICAL**; its extracted old-model directory hashes to the four pins | `08-t5backup-crosscheck.txt` |
| Repo pin locations | archive digest in `fetch-parakeet-assets.sh:21`, `THIRD-PARTY-NOTICES.md:12,49`, `reproducible-build-guide.md:212`; per-file digests in the script (:23-26), notices (:50-53), guide (:208-211), `build.gradle:39-42`, `ParakeetModelAssets.java:45-48`; `MODEL_VERSION = parakeet-tdt-0.6b-v3-int8-sha256-1` at `ParakeetModelAssets.java:58` | `11-pin-locations.txt` |

Re-run the full check at any time:

```bash
TMPDIR=/Volumes/DaymarkWorkspace/Daymark/cache/round7/parakeet/tmp \
  bash archive/reports/ROUND7-AGENT-EVIDENCE/agentC/drafts/verify-parakeet-mirror.sh
```

(`TMPDIR` is advisory on macOS; the script uses `mktemp -d`, which ignores `TMPDIR` on
macOS and extracts to the per-user temp dir. That is 1.1 GB of transient scratch, deleted by
the trap. Prefer the T5 scratch copy when running it repeatedly.)

---

## 2. Provenance: where and how the archive was preserved

The archive is the **original** upstream `asr-models` release asset, captured before upstream
silently replaced it. Documented chain (with independent re-checks by this agent):

1. **Original download / T5 source (2026-10-19T15:53:06+0100)**
   `/Volumes/T5Backup/Daymark/01-stt-evaluation/models/parakeet-v3/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`
   size 487,170,055 B, mtime 2026-10-19T15:53:06+0100. Still present and byte-identical today
   (`cmp` IDENTICAL; SHA-256 matches; extracted directory matches the four pins).
   Evidence: `08-t5backup-crosscheck.txt`; original copy verification in
   `reports/agent-reviews/pres-1-copy/report.md` sections 1, 3-5.
2. **Preservation copy (2026-11-14T14:27:17Z)**
   Agent pres-1-copy ran `cp -p` to `/Users/m1/Desktop/pr54-work/parakeet-preservation/`,
   then `shasum -a 256` on source and destination and `cmp` - all identical. No extraction.
   Evidence: `reports/agent-reviews/pres-1-copy/report.md` sections 4-5.
3. **Migration into the T5 archive (2026-11-17T19:16:55Z)**
   Phase 4, item [20] of the final migration: `parakeet-preservation -> archive/assets/parakeet-preservation (465M)`,
   then `verified parakeet-preservation: files=1 symlinks=0 manifest=OK` at 19:17:03.
   Evidence: `archive/reports/migration-logs/final-migration-20261117T185357.log` lines 48-49
   (excerpted in `07-provenance-chain.txt`).
4. **Round 7 re-verification (2026-11-19)**
   size + SHA-256 + 10-member allow-list + extraction + 8 per-file hashes, all PASS
   (this document and `evidence/`).

Observed metadata of the preserved file: mode `0700`, uid 501 / gid 20, mtime and birth
2026-10-19T15:53:06+0100, ctime 2026-11-17T19:16:59Z (migration), `com.apple.provenance`
xattr. Directory mtime 2026-11-14T14:27:17Z matches the preservation copy time.

**Why this matters:** upstream's `asr-models` release is mutable. Its current asset
(id **719769366**, created/updated **2026-11-07**) is served at the pinned URL but is a
different file: size **487,211,443**, digest
**`1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9`**. The previously pinned
487,170,055-byte archive is no longer served (HEAD last-modified 2026-11-07,
content-length 487,211,443). Evidence: `09-upstream-state.txt`, `10-replacement-archive.txt`. The
replacement is **not adopted** (see section 6).

---

## 3. Exact CI pinning and verification (as it is today, and what changes)

### 3.1 Current wiring

| Where | What |
|---|---|
| `.github/workflows/ci.yml:210-211` | model-dependent job: `android/kokoro-poc/scripts/fetch-parakeet-assets.sh` (job gated by `needs.classify.outputs.model_required == 'true'`, `:171`) |
| `.github/workflows/ci.yml:213-215` | `./gradlew --no-daemon :parakeet-assets:verifyParakeetAssets :app:assembleDebug :app:bundleDebug` |
| `.github/workflows/android-ci.yml:131-132` | same fetch script on the Android CI path |
| `scripts/ci/classify-model-dependency.mjs:36-38` | `android/kokoro-poc/**` and `parakeet-assets/**` are model-dependent paths, so a fetch-script change always runs the model job |
| `fetch-parakeet-assets.sh:20-26` | `ARCHIVE_URL` (mutable upstream) + archive SHA-256 + four per-file SHA-256 pins |
| `fetch-parakeet-assets.sh:42-65` | download -> archive hash check -> extract -> copy -> per-file hash checks (fails closed, no `continue-on-error`) |
| `parakeet-assets/build.gradle:74-108` | `:parakeet-assets:verifyParakeetAssets` re-hashes the staged files against the same pins before any release bundle |
| app runtime | `ParakeetModelAssets.MODEL_FILE_SHA256` re-verifies on device before load |

### 3.2 Current state is red / fails closed

Running the **current** production script against the live upstream URL (2026-11-19T21:33Z)
downloads 487,211,443 bytes and exits **1**:

```
checksum mismatch for .../model.tar.bz2:
  1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9 !=
  5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf
EXIT=1
```

Evidence: `26-current-fetch-failclosed-T5TEMP.log` (clean T5-temp run) and
`25-current-fetch-failclosed-internal-temp.log`. This is the correct behaviour - it is also
why the model job cannot go green until the source is repointed.

### 3.3 Required change: one reviewed URL, pins unchanged

Minimal patch (draft, **not applied**): `drafts/fetch-parakeet-assets.controlled-source.patch`
(34 lines; `git apply --check` passes against `r7/pin`). It:

- keeps `ARCHIVE_SHA256` (line 21) and all four per-file pins (lines 23-26) **byte-for-byte**;
- demotes the upstream URL to `UPSTREAM_ARCHIVE_URL` (provenance only, never fetched);
- adds `CONTROLLED_ARCHIVE_URL` with a **Daymark-controlled release-asset URL placeholder**
  (owner must create the release; the exact tag is an owner decision):

```
https://github.com/Sami-Gor/daymark/releases/download/<release-tag>/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2
```

- adds an approved-mirror override `ARCHIVE_URL="${PARAKEET_ARCHIVE_URL:-$CONTROLLED_ARCHIVE_URL}"`;
  the SHA-256 pin still wins, so any wrong/substituted URL fails closed.

Functional tests of the draft (fake repo roots on T5, evidence
`evidence/34-strategy1-draft-functional-tests.log`): with `PARAKEET_ARCHIVE_URL` set to a
mirror copy the install succeeds and all four hashes match; a wrong/unreachable URL exits
non-zero and installs nothing; the not-yet-published committed placeholder URL also fails
closed; and all five pinned digests are byte-identical between the production script and
the patched copy.

For the full multi-file design (scheme/host allow-list, member allow-list, identity logging,
test file, workflow env for Mode B) see the existing
`reports/agent-reviews/pres-4-ciplan/report.md` - this Round 7 draft is the
minimum viable version of that plan.

### 3.4 Owner action sequence (not performed by Agent C; uploads forbidden)

1. Enable immutable releases on `Sami-Gor/daymark` **first** (only future releases are
   affected): `gh api -X PUT repos/Sami-Gor/daymark/immutable-releases`. Current state:
   `{"enabled":false,"enforced_by_owner":false}` (re-checked 2026-11-19; evidence
   `13-hosting-state.txt`; unauthenticated API returns 401, the value is from the
   authenticated `gh` read).
2. Create a new release with a dedicated, never-reused tag (e.g.
   `parakeet-tdt-0.6b-v3-int8-v1`). Do **not** attach to the existing mutable `v2.0.0`.
3. Upload the exact preserved file (byte-for-byte from
   `archive/assets/parakeet-preservation/...`) and a `SHA256SUMS` asset
   (draft: `drafts/SHA256SUMS.parakeet`, 9 verified lines).
4. Publish, then verify with `gh api repos/Sami-Gor/daymark/releases/tags/<tag>` that
   `immutable: true` and the asset digest is `sha256:5793d0fd...`.
5. Apply the URL patch, run the model job once from a clean runner, and confirm the
   identity line shows the controlled URL and digest `5793d0fd...`.
6. Update provenance docs (third-party notices URL, reproducible-build guide) - one
   reviewed commit; **no digest, size, `MODEL_VERSION` or runtime change**.

### 3.5 SHA256SUMS coverage

Current coverage is incomplete:

- The v2.0.0 release ships a `SHA256SUMS` asset (2,054 B) that lists the AAB and build
  logs but has **no Parakeet archive/model digest lines** - its only Parakeet-related line is a build log, `LOGS/11-parakeet-integrity.log` (evidence `28-release-v2.0.0-SHA256SUMS.txt`).
- The repo has no root `SHA256SUMS`; the only tracked `SHA256SUMS` is the unrelated
  sherpa-onnx CVE fixture file.
- The Parakeet archive + four model files are pinned in the fetch script, Gradle and Java,
  but not in any published checksum manifest.

Proposed coverage (draft `drafts/SHA256SUMS.parakeet`, verified with
`shasum -a 256 -c` = all 9 OK): the archive, the four model files and the four test wavs,
with the archive at the manifest root and members under
`sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/`. Publish it as a release asset next to the
archive. This gives consumers a single file covering the archive **and** every extracted
artifact, and it is also what a future pre-staged/offline build would verify.

---

## 4. Reproducibility

- The pinned archive is byte-identical to the historical upstream asset and to the
  T5Backup source (two physical media, `cmp` identical). Fetching the archived bytes from any
  approved mirror yields the same SHA-256 `5793d0fd...`, so the build input is deterministic.
- Extraction is deterministic (tar members and per-file digests fixed); the build does not
  process the model further - the same four bytes are packaged and re-checked by Gradle and
  by the app at load time.
- Once published, the controlled URL is a constant in-repo value; reproducibility no longer
  depends on upstream project state, release-asset mutation or a third-party CDN's policy.
- Offline/air-gapped builds can use a pre-staged archive (pres-4 proposes
  `PARAKEET_ARCHIVE_FILE`); the hash checks make a local file as trustworthy as a download.
- Caveat: reproducibility still depends on GitHub hosting the release. Immutable release
  semantics prevent **silent substitution**; they do not prevent **deletion** (which is
  detectable as 404/failure, not silent). Keep the T5 master copy + at least one holder
  elsewhere for disaster recovery.

---

## 5. Rollback

- **URL-only rollback:** revert the one-line controlled-URL commit. Because the digest pin
  is unchanged, rolling back to a previous approved URL (or a mirror via
  `PARAKEET_ARCHIVE_URL`) requires no model/asset change and cannot change the build input.
- **Bad release asset discovered:** if the published asset differs, the hash check fails
  closed before extraction; do not republish the same tag (immutability forbids it) -
  publish a new tag and repoint the URL. Same bytes, so no app change.
- **Deleted/unavailable release:** build fails closed; restore by re-uploading the preserved
  bytes to a new tag (the T5 master copy is intact) or by pointing
  `PARAKEET_ARCHIVE_URL` at a pre-approved mirror.
- **Old releases unaffected:** already-published APK/AAB and on-device models keep the same
  pinned digests; `MODEL_VERSION` stays `parakeet-tdt-0.6b-v3-int8-sha256-1` because the
  content does not change.
- Do not delete the T5 preservation copy or the T5Backup source while the new hosting is
  unproven.

---

## 6. Explicit non-goal: do not adopt the replacement bytes

The replacement archive upstream now serves (**487,211,443 B, `1495e91b...`**) and the
matching HF revision `ed5d7456...` (2026-11-07) contain different encoder/decoder/joiner
bytes (`1afbe69c...`, `0222a861...`, `cbd02f36...`). They are out of scope for this
strategy and must not be adopted: they are unvalidated on device and no upstream change
statement exists. See `10-replacement-archive.txt` and the quarantine analysis
`archive/reports/PARAKEET-ARCHIVE-VERIFICATION-20261118.md`.

---

## 7. Residual risks of strategy 1 (for the comparison)

- The only hosted copy would be on a **single-owner personal GitHub account** with no
  organisation policy/audit; immutable releases are currently **disabled** and enabling is
  an owner admin action. A single token compromise could delete/transfer the repo (silent
  substitution is still prevented by the digest check; deletion is a visible failure).
- T5 is the only master copy until the release exists; T5Backup is the only second copy
  (same site, same person, not off-site/3-2-1).
- GitHub availability/bandwidth for a ~465 MiB build dependency (precedented by the 591 MB
  AAB release asset).
- No change needed to runtime network behaviour or privacy: build-time only.
