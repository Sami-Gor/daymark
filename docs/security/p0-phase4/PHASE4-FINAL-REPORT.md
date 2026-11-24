# Phase 4 - Full Application Device Validation

Status: **PASS** for the tested full-application scope.
Date: 2026-11-24. Device: Xiaomi physical device, Android 16 (API 36), arm64-v8a.

The Phase 4 build was completed in hosted CI, then corrected for the two runtime
dependencies found during device testing. Final device validation is Phase 4.1.

## Build and package

| Item | Value |
|---|---|
| Hosted full-app build | 45465058948 - success |
| Package | io.github.sami_gor.daymark.phase4validate |
| Version | 2.0.0 (versionCode 2) |
| minSdk / targetSdk | 24 / 36 |
| Final Phase 4.1 APK SHA-256 | e683f0da9a0ab403cbcbe3c80bfca89e7f2f38a8021dfe4b99b60f5bdce0fde9 |
| Accepted AAR | 8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398 |
| Sherpa JNI | 3611bbe18d282afc95bd5e4b8edf8f9f49f09d2148bf084c4878f6c390457cfb |
| ORT | 33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1 |
| Kokoro JNI (final) | a6e3daa73b12b8030153827368e51f4b1369481eb381d10c125a7b4f7aa48574 |
| Hosted Kokoro build | 45475872471 - success |

The accepted AAR and production signing configuration were not modified.

## Final results

| Area | Result |
|---|---|
| Full app startup / WebView UI | PASS |
| London live weather | PASS |
| Paris geocoding and forecast | PASS |
| French/Spanish UI and unavailable-narration message | PASS |
| Background/foreground lifecycle | PASS |
| Kokoro English narration | PASS - 5/5 cycles |
| Kokoro lifecycle narration/cancel/restart | PASS - 3/3 cycles |
| Kokoro native crashes | PASS - zero in final regression |
| Live microphone capture | PASS - non-zero frames |
| Parakeet inference/transcription | PASS |
| Short, long, compound and repeated utterances | PASS |
| Cancellation while listening | PASS - 3/3 |
| API 36 runtime | PASS for tested scope |
| API 24-30 runtime matrix | BLOCKED - not executed |

## Defect history

| ID | Status |
|---|---|
| P4-DEV-01 missing Kokoro JNI at startup | CLOSED |
| P4-DEV-02 Kokoro ABI mismatch / SIGABRT | CLOSED by source-built Kokoro JNI |
| P4-DEV-03 microphone contention | CLOSED after ownership release |
| P4-DEV-04 Parakeet inference blocked | CLOSED - real inference succeeded |

## Limitations

- No formal speech accuracy benchmark; only the captured transcripts below.
- No API 24-30 emulator/device matrix.
- Network-error/offline and WebView failure-recovery tests are outstanding.
- French/Spanish narration is intentionally unavailable in the tested build.
- No Play upload, production AAR replacement, merge or release.
