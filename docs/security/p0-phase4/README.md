# P0 Security and Device Evidence

Sanitised evidence for the P0 security fixes and Phase 4/4.1 device validation.

- [Phase 4 final report](PHASE4-FINAL-REPORT.md)
- [Phase 4.1 final report](PHASE4-1-FINAL-REPORT.md)
- [Kokoro regression results](KOKORO-REGRESSION-RESULTS.md)
- [Microphone results](MICROPHONE-RESULTS.md)
- [Parakeet inference results](PARAKEET-INFERENCE-RESULTS.md)
- [Device validation status](DEVICE-VALIDATION-STATUS.md)
- [P0 release readiness](P0-RELEASE-READINESS.md)

Raw APK/AAB/model binaries, private recordings, device identifiers, network details and
raw device logs are intentionally not published. Original evidence remains in the T5
workstream directories.

## Current promotion status (2026-11-25)

PR #90 (merge `49be09e`) and PR #91 (merge `646e3cc`) are now merged into
`release/v2-candidate`, which adopts the corrected AAR `8e1edb57…`; candidate HEAD is
`646e3cc` unless GitHub shows a later verified commit. This remains a candidate-only
promotion: `main`, production signing, Google Play and the production/released AAR
(`5300c913…`) are unchanged, and the release status is still HOLD. See
[P0 release readiness](P0-RELEASE-READINESS.md) and [GitHub sync final](GITHUB-SYNC-FINAL.md).
