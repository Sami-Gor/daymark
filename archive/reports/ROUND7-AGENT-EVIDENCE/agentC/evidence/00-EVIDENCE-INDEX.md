# Evidence index - Round 7 Agent C (Parakeet pin strategies)

All files are in this directory. Times UTC. Commands are on macOS (APFS/exFAT), bash 3.2,
`shasum` = SHA-256. Nothing here modifies the repository, production pins or assets.

## Strategy 1 - immutable mirror (preserved archive)

| File | Contents |
|---|---|
| `01-archive-stat.txt` | stat of the preserved archive (size 487,170,055; mtime/birth/ctime; mode; xattr; bzip2 magic) |
| `02-archive-sha256.txt` | recomputed archive SHA-256 = `5793d0fd...b16bf` (matches pin) |
| `03-archive-members.txt` | `tar -tvjf` member metadata; 10 members (2 dirs + 8 files) |
| `04-member-hashes.txt` | per-member SHA-256 and sizes (4 model files + 4 test wavs) |
| `05-mirror-verification-run.log` | full run of `drafts/verify-parakeet-mirror.sh` (size, digest, closed allow-list, extraction, 8 hashes) |
| `06-extracted-tree.txt` | extracted tree metadata (sizes/modes/mtimes) |
| `07-provenance-chain.txt` | excerpts: pres-1-copy report, migration log lines 48-49, quarantine `ARCHIVE-PROVENANCE.json` |
| `08-t5backup-crosscheck.txt` | independent volume cross-check: T5Backup archive hash + `cmp` IDENTICAL + extracted dir hashes |
| `09-upstream-state.txt` | live upstream: asset 719769366 size 487,211,443 digest `1495e91b...`, release immutable:false, HEAD last-modified 2026-11-07 |
| `10-replacement-archive.txt` | replacement archive hash/size (`1495e91b...`) - NOT the pin |
| `11-pin-locations.txt` | every tracked location of the archive/per-file digests + `MODEL_VERSION` in r7/pin @ 9002641 |
| `12-ci-wiring.txt` | CI fetch/verify steps and classifier rules |
| `13-hosting-state.txt` | Daymark repo state, v2.0.0 release assets, immutable-releases setting (authenticated read) |
| `14-licence.txt` | CC BY 4.0 evidence (notices + NVIDIA model card / HF tags) |
| `28-release-v2.0.0-SHA256SUMS.txt` | the existing release SHA256SUMS asset (2,054 B; 22 lines, includes only a parakeet-integrity build-log line, zero Parakeet archive/model digest lines) |
| `31-archive-copies.txt` | known copies: one pinned archive on DaymarkWorkspace + T5Backup copy; replacement copies listed |

## Strategy 2 - fixed Hugging Face revision

| File | Contents |
|---|---|
| `15-hf-fetch.log` | full resumable fetch log of the four files from revision `2bda32ec...` (HEAD headers, HTTP 200, hashes, timings) |
| `16-hf-api-model.json` | HF model info (repo head now `ed5d7456`; tags incl. `license:cc-by-4.0`) |
| `17-hf-api-revision-2bda32ec.json` | revision endpoint HTTP 200 for `2bda32ec...` |
| `18-hf-api-tree-2bda32ec.json` | tree at the pinned revision (sizes, git oids, LFS oids = pins) |
| `19-hf-api-refs.json` | refs: only `main = ed5d7456`; no tags |
| `20-hf-api-commits-main.json` | commit history proving `2bda32ec` is an ancestor and `main` moved 2026-11-07 |
| `21-hf-resolve-headers.txt` | resolve headers at pinned revision vs mutable `main` (x-linked-etag/size) |
| `22-hf-file-hashes.txt` | SHA-256/size of the four downloaded files (T5 scratch) |
| `23-hf-identity-comparison.txt` | expected pin vs fetched hash table (all MATCH) + LFS oid table |
| `24-hf-resume-test.log` / `.sh` | interrupted-download + `-C -` resume test (HTTP 206, final hash matches) |

## Current-state / fail-closed evidence

| File | Contents |
|---|---|
| `25-current-fetch-failclosed-internal-temp.log` | unmodified production script against live upstream: checksum mismatch, exit 1 (first run; see caveats in README) |
| `26-current-fetch-failclosed-T5TEMP.log` | same test with temp location pinned to T5: checksum mismatch, exit 1 |
| `27-fetch-parakeet-assets-t5-temp.sh` | test-only copy of the script with the temp location changed to T5 |

## Draft tests and delivered files

| File | Contents |
|---|---|
| `29-draft-functional-tests.log` | fallback draft functional tests: fallback works (exit 0), both-fail closes (exit 1, nothing installed), archive path works (exit 0), fallback-disabled closes (exit 1) |
| `30-draft-files.txt` | SHA-256 of every draft (evidence + r7/pin copies, verified identical) and r7/pin git state |
| `00-EVIDENCE-INDEX.md` | this index |
| `34-strategy1-draft-functional-tests.log` | strategy-1 draft functional tests: mirror URL via `PARAKEET_ARCHIVE_URL` installs + hashes match (exit 0); wrong/unreachable URL fails closed with no assets (exit 22/7); unpublished placeholder URL fails closed (exit 56); all five pinned digests byte-identical after patch |
| `33-commands-run.txt` | the key commands and where their output lives |
| `32-summary.json` | machine-readable summary (identities, hashes, verdicts) |
| `collect-*.sh`, `make-*.sh`, `reorganize.sh`, `test-fallback-draft.sh` (in T5 scratch) | the scripts that produced the above |

Note: `collect-evidence.sh` / `collect-hf-evidence.sh` / `make-hf-identity.sh` are the
originally-run collectors; `collect-hf-api.sh` contains the backoff logic needed after the
HF API temporarily returned WAF challenge pages during a burst of requests.
