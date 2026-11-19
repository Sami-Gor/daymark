# Drafts - Round 7 Agent C (NOT applied, NOT production)

These files are **evidence drafts** produced by Agent C under the Round 7 pin brief.
None of them is applied to the repository or to the production pin. They are also copied,
byte-identically, under:

```
android/kokoro-poc/scripts/drafts-agent-c/     (in the r7-pin worktree, untracked)
```

and the SHA-256 of every file is recorded in
`../evidence/30-draft-files.txt`. The production files
(`fetch-parakeet-assets.sh`, `build.gradle`, `ParakeetModelAssets.java`, notices, guide)
were **not modified**; `git diff` in `r7/pin` is empty and the only untracked path is the
drafts directory.

| File | What it is | Status |
|---|---|---|
| `fetch-parakeet-assets.controlled-source.patch` | Strategy 1: minimal patch replacing the mutable upstream archive URL with a placeholder for a Daymark-controlled, immutable release asset. Keeps `ARCHIVE_SHA256` and all four per-file pins byte-for-byte; upstream URL becomes provenance only; adds `PARAKEET_ARCHIVE_URL` approved-mirror override. | `git apply --check` passes against `r7/pin` @ 9002641; **not applied** |
| `fetch-parakeet-assets.hf-fallback.patch` | Strategy 2: patch adding a **fixed-commit** Hugging Face per-file fallback (`2bda32ec70b097a55adaa07d9a7173915b43cc78`) used only when the pinned archive cannot be fetched or verified. Every fallback file must match the existing per-file pins; `-C -` resumable; staged before install; `PARAKEET_HF_FALLBACK=0` disables it. | `git apply --check` passes; **not applied** |
| `fetch-parakeet-assets.hf-fallback.sh` | Full draft script corresponding to the fallback patch (review reference). | **not applied** |
| `SHA256SUMS.parakeet` | Manifest covering the archive + 4 model files + 4 test wavs, for publication next to the Daymark release asset. Verified: `shasum -a 256 -c` all 9 lines OK. | draft asset; **not published** |
| `verify-parakeet-mirror.sh` | Independently verifies the preserved archive: size/SHA-256, 10-member closed allow-list, extraction, 8 per-file hashes. Exits non-zero on any mismatch. | verification tool; safe read-only |
| `fetch-hf-pinned-revision.sh` | The exact resumable fetch used to download and hash the four HF files (T5 scratch output; no repository writes). | evidence/tooling; safe read-only |

## Functional test results for the fallback draft

Fake repository roots on T5 (never the real checkout), evidence
`../evidence/29-draft-functional-tests.log`:

1. archive unreachable -> fallback downloads the four pinned files, hashes match, exit 0;
2. archive unreachable + HF unreachable -> exit 1, **no assets installed** (fail closed);
3. archive reachable (local HTTP mirror of the preserved archive) -> archive path used,
   no fallback warning, hashes match, exit 0;
4. archive unreachable + `PARAKEET_HF_FALLBACK=0` -> exit 1, no fallback attempted.

## How to apply (owner/dev, after approval)

```bash
cd <repo-root>
git apply --check android/kokoro-poc/scripts/drafts-agent-c/fetch-parakeet-assets.controlled-source.patch
git apply         android/kokoro-poc/scripts/drafts-agent-c/fetch-parakeet-assets.controlled-source.patch
# then replace the placeholder release URL with the owner-published tag and update docs;
# keep every digest and MODEL_VERSION unchanged
```

Do **not** combine the two patches blindly: both rewrite the same header and function
region. The recommended order is strategy 1 first; the HF fallback (if approved) is a
follow-up change.
