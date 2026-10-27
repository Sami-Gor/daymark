# sherpa-onnx CVE-2026-108954 provenance

This module pins a locally rebuilt sherpa-onnx 1.13.8 Android runtime containing
the joiner-width validation for **CVE-2026-108954 / GHSA-f5q5-vp8g-wh4x**.

## Artifact

| Field | Value |
|---|---|
| AAR | `sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar` |
| AAR SHA-256 | `d55696ad36cdb507970a4ef888657bac10cf21f3c800f0589d07cdc44083a0ef` |
| `libsherpa-onnx-jni.so` SHA-256 | `b055bf989c712ea957e79e47e8dc5f88c0d9142b4e8f745ba99ce2c9258ac714` |
| `libonnxruntime.so` SHA-256 | `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1` |
| ABI | `arm64-v8a` only |
| Source version | sherpa-onnx `v1.13.8`, commit `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf` |
| NDK / CMake / ORT | 29.0.14206865 / 3.22.1 / 1.28.2 |

The AAR is committed in this branch at
`artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`
(force-added because `*.aar` is normally ignored) so a clean checkout and CI
obtain the exact reviewed binary. Run
`android/kokoro-poc/scripts/fetch-sherpa-onnx.sh` to verify it. The script
accepts `SHERPA_ONNX_PATCHED_AAR_URL` for an externally hosted reviewed
artifact and refuses to download the upstream unpatched AAR.

## Patch

The source patch is stored with the security evidence under
`/Volumes/MacDev/daymark-security/CVE-2026-108954/01-patch/`:

- `modified-files.patch` SHA-256
  `9ad0befa25f64f27c2969bb14d633baec76bee199d521a668d05a99b7ad0340d`
- `new-files-and-fixtures.tar.gz` SHA-256
  `fb8b24e13c1d9d7e7414a619b7398c46f3b3e23550a8761ecc24b2c5688b2930`

It adds `sherpa-onnx/csrc/joiner-output-validation.h`, validates the real joiner
tensor (float, rank, leading frame product, exact width, element count, int32
overflow) before any `LogSoftmax`, `max_element` or pointer advance, and applies
it to:

- `offline-transducer-greedy-search-decoder.cc` (reported generic decoder);
- `offline-transducer-greedy-search-nemo-decoder.cc` (NeMo RNNT and TDT paths);
- `offline-transducer-model.cc` / `offline-transducer-nemo-model.cc` (safe
  metadata parsing and early static-shape warnings).

The NeMo TDT path is the one Daymark actually uses (`model_type =
"nemo_transducer"`). Upstream `v1.13.8`, `v2.0.1` and `master` still contain the
unchecked width access; the fix is local and is **not** pushed or merged.

## Verification

- Native suite: **13/13 passed**, both normal and AddressSanitizer builds.
  Includes valid generic/TDT models, joiner wider/narrower than metadata,
  TDT without duration logits, zero/negative/overflow metadata, rank failures
  and element-count mismatch.
- Real Parakeet TDT smoke: host `sherpa-onnx-offline` loaded the shipped
  int8 model pack and completed a 1 s silence WAV (exit 0, empty transcript).
- QA APK: `io.github.sami_gor.daymark.v2phoneqa`, versionCode 2, debug-signed,
  SHA-256 `00510595dac51aae4a76e5cf8c80b2ae07f4a837779686d627417b89b0c97657`.
  It contains the new JNI hash above; the prior `9225a613…` JNI is absent.
  Parakeet and Kokoro asset hashes match the prior QA APK.

## Important limits

- This is a reviewable local fix, not an upstream release. Do not replace it
  with the upstream 1.13.8 AAR.
- The QA APK was built with the debug key; no production signing material was
  used or changed.
- The malformed-model tests ran on the host native build (normal and ASan);
  no physical-device malformed-model harness was available.
