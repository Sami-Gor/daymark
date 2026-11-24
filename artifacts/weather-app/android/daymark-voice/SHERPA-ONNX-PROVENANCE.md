# sherpa-onnx CVE-2026-108954 provenance

This module pins a locally rebuilt sherpa-onnx 1.13.8 Android runtime containing
the joiner-width validation for **CVE-2026-108954 / GHSA-f5q5-vp8g-wh4x**
(patch 0001) and the reviewed F1/F3 NeMo encoder-output validation (patch 0002).

**Review state:** the tracked AAR in this branch is the adopted candidate
produced by hosted workflow run 45437788615 (2026-11-24, head commit
`dedb85b`) and adopted on `security/p0-phase2-adoption` as commit candidate.
It is not independently approved, merged or released. The original
`release/v2-candidate` baseline AAR, the previous patch-0001-only AAR and the
2026-11-23 candidate are not this artifact; they remain recoverable in git
history.

## Artifact

| Field | Value |
|---|---|
| AAR | `sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar` |
| AAR SHA-256 | `8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398` |
| AAR size | 10,213,824 bytes |
| `libsherpa-onnx-jni.so` SHA-256 | `3611bbe18d282afc95bd5e4b8edf8f9f49f09d2148bf084c4878f6c390457cfb` |
| `libsherpa-onnx-jni.so` size | 5,020,016 bytes |
| `libonnxruntime.so` SHA-256 (AAR) | `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1` |
| `classes.jar` SHA-256 | `8af5aa647494ec9cb6596959d6d20864377cf4a9dedf1c1b178d936bfb7cea95` |
| ABI | `arm64-v8a` only |
| Source version | sherpa-onnx `v1.13.8`, commit `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf` |
| Patch 0001 | `android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0001-joiner-width-validation.patch` |
| Patch 0001 SHA-256 | `fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99` |
| Patch 0002 | `android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0002-nemo-encoder-output-validation.patch` |
| Patch 0002 SHA-256 | `cc75b893552d628f7209874254f5515c1a80f8edd2309e926a60158064de0c73` |
| Patch 0003 | `android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0003-nemo-decoder-boundary-tests.patch` |
| Patch 0003 SHA-256 | `22d1ea02ed05b508e4513540c5a3f9c948ba283d528f15918ce277aae733f0c6` |
| NDK / CMake / ORT | `29.0.14206865` / `3.22.1` / `1.28.2` |
| AAR Gradle / AGP | `8.6` / `8.4.0` |
| Build record | hosted workflow run `45437788615`, head `dedb85b58a27834c1fbb71a0afe82ebdcd39a4d9` |

The adopted AAR is tracked in this branch at
`artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`.
It is the artifact candidate for review; a clean checkout and CI obtain this
exact binary through Git. Run
`android/kokoro-poc/scripts/fetch-sherpa-onnx.sh` to verify it. The script
accepts `SHERPA_ONNX_PATCHED_AAR_URL` for an externally hosted reviewed
artifact and refuses to download the upstream release AAR, which is not a
substitute for the verified artifact.

The AAR members other than `jni/arm64-v8a/libsherpa-onnx-jni.so`
(`classes.jar`, `AndroidManifest.xml`, `aar-metadata.properties`, `R.txt`,
`proguard.txt` and `jni/arm64-v8a/libonnxruntime.so`) are byte-identical to the
previous adopted candidate. The adoption changes exactly one member: the
rebuilt JNI library.

## Patches

All three patches are stored under
`android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/`.

**0001 - joiner-width validation** (SHA-256
`fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99`) adds
`sherpa-onnx/csrc/joiner-output-validation.h`, validates the live joiner tensor
(float32, rank, positive dimensions, leading frame product, exact width or
token-plus-duration width, element count and int32 overflow) before any
`LogSoftmax`, `max_element`, pointer advance or token indexing, and applies the
validation to:

- `offline-transducer-greedy-search-decoder.cc` (reported generic path);
- `offline-transducer-greedy-search-nemo-decoder.cc` (NeMo RNNT and TDT);
- `offline-transducer-modified-beam-search-decoder.cc` (generic modified beam);
- `offline-transducer-modified-beam-search-nemo-decoder.cc` (NeMo modified beam);
- `offline-transducer-model.cc` and `offline-transducer-nemo-model.cc` (safe
  metadata parsing and early static-shape warnings).

**0002 - NeMo encoder-output validation** (SHA-256
`cc75b893552d628f7209874254f5515c1a80f8edd2309e926a60158064de0c73`) adds
`sherpa-onnx/csrc/nemo-encoder-output-validation.h` and its unit test. It
validates what the NeMo decoders receive from the encoder before using it in
pointer arithmetic: `encoder_out` is a float rank-3 tensor with positive
dimensions whose element count matches its shape and fits in int32; when
streams are passed the batch size equals their number; `encoder_out_length` is
an int32 or int64 tensor with exactly one value per utterance and every value
is in `[0, num_frames]`. On failure the decoders log and return empty results
(bounded by the stream/utterance count) instead of reading outside the encoder
output. The patch also replaces the previous `SHERPA_ONNX_EXIT(-1)` path for an
unsupported length dtype with a refusal, and it adds the FND-1 null-handle
guard: absent `Ort::Value` handles are refused with
`encoder output or encoder_out_length has no value; refusing to decode` before
any ONNX Runtime call is made.

**0003 - decoder-boundary tests** (SHA-256
`22d1ea02ed05b508e4513540c5a3f9c948ba283d528f15918ce277aae733f0c6`) adds the
FND-2 decoder-boundary tests for the NeMo greedy and modified-beam decoder
entry points. It is test-only: the AAR build configures
`SHERPA_ONNX_ENABLE_TESTS=OFF`, so it does not change the built library, but the
rebuild workflow applies it after 0002 and records it in the build facts and the
provenance record.

The NeMo TDT path is the one Daymark actually uses (`model_type =
"nemo_transducer"`). Upstream `v1.13.8`, `v2.0.1` and `master` still contain the
unchecked width access; these fixes are local, and the PR is unmerged.

## Build record

The adopted artifact was produced by hosted workflow
`.github/workflows/rebuild-sherpa-aar.yml`, run **45437788615** on
2026-11-24 (`workflow_dispatch`, head commit
`dedb85b58a27834c1fbb71a0afe82ebdcd39a4d9`; the two build legs ran on
ubuntu-24.04 images `20261116.376.1` and `20261116.133.1`). The workflow:

1. checked out the repository and strictly parsed `scripts/aar-pins.env`;
2. installed NDK `29.0.14206865` and CMake `3.22.1` (CMake tarball SHA-256
   `73565c72355c6652e9db149249af36bcab44d9d478c5546fd926e69ad6b43640`);
3. cloned sherpa-onnx v1.13.8 at pinned commit
   `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf` and applied the pinned
   0001 -> 0002 -> 0003 chain, verifying each patch's SHA-256 with
   `git apply --check` first;
4. fetched ONNX Runtime `1.28.2` from
   `https://github.com/csukuangfj/onnxruntime-libs/releases/download/v1.28.2/onnxruntime-android-1.28.2.zip`
   (archive SHA-256
   `01518867f78241138b6aa25925802e843a4fa9085af8d303d49e35bbb52aff4d`) and
   verified the extracted `arm64-v8a/libonnxruntime.so` against
   `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1`;
5. built `libsherpa-onnx-jni.so` twice in independent directories with
   `-ffile-prefix-map` onto `/build/sherpa-src` and
   `/opt/android-ndk/29.0.14206865`; the two builds were byte-identical;
6. verified the pinned patch diagnostics (including the FND-1 null guard) are
   present in the rebuilt library, recorded schema-2 build facts
   (`build-facts.json`) in each build artifact, and repacked the AAR
   deterministically twice;
7. packaged the AAR with Gradle 8.6 and the upstream
   `android/SherpaOnnxAar` project (Java 17, AGP 8.4.0), producing the adopted
   AAR.

The run's compare job generated the schema-2 provenance record from the two
build jobs' facts. The preserved record (phase-2 workstream, SHA-256
`b589ac0c4a85c35efcaeff85e7eb3adbb956a2b2d9d54c6c2d948e0e0a23c3f5`) was the
first schema-2 record from build facts; it still records `JOBS`/`PREFIX_MAP`
as null because those were step-level environment at the producing commit. That
residual is fixed on the adoption branch's base commit `4a788c1` and does not
affect the artifact bytes.

CMake FetchContent dependencies were pinned by the upstream build:

| Dependency | Pinned input |
|---|---|
| kaldi-native-fbank | `v1.22.3` |
| kissfft | commit `febd4caeed32e33ad8b2e0bb5ea77542c40f18ec` |
| kaldi-decoder | `v0.3.0` |
| kaldifst | `v1.8.0` |
| openfst | `v1.8.5-2026-07-09` |
| Eigen | `5.0.1` |
| simple-sentencepiece | `v0.7` |
| websocketpp | commit `b9aeec6eaf3d5610503439b4fae3581d9aff08e8` |
| asio | `asio-1-24-0` |
| nlohmann/json | `v3.12.0` |
| espeak-ng | commit `ed530aa113046142eb5115cf2fc9157854d0ffe1` |
| piper-phonemize | commit `f3ff95afc03640bc1399e113e83361192a2fafb4` |
| hclust-cpp | `2026-02-25` |

The packaged AAR contains:

- `jni/arm64-v8a/libsherpa-onnx-jni.so` (5,020,016 bytes), ELF64 AArch64,
  GNU build ID `b2d1d4a7be7831bcecc0bd2ecad737b88f9ff6c3`;
- `jni/arm64-v8a/libonnxruntime.so` (22,249,560 bytes), ELF64 AArch64;
- `classes.jar` (238,706 bytes), `AndroidManifest.xml`,
  `META-INF/com/android/build/gradle/aar-metadata.properties`, `R.txt`,
  `proguard.txt`.

## Verification

Hosted run 45437788615 (the build record):

- run1 and run2 `libsherpa-onnx-jni.so` byte-identical:
  `3611bbe18d282afc95bd5e4b8edf8f9f49f09d2148bf084c4878f6c390457cfb`; the
  two matrix legs ran on different ubuntu-24.04 image versions and still
  produced equal bytes;
- `libonnxruntime.so` matched the pin and the committed AAR copy;
- the pinned patch diagnostics are present in the rebuilt library, including
  the FND-1 null-handle guard
  `encoder output or encoder_out_length has no value; refusing to decode`,
  `Invalid NeMo decoder dimensions`, `encoder output must have rank 3` and
  `encoder_out_length must hold exactly one value per utterance`;
- deterministic repack stable; the AAR repacked from both legs equals the
  Gradle-packaged AAR above; the Gradle packaging job produced that AAR with
  `classes.jar` hash
  `8af5aa647494ec9cb6596959d6d20864377cf4a9dedf1c1b178d936bfb7cea95`.

Adoption verification (T5, 2026-11-24):

- re-measured the AAR SHA-256/size and every member hash above (the run's
  `sherpa-aar-gradle` artifact has GitHub-recorded digest
  `sha256:abc629690008ca70daa3195b34acf223562ca2b379b28caccb8a80582e828166`);
- deterministic repack of the previous committed AAR with only the new JNI and
  ORT members reproduces the adopted AAR byte for byte (exactly one changed
  member);
- verified patch 0002's and patch 0003's SHA-256;
- the committed `SHA256SUMS` manifest and the strict pin parser verified;
- the FND-1 null-guard diagnostic is present in the committed AAR's JNI;
- `fetch-sherpa-onnx.sh` accepts the provisioned AAR.

Not done in this adoption change: a fresh local Android build/APK packaging and
a physical-device compatibility matrix for the new JNI hash. Prior debug-APK
packaging and lint evidence applies to the previous artifact and must not be
used as evidence for this JNI hash. The Gradle package job was not re-run
locally (no Android SDK and no pinned Gradle 8.6 on the adoption host); the
hosted workflow run is the build record.

## Reproducibility

The build is automated from pinned inputs:

- `AAR-REBUILD.md` documents the pinned inputs, the repeatable build, the
  optional exact-artifact identity check, the provenance record and the workflow;
- `android/kokoro-poc/sherpa-onnx-cve-2026-108954/scripts/aar-pins.env` pins the
  source commit, both patches, NDK, CMake, ONNX Runtime, the expected AAR and
  library hashes and the portable canonical build paths;
- `.github/workflows/rebuild-sherpa-aar.yml` rebuilds the runtime twice from
  identical pinned inputs and verifies that the two builds are byte-identical to
  each other; the deterministic repack is checked for repeatability.

The current adopted candidate was produced with the committed portable
canonical paths, so re-running the workflow on a matching runner image is its
reproduction check; its two matrix legs were already byte-identical on
different hosted images. Because the native library embeds the mapped path
strings and the GNU build ID derives from the unstripped debug information,
byte identity across a different toolchain is not promised. Exact-artifact
identity can be checked with `REQUIRE_FULL_IDENTITY=1` (or the workflow's
identity inputs); an independent second AAR-producing hosted run was not
performed during adoption. Archive bytes additionally depend on the
Gradle/AGP/JDK packaging toolchain, which is recorded but not pinned by
archive hash.

## Important limits

- This is a reviewable local fix, not an upstream release. Do not replace it
  with the upstream 1.13.8 AAR.
- There is no independent human security approval of this PR at this commit.
- The host native malformed-model evidence was produced on 2026-11-18 and is
  preserved; the fresh native reproduction is a separate workstream and this
  adoption change does not claim a fresh native rerun.
- The adopted AAR has no physical-device compatibility matrix in this change.
- No production signing material was used or changed. The production AAR
  (`5300c913...`, 10,214,077 bytes) was not replaced outside this adoption
  branch; it remains recoverable at commit `d73624d` and in the preserved
  adoption evidence.
