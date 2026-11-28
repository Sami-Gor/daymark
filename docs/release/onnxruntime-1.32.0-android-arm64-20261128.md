# ONNX Runtime 1.32.0 Android arm64 candidate

Date: 2026-11-28. Status: **BUILD COMPLETE — VALIDATION INCOMPLETE**.

## Candidate identity

| Artifact | Size | SHA-256 |
|---|---:|---|
| `libonnxruntime.so` | 23,294,944 B | `58dbd7588b599cf5a683a1fc18095bf791c5873c001887928ed65892bf932bb5` |
| `libsherpa-onnx-jni.so` | 4,650,648 B | `2bb4bf405628858d765a2de95172503b7e72c96256d662bf37085b51cea76ed5` |
| `sherpa-onnx-1.13.8-ort-1.32.0-arm64-v8a.aar` | 10,779,595 B | `b7ba157ff51267045a48293e63ce72c04a6f00e254db9e23e6d57dd5af0d2b0e` |

GitHub Actions run: `https://github.com/Sami-Gor/daymark/actions/runs/46086720402`
Artifact: `ort-1.32.0-sherpa-android-candidate`.

## Source and toolchain

- ORT version: `1.32.0`
- Recovered source archive: `https://sourceforge.net/projects/onnx-runtime.mirror/files/v1.32.0/ONNX%20Runtime%20v1.32.0%20source%20code.tar.gz/download`
- Archive SHA-256: `c8752f1f7d79a624341826d0a23a9c06f3a7ee0201f1927023355264d04137e9`
- Expected/reported release commit: `fab30a46491a40f5e4c968b80e8a59acbbb91b53`
- Sherpa: `v1.13.8`, `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf`
- Patch: `0001-joiner-width-validation.patch`
- NDK: `29.0.14206865`; CMake `3.31.6`; Python `3.11.18`; Java `21`; Ninja `1.13.2`
- ORT build: `--config Release --android --android_abi arm64-v8a --android_api 29 --build_shared_lib --use_nnapi --no_telemetry --skip_tests --skip_submodule_sync --parallel 4`
- `--skip_submodule_sync` is required because the recovered archive has no `.git` metadata.
- `--use_nnapi` preserves the baseline AAR's `OrtSessionOptionsAppendExecutionProvider_Nnapi` symbol; it is not a new provider.

## Verification

- Telemetry marker scan: **no matches** for OneCollector, endpoint or telemetry JNI symbols.
- ELF: ELF64 AArch64, arm64-v8a only; all LOAD segments aligned `0x4000` (16 KiB).
- ORT exports `OrtGetApiBase@@VERS_1.32.0` and NNAPI; JNI imports `VERS_1.32.0` and NNAPI.
- AAR: exactly 9 entries; exactly two arm64 native libraries; no ORT Java telemetry classes/providers; manifest only Sherpa minSdk.
- Native suite: 24/24 normal **PASS**; 24/24 AddressSanitizer **PASS**, no ASan report.

## Preserved baseline

- `release/v2-candidate` AAR: `8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398`
- Live `public/pr54…` AAR: `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8`
- No pin, version, signing, tag or production AAR was changed.

## Remaining validation gates

- Physical Xiaomi install/run: **BLOCKED (device absent)**.
- Actual Parakeet TDT int8 inference on candidate: **DEFERRED (model not in CI)**.
- Canonical 200-utterance benchmark: **DEFERRED**.
- Performance comparison on physical device: **DEFERRED**.
- Network egress positive-control/candidate capture: **DEFERRED**.

These are only deferred where marked; no physical or benchmark result has been fabricated.