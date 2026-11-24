# Device Validation Status

Device: Xiaomi physical device, Android 16 (API 36), arm64-v8a.
Final package: io.github.sami_gor.daymark.phase4validate 2.0.0 (2).

| Area | Status | Evidence |
|---|---|---|
| Adopted AAR/JNI/ORT identity | PASS | 8e1edb57 / 3611bbe1 / 33847ad4 |
| Phase 3 adopted-JNI harness | PASS | 42 observed, 0 fail, 4 skip; three runs |
| Phase 3 negative control | PASS | 23/23 corrected; 16/16 malformed detected; 7/7 valid controls |
| Full app startup | PASS | Phase 4.1 APK e683f0da |
| Kokoro English narration | PASS | 5/5 narration, zero SIGABRT |
| Kokoro lifecycle | PASS | 3/3 start/cancel/restart |
| Live microphone | PASS | non-zero AudioRecord frames |
| Parakeet inference | PASS | four captured transcripts |
| Weather | PASS | London live, Paris search/forecast |
| WebView/privacy/locale | PASS | Phase 4 smoke |
| API 24-30 compatibility | BLOCKED | no matrix executed |
| Formal speech accuracy | BLOCKED | no canonical scorer |
| Network/offline and WebView recovery | BLOCKED | not tested |
| FR/ES narration | SKIP | intentionally unavailable in tested build |

FND-1 through FND-7 are closed for the demonstrated validation scope. This is not a
claim of full production certification.
