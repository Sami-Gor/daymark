# sherpa-onnx CVE-2026-108954 provenance

This module pins a locally rebuilt sherpa-onnx 1.13.8 Android runtime containing
the joiner-width validation for **CVE-2026-108954 / GHSA-f5q5-vp8g-wh4x**.

**Review state:** the tracked AAR in this branch was rebuilt from the current
PR #54 source in a disposable checkout. It is not independently approved,
merged or released; this commit is the artifact candidate for review. The
original `release/v2-candidate` baseline AAR is not this artifact.

## Artifact

| Field | Value |
|---|---|
| AAR | `sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar` |
| AAR SHA-256 | `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8` |
| `libsherpa-onnx-jni.so` SHA-256 | `9a730e8e70f40e6b3662a1481d5b166cc9db16f717e8a3e74e3a12a8ff525485` |
| `libonnxruntime.so` SHA-256 (AAR) | `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1` |
| `libonnxruntime.so` SHA-256 (APK after AGP strip) | `7a2fb92eb67037837c3f0e428bd732fd0d05ced0546d9e740090c07573d8249a` |
| ABI | `arm64-v8a` only |
| Source version | sherpa-onnx `v1.13.8`, commit `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf` |
| Patch | `android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0001-joiner-width-validation.patch` |
| Patch SHA-256 | `fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99` |
| NDK / CMake / ORT | `29.0.14206865` / `3.22.1` / `1.28.2` |
| AAR Gradle / AGP | `8.6` / `8.4.0` |
| AAR size | 10,214,077 bytes |

The rebuilt AAR is tracked in this branch at
`artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`.
It is the artifact candidate for review; a clean checkout and CI obtain this
exact binary through Git. Run
`android/kokoro-poc/scripts/fetch-sherpa-onnx.sh` to verify it. The script
accepts `SHERPA_ONNX_PATCHED_AAR_URL` for an externally hosted reviewed
artifact and refuses to download the upstream unpatched AAR.

## Patch

The source patch is stored at
`android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0001-joiner-width-validation.patch`
and has SHA-256
`fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99`.

It adds `sherpa-onnx/csrc/joiner-output-validation.h`, validates the live
joiner tensor (float32, rank, positive dimensions, leading frame product,
exact width or token-plus-duration width, element count and int32 overflow)
before any `LogSoftmax`, `max_element`, pointer advance or token indexing, and
applies the validation to:

- `offline-transducer-greedy-search-decoder.cc` (reported generic path);
- `offline-transducer-greedy-search-nemo-decoder.cc` (NeMo RNNT and TDT);
- `offline-transducer-modified-beam-search-decoder.cc` (generic modified beam);
- `offline-transducer-modified-beam-search-nemo-decoder.cc` (NeMo modified beam);
- `offline-transducer-model.cc` and `offline-transducer-nemo-model.cc` (safe
  metadata parsing and early static-shape warnings).

The NeMo TDT path is the one Daymark actually uses (`model_type =
"nemo_transducer"`). Upstream `v1.13.8`, `v2.0.1` and `master` still contain the
unchecked width access; this fix is local, and PR #54 is unmerged.

## Reproducible build record

Clean upstream source was cloned at the pinned commit, and the tracked patch
was checked with `git apply --check` before applying. The Android build used the
documented `build-android-arm64-v8a.sh` script with:

```bash
export ANDROID_NDK=/Users/m1/.bubblewrap/android_sdk/ndk/29.0.14206865
export SHERPA_ONNX_ONNXRUNTIME_VERSION=1.28.2
export BUILD_SHARED_LIBS=ON
export PATH=/Users/m1/.bubblewrap/android_sdk/cmake/3.22.1/bin:$PATH
bash ./build-android-arm64-v8a.sh
```

ONNX Runtime was downloaded from:

- URL: `https://github.com/csukuangfj/onnxruntime-libs/releases/download/v1.28.2/onnxruntime-android-1.28.2.zip`
- Archive SHA-256:
  `01518867f78241138b6aa25925802e843a4fa9085af8d303d49e35bbb52aff4d`
- Extracted `arm64-v8a/libonnxruntime.so` SHA-256:
  `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1`

The archive was fetched with `curl` because `wget` is not installed in this
environment; the archive's extracted library matches the previously recorded
tracked-AAR library hash.

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

These FetchContent inputs are pinned by tag or commit, but this run did not
capture independent published archive checksums for them. The ONNX Runtime
package is the critical native runtime and its extracted library was
cross-checked against the prior artifact hash.

The AAR was packaged with the upstream `android/SherpaOnnxAar` project:

```bash
cp build-android-arm64-v8a/install/lib/libsherpa-onnx-jni.so \
   build-android-arm64-v8a/install/lib/libonnxruntime.so \
   android/SherpaOnnxAar/sherpa_onnx/src/main/jniLibs/arm64-v8a/
cd android/SherpaOnnxAar
ANDROID_HOME=/Users/m1/.bubblewrap/android_sdk \
  ./gradlew --no-daemon :sherpa_onnx:assembleRelease
```

The resulting AAR contains only:

- `jni/arm64-v8a/libsherpa-onnx-jni.so` (5,035,144 bytes)
- `jni/arm64-v8a/libonnxruntime.so` (22,249,560 bytes)

plus normal AAR metadata. Both files are ELF64 AArch64 shared objects with the
expected SONAMEs; the JNI library depends on `libandroid.so`, `liblog.so`,
`libonnxruntime.so`, `libm.so`, `libdl.so` and `libc.so`.

## Verification

- Native suite: **24/24 passed** in the normal build and **24/24 passed** in the
  AddressSanitizer build. This was a fresh run on 2026-10-30 using
  `tests/run-native-tests.sh` against a separate clean v1.13.8 checkout with
  the tracked patch.
- Guard-removal negative test: removing the width-range guard from a disposable
  copy caused the normal regression binary to fail and abort (`exit 138`);
  malformed-model rejection tests failed, demonstrating that the guard is
  security-relevant rather than dead code.
- Patch diagnostics are present in the packaged JNI, including
  `Invalid modified-beam decoder metadata`, `joiner output width is outside the
  expected range`, `TDT joiner output width ... does not contain any duration
  logits`, and `joiner output width exceeds int32`.
- `fetch-sherpa-onnx.sh` accepted the provisioned AAR, and every entry in
  `SHA256SUMS` verified.
- The disposable Daymark checkout built successfully with
  `cd artifacts/weather-app/android && ./gradlew :app:assembleDebug` after
  `pnpm run sync:android-web`; the web-asset verifier and Parakeet integrity
  task both passed. `:daymark-voice:lintDebug` was rerun for this rebuild and
  completed with **0 errors / 4 warnings** (the expected arm64-only ChromeOS
  ABI warning plus three obsolete SDK checks).
- Existing CVE/QA documentation records a pre-existing `MissingPermission`
  finding at `AudioSpeechCaptureDevice.java:50`. The CVE patch does not
  introduce or suppress that finding, and this rebuild does not change the
  related lint configuration or audio source. It remains a separate
  pre-existing Android lint issue.
- The debug APK (`app-debug.apk` SHA-256
  `6d2b395b9a3562cdb00b366fe104df42c312fd75bf0e5558a88bbb9737835c58`)
  contains only `lib/arm64-v8a/libsherpa-onnx-jni.so` and
  `lib/arm64-v8a/libonnxruntime.so`. The packaged JNI is byte-identical to the
  AAR. AGP strips the ONNX Runtime library during packaging: applying the same
  NDK 29 `llvm-strip --strip-unneeded` to the AAR copy produces exactly the
  packaged hash `7a2fb92e...`, so the 8-byte difference is explained by
  symbol removal, not a substituted library.

## Reproducibility limits

Only one full native build was completed because the workspace had about
1.2 GiB free at the end of validation. A second full build was not practical
without deleting preserved build evidence. No byte-for-byte reproducibility is
claimed. The C++ build embeds source-path strings, so a build from a different
checkout path can be functionally equivalent but not byte-identical. The AAR
also depends on Gradle/AGP packaging and the resolved Android dependencies; no
Gradle dependency-lock checksum verification was performed.

## Important limits

- This is a reviewable local fix, not an upstream release. Do not replace it
  with the upstream 1.13.8 AAR.
- There is no independent human security approval of PR #54 at this commit.
- The debug APK is debug-signed and is not a production release or physical-
  device QA result. No production signing material was used or changed.
- The malformed-model tests ran on the host native build (normal and ASan); no
  physical-device malformed-model harness was available.
- The Parakeet model staged for the app build came from a local disposable
  prior work area and matched the build's pinned SHA-256 values; it is not part
  of this AAR and is not committed by this work.
