# ONNX Runtime 1.32.0 Android arm64 build — BLOCKED evidence

Execution date: 2026-11-27 (Europe/London). State: **BUILD BLOCKED**. No candidate was built.

## Baseline preserved

- Repository worktree: `/Volumes/DaymarkRuntimeBuild/ort-1.32-daymark`
- Branch: `feature/onnxruntime-1.32.0-sherpa-android`
- Base: `8a28892fec6903b765882a8ee5bf470ce6f0200b` (tree `4dac94dd736b782608876374ed77cd1be78b7319`)
- Release-candidate AAR in this worktree: `artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`
- AAR SHA-256: `8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398` (10,213,824 B)
- ORT member `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1`; JNI member `3611bbe1…` per prior audit. This AAR is the baseline at commit `8a28892…`.
- **Divergence:** the separate live `public/pr54…` checkout contains a newer AAR `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8` (10,214,077 B) with JNI `9a730e8e…`. No pin was changed; the owner must resolve which AAR is production before any later integration.
- Baseline ELF: ELF64 AArch64 DYN, arm64-v8a only, LOAD `p_align=0x4000`, `VERS_1.28.2`; zero OneCollector/endpoint/Java telemetry markers; classes.jar has no `ai/onnxruntime` entries.

## Blocking facts

1. **Canonical source unavailable.** `https://github.com/microsoft/onnxruntime` and its REST API return 404; tags and release pages are unavailable. Independent search reports the repository disappeared on 2026-11-17. No official v1.32.0 tag/tarball can be cloned. No local ORT source exists.
2. **Exact 1.32.0 commit is only available through downstream forks.** `fab30a46491a40f5e4c968b80e8a59acbbb91b53` is reported by package metadata/forks, with `VERSION_NUMBER=1.32.0`; this is hash-observed fork content, not a verified canonical Microsoft tag. It was not used for a build.
3. **Published 1.32.0 AAR is telemetry-enabled.** Maven Central `onnxruntime-android-1.32.0.aar` SHA-256 `8e8dbb412ed4939675a157702f0c1e3621b436a645af7f7244536ac20bfad628`, 59,335,382 B; arm64 `.so` SHA-256 `cdb41e8b7d0e3cb5e000c705e9904979c3b11de6e4614d2e4398e04ae8dcb1bb`, 36,307,784 B, `VERS_1.32.0`.
   - 8 `Java_ai_onnxruntime_telemetry_*` exports.
   - `OneCollector` 2, `mobile.events.data.microsoft.com` 2, `ORT_DISABLE_TELEMETRY` 1, tenant token present.
   - classes.jar has TelemetryInitializer + 12 `ai.onnxruntime.telemetry.*` classes + `META-INF/LICENSE-1DS`.
   - manifest adds `ACCESS_NETWORK_STATE` and telemetry ContentProvider.
4. **Sherpa JNI ABI mismatch.** The baseline JNI imports `OrtGetApiBase@VERS_1.28.2`; 1.32 exports `VERS_1.32.0`. A drop-in `.so` swap cannot be used without relinking sherpa JNI. No 1.32 headers were available to test compilation.
5. **Capacity/toolchain gate.** `/Volumes/DaymarkRuntimeBuild` 3.4 GiB free; local data 6.3 GiB; `/Volumes/T5Backup` 3.4 GiB. `ninja` is absent; Android SDK has only platforms 34/36 (API 29 missing). Python 3.9.6; CMake 4.4.5; NDK 29.0.14206865.
6. **Physical device absent.** No Xiaomi ADB serial was present. Only emulator-5556 (API 35) was visible. No physical or network-capture evidence exists.

## Audits returned

- A (`onnx-source`): canonical repo 404; release artifacts survive as PyPI/NuGet/Maven binaries; --no_telemetry exists; ORT_API_VERSION=32; source build not feasible.
- B (`sherpa-compat`): Sherpa v1.13.8 `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf`; patch SHA `fd58558b…`; real env vars are `SHERPA_ONNXRUNTIME_LIB_DIR`/`_INCLUDE_DIR` (not `SHERPA_ONNXRUNTIME_ROOT`); 1.31 source build was proven, 1.32 compile BLOCKED.
- C (`privacy-redteam`): published 1.32 AAR telemetry-enabled; no source-built --no_telemetry candidate; device egress BLOCKED; baseline clean.
- D (`benchmark-engineer`): 24/24 host native tests pass under 1.28.2 and 1.31.0; Parakeet 1.28/1.31 outputs mostly identical; physical/1.32/200-utterance BLOCKED; 1.32 official AAR not usable.
- E (`artifact-auditor`): baseline preserved; 9-entry AAR; arm64-only, 16 KiB aligned; old/new pins must move together if a candidate is ever accepted; no candidate.

## Gate table

| Gate | Result |
|---|---|
| Official v1.32.0 source/tag | **BLOCKED** — canonical repo 404 |
| Reproducible ORT source build | **BLOCKED** |
| Telemetry disabled at build time | **BLOCKED** — no candidate |
| Binary telemetry inspection | **BLOCKED for candidate**; published 1.32 AAR FAILS |
| Sherpa v1.13.8 compatibility | **BLOCKED** — no 1.32 headers/build |
| New AAR packaging | **BLOCKED** |
| ELF/ABI/16 KB checks | Baseline PASS; candidate **BLOCKED** |
| Native test suite | 1.28.2/1.31.0 PASS (24/24); 1.32 **BLOCKED** |
| ASan | Baseline evidence exists; 1.32 **BLOCKED** |
| Actual Parakeet inference | 1.28.2/1.31.0 PASS; 1.32 **BLOCKED** |
| Physical Xiaomi validation | **BLOCKED** — device absent |
| Performance comparison | **BLOCKED** |
| Network/privacy | **BLOCKED** — no device capture |
| 200-utterance benchmark | **BLOCKED** — canonical input incomplete |
| Provenance/SHA-256 manifest | Baseline complete; candidate **BLOCKED** |
| Independent review | Audits complete; candidate review **BLOCKED** |

## Safety

No production AAR, pin, signing config, versionCode/versionName, release tag, Play configuration or production branch was changed. No new AAR or APK/AAB was produced. No draft implementation PR was created because there is no candidate.