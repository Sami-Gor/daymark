# Strategy 2 - Fixed Hugging Face revision, per-file fetch

Status: **revision verified and all four files downloaded + hash-matched; draft patch prepared but NOT applied; no production pin/assets changed.**
Verified: 2026-11-19T21:30Z-21:50Z (UTC), Round 7, Agent C (r7-c-parakeet).
Repository / revision under test:

```
repo     csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8
revision 2bda32ec70b097a55adaa07d9a7173915b43cc78      (commit date 2025-08-16T09:29:07Z)
base     https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8
```

All downloads and scratch for this strategy live on T5:
`/Volumes/DaymarkWorkspace/Daymark/cache/round7/parakeet/hf`.

---

## 1. Does the revision exist? (yes, and it is not `main`)

- `GET /api/models/<repo>/revision/2bda32ec...` -> **HTTP 200**, JSON `sha = 2bda32ec...`,
  `lastModified = 2025-08-16T09:29:07.000Z` (evidence `17-hf-api-revision-2bda32ec.json`).
- `GET /api/models/<repo>/refs` -> only branch `main = ed5d745623472f97cfc2e6c2916ee248798fc5a8`,
  **no tags** (evidence `19-hf-api-refs.json`).
- `GET /api/models/<repo>/commits/main` -> history `ed5d7456 (2026-11-07) -> 2bda32ec (2025-08-16) -> a7c28c51 -> 876ff91b -> 5c0642ad`
  (evidence `20-hf-api-commits-main.json`). So `2bda32ec` is a real ancestor commit, not a branch tip.
- The repository-level `sha` is now `ed5d7456...` (the 2026-11-07 replacement). A branch/tag
  reference would therefore silently mean **different bytes**; only the commit SHA is a valid pin.
- HF repo tags include `license:cc-by-4.0` and `base_model:nvidia/parakeet-tdt-0.6b-v3`; the
  revision contains the 4 model files, `test_wavs/` and `.gitattributes`, no README (evidence
  `16-hf-api-model.json`, `18-hf-api-tree-2bda32ec.json`).

## 2. Download and hash verification (all four match the existing pins)

Fetch procedure actually used (resumable, T5 scratch), `-C -` + retries:

```bash
REV=2bda32ec70b097a55adaa07d9a7173915b43cc78
BASE="https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/$REV"
DEST=/Volumes/DaymarkWorkspace/Daymark/cache/round7/parakeet/hf
mkdir -p "$DEST"
for f in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
  curl -L --fail --retry 5 --retry-delay 3 --retry-all-errors -C - -o "$DEST/$f" "$BASE/$f"
done
shasum -a 256 "$DEST"/{encoder.int8.onnx,decoder.int8.onnx,joiner.int8.onnx,tokens.txt}
```

Result (evidence `22-hf-file-hashes.txt`, `23-hf-identity-comparison.txt`, fetch log `15-hf-fetch.log`):

| file | size | SHA-256 | vs pin |
|---|---|---|---|
| encoder.int8.onnx | 652,184,281 | `acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247` | **MATCH** |
| decoder.int8.onnx | 11,845,275 | `179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e` | **MATCH** |
| joiner.int8.onnx | 6,355,277 | `3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3` | **MATCH** |
| tokens.txt | 93,939 | `d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d` | **MATCH** |

Independent corroboration from the HF API tree at that revision (no download needed): the
LFS object ids for the three `.onnx` files are **exactly the same SHA-256 values**
(`179e50c4...`, `acfc2b44...`, `3164c13f...`); `tokens.txt` is a plain git blob
(`fc43e1c7...` git SHA-1) whose bytes hash to `d5854467...`. Evidence
`18-hf-api-tree-2bda32ec.json`, `23-hf-identity-comparison.txt`.

Download observations: per-file HEAD returns `x-linked-etag` = the SHA-256 pin and
`x-linked-size` = the size; GET redirects to `us.aws.cdn.hf.co` (Xet CDN); encoder
652 MB transferred in ~23 s (~27 MB/s); the whole four-file fetch took ~30 s. Public,
unauthenticated. Evidence `15-hf-fetch.log`, `21-hf-resolve-headers.txt`.

## 3. Resumability (verified, not just asserted)

A deliberately interrupted download of `decoder.int8.onnx` (killed by `--max-time 1` at
66,506 of 11,845,275 bytes) was resumed with `curl -C -`: the server answered the range
probe with `HTTP/2 206`, `accept-ranges: bytes`, `content-range: bytes 0-0/11845275`,
then `206` resumed from byte 66,506 and completed; final SHA-256 = pin. Evidence
`24-hf-resume-test.log`, script `24-hf-resume-test.sh`.

## 4. Failure behaviour (fail closed)

An implementation must fail the build, never fall back to `main`/tag/upstream, if:

- the pinned revision returns non-200/404/HTML (HF outage, repo deleted, made private);
- a file is truncated or `-C -` leaves a short file;
- any per-file SHA-256 differs (detects same-length substitution);
- the expected file set is incomplete.

The draft below enforces this: every file is downloaded to a scratch directory, checked
against the **existing** per-file pins, and only after all four pass are they copied into the
asset directory. If the pinned files cannot be obtained, the script exits non-zero and
installs nothing. It also keeps the archive path as the primary source; the HF fetch is only
a fallback.

## 5. What has to change in the repository (code change is required)

The current `android/kokoro-poc/scripts/fetch-parakeet-assets.sh` **pins an archive**, not
per-file URLs:

- `ARCHIVE_URL` (line 20) -> upstream mutable release asset;
- `ARCHIVE_SHA256` (line 21) -> archive digest;
- lines 42-65 download the archive, verify it, extract it, copy the four files and hash them.

Fetching from HF per-file therefore needs a code change. Agent C prepared, but did **not
apply**, two drafts under `drafts/`:

1. `fetch-parakeet-assets.hf-fallback.patch` (137 lines; `git apply --check` passes) and the
   full draft script `fetch-parakeet-assets.hf-fallback.sh`.
   Adds `HF_REPO` / `HF_REVISION` / `HF_BASE` (commit-addressed) and an
   `install_from_hf()` fallback used **only** if the pinned archive cannot be fetched or
   verified. All four existing per-file digest constants are unchanged; `-C -` is used per
   file; staging happens before copying; `PARAKEET_HF_FALLBACK=0` disables the fallback.
2. `fetch-parakeet-assets.controlled-source.patch` - the strategy 1 URL-only change.
   The two patches touch the same file and can be composed (strategy 1 URL + strategy 2
   fallback), but they are independent drafts.

Draft functional tests (fake repository roots on T5, never the real checkout; evidence
`29-draft-functional-tests.log`): fallback path installs the four pinned files when the
archive is unreachable; both-sources-fail exits 1 and installs nothing; archive path still
works when reachable (no fallback); `PARAKEET_HF_FALLBACK=0` forbids the fallback.

## 6. Reproducibility

- HF commit SHAs are content-addressed: `resolve/<sha>/<file>` returns the file content at
  that commit. Since the four resulting file hashes equal the committed pins, a successful
  fetch reproduces the exact build input; a mismatch fails the build.
- Reproducible only while the HF repo, the commit and its LFS objects remain reachable.
  HF has no immutability contract comparable to an immutable GitHub release: the owner can
  delete the repo or make it private, and (in principle/policy terms) LFS storage could be
  removed. There is no Daymark control and no SLA. The 2026-11-07 `main` move proves a
  branch reference is unsafe; it does not prove the commit-addressed bytes are permanent.
- No authentication/rate-limit budget is required for four files, but CI egress is ~670 MB
  per run from a third-party CDN; intermittent WAF/challenge responses were observed during
  a burst of API probes (retries with backoff succeeded). That is not a stable CI dependency
  on its own.

## 7. Network dependency and privacy

- Build-time only: the app still never downloads the model or runtime; no runtime network
  change, no new permissions, no privacy-surface change.
- New hosts contacted by the build: `huggingface.co` and its CDN (`us.aws.cdn.hf.co`).
  The current path contacts `github.com`/`objects.githubusercontent.com` only.
- If used as the sole CI source, a Hugging Face outage/rate-limit/repo-visibility change
  fails the model job (fail closed). If used as a fallback, an HF outage only matters when
  the primary is also unavailable.

## 8. Maintenance / rollback

- Maintenance: pinned revision means upstream `main` movement (including the 2026-11-07
  replacement) has no effect. Refreshing to a different model is a deliberate code change
  of the per-file pins + revision together (and should trigger on-device re-evaluation).
- Rollback: remove/disable the fallback (or revert the patch); the primary archive path and
  pins are untouched by this draft. Because the per-file pins are shared with the archive
  path, a fallback-fetched model and an archive-fetched model are identical bytes by
  construction - no `MODEL_VERSION` bump is warranted for switching source.
- Operational risk: a pinned commit eventually becomes old/unmaintained; HF could change
  API/UX (Xet/CDN) but `resolve` URLs are a documented stable interface. If the repo is
  deleted, recovery is from the Daymark archive (strategy 1) or T5 - i.e. HF is not a
  disaster-recovery home by itself.

## 9. Explicit non-goal: do not adopt `ed5d7456` / `1495e91b...`

The current `main` (`ed5d7456...`, 2026-11-07) and the replacement upstream archive
(`1495e91b...`) carry **different** model bytes (encoder `1afbe69c...`, decoder
`0222a861...`, joiner `cbd02f36...`; tokens unchanged). These are not adopted here: they are
unvalidated on device, and the brief explicitly excludes them. Per-file verification against
the existing pins would reject them anyway.

## 10. Verdict for this strategy

The revision exists, the four files are fetchable resumably, and they are **bit-identical**
to the existing pins - so HF is a sound **recovery/verification source** and a workable
transitional build source. It is not a substitute for owner-controlled hosting: it remains a
third-party, mutable-at-the-repository-level dependency with no immutability or availability
guarantee for Daymark. See `03-comparison-and-recommendation.md`.
