# sherpa-onnx CVE-2026-108954 provenance

This module pins a locally rebuilt sherpa-onnx 1.13.8 Android runtime containing
the joiner-width validation for **CVE-2026-108954 / GHSA-f5q5-vp8g-wh4x**
(patch 0001) and the reviewed F1/F3 NeMo encoder-output validation (patch 0002).

**Review state:** the tracked AAR in this branch is the adopted candidate
produced by hosted workflow run 45285600587 (2026-11-23, head commit
`d749732`) and adopted on `security/f1-f5-aar-adoption` as commit candidate.
It is not independently approved, merged or released. The original
`release/v2-candidate` baseline AAR and the previous patch-0001-only AAR are
not this artifact; the previous artifact remains recoverable in git history.

## Artifact

| Field | Value |
|---|---|
| AAR | `sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar` |
| AAR SHA-256 | `829a0f4e239c32671bdc1b01aa7c0fdc5a44628a5284e76e4837589db85a4e8c` |
| AAR size | 10,213,770 bytes |
| `libsherpa-onnx-jni.so` SHA-256 | `21586f09a4a0ff42eef9a723953cac44667fdef7f7f00a6324985cafa2e89aa9` |
| `libsherpa-onnx-jni.so` size | 5,019,776 bytes |
| `libonnxruntime.so` SHA-256 (AAR) | `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1` |
| `classes.jar` SHA-256 | `8af5aa647494ec9cb6596959d6d20864377cf4a9dedf1c1b178d936bfb7cea95` |
| ABI | `arm64-v8a` only |
| Source version | sherpa-onnx `v1.13.8`, commit `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf` |
| Patch 0001 | `android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0001-joiner-width-validation.patch` |
| Patch 0001 SHA-256 | `fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99` |
| Patch 0002 | `android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0002-nemo-encoder-output-validation.patch` |
| Patch 0002 SHA-256 | `03f4e3d96e591ad6ca6ec4dcbb54d9c8f5ad5233a19e49f73cea47b6c4f7109f` |
| NDK / CMake / ORT | `29.0.14206865` / `3.22.1` / `1.28.2` |
| AAR Gradle / AGP | `8.6` / `8.4.0` |
| Build record | hosted workflow run `45285600587`, head `d749732a1c4dc0f9923da5e6a05c7dda33dc9a61` |

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
previous tracked AAR. The adoption changes exactly one member: the rebuilt JNI
library.

## Patches

Both patches are stored under
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
`03f4e3d96e591ad6ca6ec4dcbb54d9c8f5ad5233a19e49f73cea47b6c4f7109f`) adds
`sherpa-onnx/csrc/nemo-encoder-output-validation.h` and its unit test. It
validates what the NeMo decoders receive from the encoder before using it in
pointer arithmetic: `encoder_out` is a float rank-3 tensor with positive
dimensions whose element count matches its shape and fits in int32; when
streams are passed the batch size equals their number; `encoder_out_length` is
an int32 or int64 tensor with exactly one value per utterance and every value
is in `[0, num_frames]`. On failure the decoders log and return empty results
(bounded by the stream/utterance count) instead of reading outside the encoder
output. The patch also replaces the previous `SHERPA_ONNX_EXIT(-1)` path for an
unsupported length dtype with a refusal.

The NeMo TDT path is the one Daymark actually uses (`model_type =
"nemo_transducer"`). Upstream `v1.13.8`, `v2.0.1` and `master` still contain the
unchecked width access; these fixes are local, and the PR is unmerged.

## Build record

The adopted artifact was produced by hosted workflow
`.github/workflows/rebuild-sherpa-aar.yml`, run **45285600587** on
2026-11-23T23:04Z (`workflow_dispatch`, head commit
`d749732a1c4dc0f9923da5e6a05c7dda33dc9a61`, ubuntu-24.04 image
20261116.133.1). The workflow:

1. checked out the repository and strictly parsed `scripts/aar-pins.env`;
2. installed NDK `29.0.14206865` and CMake `3.22.1` (CMake tarball SHA-256
   `73565c72355c6652e9db149249af36bcab44d9d478c5546fd926e69ad6b43640`);
3. cloned sherpa-onnx v1.13.8 at pinned commit
   `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf` and applied patch 0001, then
   patch 0002, verifying each patch's SHA-256 with `git apply --check` first;
4. fetched ONNX Runtime `1.28.2` from
   `https://github.com/csukuangfj/onnxruntime-libs/releases/download/v1.28.2/onnxruntime-android-1.28.2.zip`
   (archive SHA-256
   `01518867f78241138b6aa25925802e843a4fa9085af8d303d49e35bbb52aff4d`) and
   verified the extracted `arm64-v8a/libonnxruntime.so` against
   `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1`;
5. built `libsherpa-onnx-jni.so` twice in independent directories with
   `-ffile-prefix-map` onto `/build/sherpa-src` and
   `/opt/android-ndk/29.0.14206865`; the two builds were byte-identical;
6. verified both patch diagnostics are present in the rebuilt library and
   repacked the AAR deterministically twice;
7. packaged the AAR with Gradle 8.6 and the upstream
   `android/SherpaOnnxAar` project (Java 17, AGP 8.4.0), producing the adopted
   AAR.

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

- `jni/arm64-v8a/libsherpa-onnx-jni.so` (5,019,776 bytes), ELF64 AArch64,
  GNU build ID `f27ba96211371a32cad9d95c29b7753932c0ce0e`;
- `jni/arm64-v8a/libonnxruntime.so` (22,249,560 bytes), ELF64 AArch64;
- `classes.jar` (238,706 bytes), `AndroidManifest.xml`,
  `META-INF/com/android/build/gradle/aar-metadata.properties`, `R.txt`,
  `proguard.txt`.

## Verification

Hosted run 45285600587 (the build record):

- run1 and run2 `libsherpa-onnx-jni.so` byte-identical:
  `21586f09a4a0ff42eef9a723953cac44667fdef7f7f00a6324985cafa2e89aa9`;
- `libonnxruntime.so` matched the pin and the committed AAR copy;
- both patch diagnostics present in the rebuilt library (including
  `Invalid NeMo decoder dimensions`, `encoder output must have rank 3`,
  `encoder_out_length must hold exactly one value per utterance`);
- deterministic repack stable; Gradle packaging job succeeded and produced the
  AAR above with `classes.jar` hash
  `8af5aa647494ec9cb6596959d6d20864377cf4a9dedf1c1b178d936bfb7cea95`.

Adoption verification (T5, 2026-11-23):

- downloaded the run's `sherpa-aar-gradle` artifact (SHA-256
  `6dd824ecd1ed188d0b521727b79025b62a2e0f418dab741329ab96181c88cd06`) and
  verified the AAR SHA-256/size and every member hash above;
- verified patch 0002's SHA-256;
- deterministic repack of the previous AAR with only the adopted JNI and ORT
  members reproduces the adopted AAR byte for byte;
- the committed `SHA256SUMS` manifest and the strict pin parser verified;
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

The adopted candidate was produced with the committed portable canonical paths,
so re-running the workflow on the same runner image is its reproduction check.
Because the native library embeds the mapped path strings and the GNU build ID
derives from the unstripped debug information, byte identity across a different
toolchain is not promised. Exact-artifact identity can be checked with
`REQUIRE_FULL_IDENTITY=1` (or the workflow's identity inputs); an independent
second AAR-producing hosted run was not performed during adoption. Archive
bytes additionally depend on the Gradle/AGP/JDK packaging toolchain, which is
recorded but not pinned by archive hash.

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
