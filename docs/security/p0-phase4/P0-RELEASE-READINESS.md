# P0 Release Readiness Register

Status: **RELEASE HOLD** - validated candidate exists, but outstanding items remain.

## Completed

- Heejun F1-F5 source fixes and supporting tests.
- FND-1 through FND-7 within the demonstrated validation scope.
- D-102 host and device validation.
- Fixed-chain candidate AAR: 8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398.
- AAR adoption branch and PR #91 update.
- Native normal and ASan testing.
- Android adopted-JNI validation (Phase 3).
- Full Daymark application startup.
- Kokoro English narration.
- Live microphone capture.
- Parakeet inference and transcription.
- Weather integration.
- Basic WebView and privacy navigation.

## Outstanding

1. Formal speech accuracy benchmark - canonical dataset and scorer must be restored or reconstructed from trusted records before any formal accuracy PASS.
2. Android API 24-30 compatibility matrix.
3. Network-error and offline handling tests.
4. WebView failure recovery and fallback testing.
5. French and Spanish offline narration functionality - tested build reports these as unavailable.
6. Privacy and packet-level verification.
7. Google Play declarations: Data Safety, permissions, ads, content rating, target audience and app access.
8. Signing-key backup and restoration verification.
9. Final production release branch and version reconciliation.
10. Final production AAB build and independent integrity checks.

No item above is marked complete without evidence. PR #90 and PR #91 remain open and draft.
