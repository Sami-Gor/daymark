# Daymark 2.1 Release Readiness Register

**Last updated:** 2026-11-25  
**Overall status:** **RELEASE HOLD** — candidate validation is progressing; operational release gates remain.

This register supersedes the earlier status table in this file. It records the candidate evidence and owner decisions available on 25 November 2026. It does not authorise a merge, signing operation, production build, Play Console change or release.

## Branch and artifact identity

| Item | Verified value |
|---|---|
| `main` | `6aafa15333101e39e61b7cc70f23431f122c82e0` — unchanged |
| `release/v2-candidate` | `3cc25da17961f32680f69317ed52aa3f1931a2ae` |
| Production/released AAR | `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8` — unchanged |
| Adopted candidate AAR | `8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398` |

PRs #90, #91 and #92 are merged into the candidate. PRs #93 and #94 remain open and draft; neither is merged.

## Completed and accepted evidence

### P0 security and native adoption

- F1–F5 source fixes and FND-1 through FND-7 validation are complete within their demonstrated scope.
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

### WebView renderer recovery — PR #93

- The earlier launcher exit was traced to force-stopping the entire `com.google.android.webview` package, not a renderer-process crash.
- Real renderer termination was exercised with `chrome://crash` / CDP.
- On the existing candidate-equivalent physical APK, one, two and three rapid renderer crashes recovered to foreground Daymark; route restoration to `/privacy` was verified on the physical Xiaomi and QA emulator.
- New Android instrumentation tests: 2/2 PASS on API 30 emulator (Activity recreation after a renderer crash; three rapid crashes reach terminal fallback).
- QA package `io.github.sami_gor.daymark.wvvalidate`; APK SHA-256 `7895f5ea7ea798a9769bbc5a37bdb61613bc3b75ae7f576124f39af68a47254d`.
- Fresh QA APK physical installation on Xiaomi was blocked by MIUI `INSTALL_FAILED_USER_RESTRICTED`; the restriction was not bypassed.
- PR #93 adds regression coverage; no production WebView code change was needed because no renderer-termination defect was confirmed.

### Network fixes — PR #94

- Body-read aborts during `response.text()` are now classified as timeouts; caller cancellation continues to propagate.
- Failed micro-climate lookups are no longer cached as `null`, allowing a subsequent request after connectivity returns.
- Targeted weather/error tests: 68/68 PASS.
- Full frontend tests: 364 passed, 1 skipped.
- Playwright Chromium E2E: 141/141 PASS.
- TypeScript: PASS.
- Android JVM: 25/25 PASS.
- QA package `io.github.sami_gor.daymark.netvalidate`; APK SHA-256 `2bad769a17e42883568acd5b768842916a467d4ad437673eb0adc755260a97f0`.
- Physical installation was blocked by the same MIUI restriction. No post-fix physical network matrix is claimed.

### Language scope decision

French and Spanish offline narration are **deferred to Daymark 2.2 by owner decision**. English Kokoro remains the supported offline narration path for 2.1. French/Spanish unavailable messaging remains explicit; no system-TTS, browser or network voice fallback is to be introduced. This is not a 2.1 release blocker.

## Outstanding 2.1 release gates

| Item | Status | Remaining work |
|---|---|---|
| Formal speech accuracy benchmark | **AWAITING OWNER APPROVAL** | Approve the replacement 200-utterance protocol. Only after approval, create the canonical recordings/transcripts and manifest, freeze the scorer, run integrated testing and publish measured WER/CER/intent results. No formal accuracy score exists yet. |
| Network physical verification | **BLOCKED** | Install the PR #94 QA APK on a physical device and run the post-fix DNS/reset/timeout/429/5xx/malformed/reconnection/retry/background-resume matrix. The current Xiaomi USB-install restriction is the blocker. |
| PR #93 physical QA artifact installation | **BLOCKED** | Fresh QA APK physical install is blocked by MIUI. Existing candidate-equivalent physical crash/route evidence and API30 instrumentation are recorded above. |
| Privacy and Google Play | **PARTIAL** | Reconcile Data Safety across all distributed V1/V2 tracks; verify location, speech, geocoding and provider disclosures; confirm target audience/content rating/app access/ads declarations in Console; publish and verify matching `/privacy`, `/fr/privacy` and `/es/privacy` pages. |
| Signing backup restoration | **BLOCKED** | Obtain owner-authorised vault credentials/approval, restore the T5 signing vault, verify the upload-key fingerprint and complete a test-signing verification. Do not alter production signing configuration. |
| Release version and production AAB | **BLOCKED** | Reconcile the final release branch, confirm the next unused Play version code, set 2.1.0, then—only after all prerequisites and explicit release authorisation—build and independently verify the production-signed AAB. |

## Explicitly not 2.1 blockers

- French/Spanish offline narration: deferred to 2.2.
- The nine successful required core audio cases and their passing automated regression suites: accepted as PASS; do not rerun or relabel them as failures.
- The unverified 30-second/over-limit edge cases and fuller latency statistics remain limitations in the evidence record, not failed required core audio tests.
- Additional API 29/second-OEM microphone characterisation remains distinct from the passing API 29 minimum-SDK installation/basic-app checks.

## PR and CI tracking

| PR | Head | State | Current evidence / remaining issue |
|---|---|---|---|
| #93 WebView | `96e8f11ffcf1e2cc0705b738073360d279df34bd` | Open / draft | Instrumentation 2/2 PASS on API30; route restore and physical candidate-equivalent renderer cycles PASS; fresh QA physical install blocked by MIUI. |
| #94 Network | `99eba5bd0c4238c61892333919d7c9c66af03366` | Open / draft | Automated checks PASS; QA APK built; physical post-fix matrix blocked by MIUI install restriction. |

For both PRs, the hosted Android/verification, CodeQL and analysis checks pass. The GitLab mirror check is the pre-existing infrastructure failure and is not represented as a product-test failure.

## Release invariant

- `main` remains unchanged.
- `release/v2-candidate` remains at `3cc25da17961f32680f69317ed52aa3f1931a2ae` until an authorised merge.
- Production AAR, signing material, production AAB, release tags and Google Play remain untouched.
- PRs #93/#94 remain open/draft pending review and explicit merge authorisation.
- Overall release status remains **HOLD** until the outstanding release gates are resolved.
