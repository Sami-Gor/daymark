# Comparison and recommendation inputs - Round 7 Parakeet pin strategies

Scope: compare (1) immutable mirror of the preserved archive vs (2) fixed Hugging Face
revision per-file fetch. Evidence: `01-immutable-mirror-strategy.md`,
`02-hf-fixed-revision-strategy.md`, `evidence/`, `drafts/`.
No production pin, asset or AAR change was made; no push. Baseline worktree `r7-pin` at
`9002641`, clean before and after (only new untracked draft files were added at the end).

---

## 1. The problem both strategies solve

Upstream is mutable and already changed: the k2-fsa `asr-models` release asset at the
committed URL was replaced on **2026-11-07** with different bytes (487,211,443 B,
`1495e91b...`) while the repo pins the original bytes (487,170,055 B, `5793d0fd...`).
The current CI model job therefore downloads and **fails closed** on the digest
(`2026-11-19T21:33Z` re-verified, evidence `25/26-current-fetch-failclosed*.log`).
Both strategies restore a green, verifiable build **without changing the pinned bytes**.

The pinned bytes are independently preserved (T5 archive + T5Backup copy, byte-identical;
see `01-immutable-mirror-strategy.md` section 2) and are reproducible from the fixed HF
revision (all four files hash to the existing pins; `02-hf-fixed-revision-strategy.md`).

## 2. Comparison

Legend: **strong / partial / weak**; every cell is backed by evidence in this directory.

| Criterion | 1. Immutable mirror (Daymark-controlled release asset) | 2. Fixed HF revision, per-file |
|---|---|---|
| **Integrity / provenance** | **Strong.** Archive hash `5793d0fd...` verified; 10-member closed allow-list; 8 member hashes match; reproduces upstream historical identity; T5Backup second copy `cmp`-identical; pin predates upstream change. Provenance is **Daymark-controlled** and reviewable in-repo. | **Strong on content** (all four files bit-identical to pins; HF LFS oids equal pins; commit SHA content-addressed) but **weak on control**: hosted by a third party (csukuangfj personal HF repo), no Daymark ownership; no archive container/manifest, only four loose files; repo has no README at the old revision (no licence text in-tree). |
| **Reproducibility** | **Strong.** Same archive bytes from immutable asset -> deterministic extraction -> exact pins; works offline once the archive is staged; no dependence on upstream project state. | **Partial.** Exact bytes reproducible while the HF repo/commit/LFS exists; no immutability contract for Daymark; depends on HF availability and on the repo owner's actions. Deterministic per run, not durable. |
| **CI reliability / network** | **Strong once published.** One `curl` from a stable GitHub release URL (same mechanism as the existing 591 MB AAB release asset); no auth; fork PRs work because the URL is public and in-repo (pres-4 Mode A). Single external dependency: GitHub. | **Partial.** Four requests + redirects to a third-party CDN (`us.aws.cdn.hf.co`), ~670 MB egress per run; public/no auth, but a third-party dependency with no SLA; HF rate-limit/WAF challenge pages were observed during burst API probing (recovered with backoff); `main` demonstrated it can move. |
| **Maintenance / rollback** | **Strong.** One-line URL constant (draft patch, 34 lines, `git apply` clean; pins unchanged). Rollback = revert one line or repoint an approved mirror via env override. Refreshing the model needs a new tag + new pins + re-evaluation (deliberate). | **Partial.** Requires a real code change (~137-line draft patch: fallback branch, per-file loop, staging). Rollback = revert/disable the patch; model refresh requires changing revision + pins together. No archive path means no member-list/manifest check in that mode. |
| **Risk of silent model change** | **Low.** Immutable release + in-repo SHA-256 pin means a substitution (same URL, different bytes) is either impossible (immutable release) or **fails closed** (digest mismatch). Deletion is possible but is a loud 404/failure, not silent drift. Residual: single-owner GitHub account; immutability currently disabled until owner enables it. | **Low for pinned commit, non-zero overall.** A commit-addressed revision cannot be silently re-pointed; a digest mismatch fails closed. But the *repository* can move (`main` -> `ed5d7456` on 2026-11-07, proven), or be deleted/made private; continuing to exist is not contractually guaranteed. A tag/branch reference would be **unsafe**; only the SHA is acceptable. |
| **Does it adopt `1495e91b...`?** | No - uses only the preserved original bytes. | No - pinned revision `2bda32ec` predates the change; its files equal the original pins. `main`/`ed5d7456` are explicitly excluded. |
| **Changes to runtime/privacy** | None (build-time only). | None (build-time only; new build hosts `huggingface.co` + CDN). |
| **Licence/attribution** | Unchanged (CC BY 4.0; notices keep NVIDIA attribution and unmodified-int8 statement; only the fetch URL changes). | Content identical to strategy 1, so licence/attribution obligations are the same; HF repo declares `license:cc-by-4.0` and `base_model:nvidia/parakeet-tdt-0.6b-v3`. |
| **Time to green CI** | Blocked on an **owner admin action** (enable immutable releases, create + upload release, update URL) - roughly one sitting. | Can be done by a **code change alone** (no owner upload), if the team accepts a third-party build source. |
| **Evidence readiness** | Archive verified, member list/pins verified, URL patch drafted, SHA256SUMS drafted/verified. | Revision verified, four files downloaded+verified with T5 logs, resumability and fail-closed tested, patch drafted and functional-tested. |

## 3. Recommendation inputs

1. **Preferred primary: strategy 1, the immutable mirror.** It is the only option where the
   bytes and their availability are controlled by the project, it matches the project's
   existing hosting precedent (`v2.0.0` release asset), it keeps every committed digest
   unchanged, and it can be made tamper-evident (enable immutable releases, publish
   `SHA256SUMS.parakeet`). The preconditions are owner actions, not code risk.
2. **Strategy 2 is a good cross-check and emergency recovery path, not a preferred home.**
   Its strongest contribution is independent corroboration: the HF LFS oids at `2bda32ec`
   equal the committed pins, and a complete per-file fetch hashes to the same bytes - an
   independent second provider that can restore the build while the Daymark release is being
   set up. As a permanent primary it is weak on control, durability and CI dependency.
3. **Suggested composition (for owner decision):**
   - Ship the strategy-1 URL change + `SHA256SUMS` release asset; enable immutability.
   - Keep the HF fixed-revision fallback **off by default** (`PARAKEET_HF_FALLBACK=0`) for
     release builds, or enabled only for non-release/model CI while the mirror is new.
     Rationale: default-on fallback weakens the single-source provenance story (a CI failure
     could silently distinguish which source was used unless the log/step summary is kept);
     the draft logs the fallback clearly, but owner policy should decide.
   - Treat a fallback-triggered CI run as a **warning signal** (mirror is unhealthy), not as
     a normal state.
4. **Do not adopt the replacement bytes.** `1495e91b...` (upstream archive) and
   `ed5d7456...` (HF `main`) are different model files (`1afbe69c...`, `0222a861...`,
   `cbd02f36...`) and remain explicitly out of scope. Re-pinning would require a separate
   on-device evaluation and owner sign-off.
5. **Keep `MODEL_VERSION` at `parakeet-tdt-0.6b-v3-int8-sha256-1`** for either strategy:
   the content is unchanged, so bumping it would be wrong (and would invalidate on-device
   markers unnecessarily).
6. **Second copy:** strategy 1 still has a single-owner hosting story; T5Backup is a second
   physical copy but not off-site. If the owner wants durable assurance, add one independent
   copy/mirror (GitHub release is referenced, not immutable-offsite). This is an owner/budget
   decision, not a blocker for the pin fix.

## 4. Options for the owner (decision menu)

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A (recommended)** | Immutable Daymark release asset; URL-only change; SHA256SUMS asset; HF fallback off by default | Owner-controlled, pins unchanged, simple, matches precedent, strongest provenance | Requires owner admin action + upload; GitHub remains single point of failure |
| **B** | A + HF fixed-revision fallback enabled by default | CI survives a Daymark-release outage | Restores a third-party dependency; provenance/audit complexity; needs policy sign-off |
| **C** | HF fixed-revision as the primary source now; Daymark release later | Code-only change, fastest green CI | Third-party production dependency, no durability/immutability contract; weakens "we serve our own pinned bytes" story |
| **D** | Do nothing / wait | No change | CI model job stays red (fail closed); release builds with the model cannot run; risk that someone "fixes" it by re-pinning to `1495e91b...` |

## 5. Unresolved questions (owner input needed)

1. **Release ownership:** who enables immutable releases and publishes the archive asset? Is
   a personal-account GitHub Release acceptable as the control point, or is an
   organisation/S3-with-Object-Lock style store required?
2. **Tag/name/retention:** what release tag should be used (e.g.
   `parakeet-tdt-0.6b-v3-int8-v1`), and is deleting/aging it ever permitted? (Immutable
   releases cannot reuse a tag name after deletion.)
3. **Fallback policy:** is a pinned-revision Hugging Face fallback allowed at all? If yes,
   default on or off, and for which jobs (model CI, release builds, local dev)?
4. **Durability:** is a second independent copy/mirror required beyond T5 + T5Backup (3-2-1)?
   If so, which provider and who owns it?
5. **Rate-limit/availability acceptance:** if HF is used in CI (primary or fallback), does the
   team accept a no-SLA third-party CDN and the possibility of intermittent failures?
6. **Documentation/licence:** approve updating `THIRD-PARTY-NOTICES.md` and
   `docs/release/reproducible-build-guide.md` to point at the controlled asset (attribution
   and CC BY 4.0 text unchanged)? Legal/owner sign-off?
7. **SHA256SUMS scope:** is it acceptable to publish `SHA256SUMS.parakeet` as a release
   asset (covering archive + 8 members) and to reference it from the provenance docs?
8. **Replacement archive:** confirm the quarantine/recovered replacement archive and HF
   `main` are formally **not adopted**; record the decision and whether to retain the files.
9. **CI hardening:** add the pres-4 test file/member-allow-list/identity logging now, or land
   the minimal URL change first and harden in a follow-up?
10. **Device validation:** confirm that source-of-bytes changes (archive -> mirror or
    fallback) do **not** require re-running the on-device evaluation because the bytes are
    identical; and that adopting `1495e91b...` *would* require it.

## 6. Acceptance criteria (for whoever applies this)

- `fetch-parakeet-assets.sh` fetches from an approved URL; `ARCHIVE_SHA256` and the four
  per-file constants are unchanged (byte-for-byte) and `MODEL_VERSION` is unchanged.
- CI model job green from a clean runner; step log shows the source URL, effective URL,
  archive size/digest `5793d0fd...` and, if fallback is used, the HF revision.
- `shasum -a 256 -c SHA256SUMS.parakeet` passes for the published asset + extracted tree.
- If fallback is enabled: force-fail the primary URL and confirm the fallback installs the
  same four pins and logs it; then force-fail both and confirm non-zero exit with no assets
  installed (tests already demonstrate this; evidence `29-draft-functional-tests.log`).
- No change to `MODEL_VERSION`, app code, AAR, or the pinned digests.
