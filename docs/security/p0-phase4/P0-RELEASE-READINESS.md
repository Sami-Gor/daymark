# Daymark 2.1 Release Readiness Register

**Last updated:** 2026-11-26
**Overall status:** **RELEASE HOLD** - candidate validation has advanced, but formal accuracy, privacy/Play, signing and production-release gates remain.

This register records the candidate evidence and owner decisions available on 26 November 2026. It does not authorise a production signing operation, production AAB, Google Play change or release.

## Branch and artifact identity

| Item | Verified value |
|---|---|
| `main` | `6aafa15333101e39e61b7cc70f23431f122c82e0` - unchanged |
| `release/v2-candidate` | `6ef4ca779d37c9d2a6cddca646c53b929842ef06` |
| Production/released AAR | `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8` - unchanged |
| Adopted candidate AAR | `8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398` |

PRs #90, #91 and #92 are merged into the candidate. PR #94 merged at `5f3f22d9a569ada97ab4bdf3a802cf077bceff98`; network remediation is now part of the candidate. PR #93 merged at `6ef4ca779d37c9d2a6cddca646c53b929842ef06`; WebView regression coverage is now part of the candidate. PR #95 is the documentation-only update recorded by this file.

## Completed and accepted evidence

### P0 security and native adoption

- F1-F5 source fixes and FND-1 through FND-7 validation are complete within their demonstrated scope.
- Corrected candidate AAR/JNI/ORT adoption is recorded.
- Native normal and ASan testing, negative controls, host validation and adopted-JNI Android validation are recorded.
- Full application integration was exercised on the separate Phase 4.1 validation package.
- Production AAR, production signing and `main` were not changed.

### Core audio capture and integrated recognition

**Required core audio tests: PASS.**

- Physical Xiaomi device, Android 16/API 36.
- Tested APK: `e683f0da9a0ab403cbcbe3c80bfca89e7f2f38a8021dfe4b99b60f5bdce0fde9`.
- Nine integrated microphone/acoustic-playback cases returned terminal results: 5 short, 2 medium and 2 long.
- Results exercised the actual Daymark microphone capture and integrated Parakeet path, not standalone model inference.
- Voice JVM tests: 104/104 PASS.
- App JVM tests: 25/25 PASS.
- Frontend speech tests: 34/34 PASS.
- Earlier Phase 4.1 Parakeet short, long, compound and repeated-inference cases also passed.

The owner has confirmed that the required audio test set is satisfied. Do not reopen those nine successful cases as release blockers.

**Additional characterisation not claimed:** the 19.1-second maximum-duration and 28.9-second over-limit cases returned no terminal result; the 30-second boundary is therefore unverified. Only one tap-to-answer timing sample (6,465 ms) was recorded, so no median/P95 or cold/warm latency certification is claimed. Extended lifecycle/OEM tests stopped at the owner's request. These limitations are recorded separately and are not failures of the nine required core audio tests.

### Android minimum-version compatibility

**Minimum-SDK compatibility baseline: PASS.**

- Effective `minSdkVersion`: 29.
- API 29 candidate QA checks: install, launch, WebView, weather, location permission and microphone permission passed.
- API 30 basic compatibility checks passed.
- API 28 and API 26 correctly rejected installation under the API 29 minimum.
- Historical API 24/26 installs used the Phase 4 APK built with an explicit minSdk 24 workflow override; they are not evidence that the current candidate supports those versions.

The API 29 emulator could start a Parakeet voice session, but actual speech recognition could not be validated there because emulator audio was unavailable. A second-OEM physical voice test was not available. These are additional voice-hardware coverage limitations, not failures of the minimum-SDK installation baseline.

### WebView renderer recovery - PR #93

- The earlier launcher exit was traced to force-stopping the entire `com.google.android.webview` package, not a genuine renderer-process crash.
- Real renderer termination was exercised with `chrome://crash` / CDP.
- On the existing candidate-equivalent physical APK, one, two and three rapid renderer crashes recovered to foreground Daymark; route restoration to `/privacy` was verified on the physical Xiaomi and QA emulator.
- Android API 30 instrumentation: 2/2 PASS (Activity recreation after a renderer crash; three rapid crashes reach terminal fallback).
- QA package `io.github.sami_gor.daymark.wvvalidate`; APK SHA-256 `7895f5ea7ea798a9769bbc5a37bdb61613bc3b75ae7f576124f39af68a47254d`.
- Fresh QA APK physical installation on the Xiaomi was blocked by MIUI `INSTALL_FAILED_USER_RESTRICTED`; the restriction was not bypassed. The fresh QA APK is not claimed as physically installed.
- No production WebView defect was confirmed. PR #93 adds regression coverage and test tooling; no production WebView code change was required.
- PR #93 merged into `release/v2-candidate` at `6ef4ca779d37c9d2a6cddca646c53b929842ef06`.

### Network remediation - PR #94

**Fix commit:** `51f4a7dc957f53d921eb0b202c4bcb5140250904`
**Merge commit:** `5f3f22d9a569ada97ab4bdf3a802cf077bceff98`
**Status:** merged into `release/v2-candidate`.

Post-fix QA APK:

- SHA-256: `51ae9a436d70cf81e0ec9e158fc9effc4d306f3c87ff9ec7bc3d7483b9a9d3c4`
- Package: `io.github.sami_gor.daymark.netvalidate`
- Version: `2.0.0` (versionCode 2)
- Minimum SDK: 29
- Target SDK: 36
- Device: Xiaomi 2609FRA74G, Android 16/API 36
- Kokoro JNI: `a6e3daa73b12b8030153827368e51f4b1369481eb381d10c125a7b4f7aa48574`

Targeted physical post-fix retests:

- N03 request timeout: PASS, using a request held until the application's actual timeout signal fires.
- N04 response-body timeout: PASS, using a pending response body aborted during `response.text()`.
- N07 malformed payload: PASS; the exact `{"unexpected":true}` payload is rejected with the malformed error.
- N12 background/resume: PASS; Paris was released first after background/resume, and the final UI showed Berlin / 30 C, proving the stale result did not win.

Regression:

- Targeted weather/error tests: 73/73 PASS (local subset).
- Full frontend Vitest: 369 passed, 1 skipped.
- Playwright E2E: 141/141 PASS.
- TypeScript: PASS.
- Android JVM voice: 104/104 PASS.
- Android JVM app: 25/25 PASS.
- Hosted CI run `45851805241`: success.
- CodeQL run `45851805074`: success.

Consolidated scenario result:

- Original run: 9 PASS, 3 FAIL, 1 PARTIAL.
- Four original failures/partial cases (N03, N04, N07, N12) were retested and passed on the new APK.
- Consolidated result: 13/13 scenarios PASS across the original and remediation runs.
- Only N03/N04/N07/N12 were retested on APK `51ae9a4...`. The other nine results remain tied to the original baseline APK; this is not a fresh 13-case rerun on the new APK.

**Test-method limitation:** N03, N04, N07 and N12 use app-level controlled-response tests through the WebView DevTools fetch seam. They do not claim physical TCP/DNS/HTTP transport fault injection. N09/N10 are the real-radio disconnect/restoration tests. TLS/certificate validation and production endpoints were not weakened.

**Evidence location:** `workstreams/release-readiness/evidence/network-remediation-20261126/`. This is the local verified evidence set containing APK identity, installation evidence, result JSON/screenshots, native-library hashes, regression logs, reports and verified `SHA256SUMS`. T5 was not mounted; this evidence has not been copied to T5 and remains pending historical reconciliation.

### Language scope decision

French and Spanish offline narration are **deferred to Daymark 2.2 by owner decision**. English Kokoro remains the supported offline narration path for 2.1. French/Spanish unavailable messaging remains explicit; no system-TTS, browser or network voice fallback is to be introduced. This is not a 2.1 release blocker.

## Outstanding 2.1 release gates

| Item | Status | Remaining work |
|---|---|---|
| Formal speech accuracy benchmark | **AWAITING OWNER APPROVAL / NO SCORE** | The replacement 200-utterance protocol and scorer are prepared, but canonical recordings/reference transcripts and a formal measured score are not available. Recover existing recordings first and create only missing data. No formal accuracy PASS is claimed; this is separate from the nine successful core audio integration cases. |
| Privacy and Google Play | **PARTIAL** | Reconcile Data Safety across distributed V1/V2 tracks; verify location, speech, geocoding and provider disclosures; check permissions, ads, content rating, target audience and app access declarations in Play Console; verify deployed `/privacy`, `/fr/privacy` and `/es/privacy` pages match the shipped app. |
| Signing backup restoration | **BLOCKED** | T5 signing-vault restoration remains outstanding. Restore only through the owner-authorised process, verify the upload-key fingerprint and perform test-signing verification. Do not alter production signing configuration. |
| Release version and production AAB | **BLOCKED** | Reconcile the final candidate branch; confirm the next unused Play version code in Console; set the intended 2.1.0 release version; build and independently verify the production-signed AAB only after all prerequisites and explicit release authorisation. |

Additional API 29 microphone/second-OEM characterisation remains separate from the passing minimum-SDK baseline. Maximum-duration/over-limit and latency characterisation remain separate from the passed core audio set.

## Explicitly not 2.1 blockers

- French/Spanish offline narration: deferred to 2.2.
- The nine successful required core audio cases and their passing automated regression suites: accepted as PASS; do not rerun or relabel them as failures.
- The unverified 30-second/over-limit edge cases and fuller latency statistics remain limitations in the evidence record, not failed required core audio tests.
- Additional API 29/second-OEM microphone characterisation remains distinct from the passing API 29 minimum-SDK installation/basic-app checks.
- The fresh WebView QA APK physical-install restriction is an evidence limitation, not a renderer-recovery failure.

## PR and CI tracking

| PR | Final state | Evidence / remaining issue |
|---|---|---|
| #93 WebView | Merged at `6ef4ca779d37c9d2a6cddca646c53b929842ef06` | API30 instrumentation 2/2 PASS; route restore and physical candidate-equivalent renderer cycles PASS; regression coverage incorporated into candidate; fresh QA physical install blocked by MIUI. |
| #94 Network | Merged at `5f3f22d9a569ada97ab4bdf3a802cf077bceff98` | Network remediation incorporated into candidate; targeted post-fix N03/N04/N07/N12 PASS; consolidated 13/13 across two runs; DevTools/real-radio distinction retained. |
| #95 Release register | Documentation-only update | This register; no production code, signing, AAB or Play changes. |

PR #93/#94 hosted Android, build/repeatability, verify, model-independent/model-dependent, CodeQL and analysis checks passed on their final heads. The GitLab mirror check is a pre-existing infrastructure failure and is not represented as a product-test failure.

## Release invariant

- `main` remains `6aafa15333101e39e61b7cc70f23431f122c82e0`.
- `release/v2-candidate` is `6ef4ca779d37c9d2a6cddca646c53b929842ef06` at the time of this documentation update.
- Production AAR, signing material, production AAB, release tags and Google Play remain untouched.
- Overall release status remains **HOLD** until the outstanding release gates are resolved.
