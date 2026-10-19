# Daymark Version 2 — privacy hardening

Status: implementation in progress on `v2/privacy-hardened-voice` (draft PR #36).
This document tracks candidate Version 2 behaviour. It is not evidence that the
candidate has passed device verification and must not be used to update the
published Data safety answers until the gates below are complete.

**Document scope.** `README.md`, `SECURITY.md`,
`docs/release/android-production-readiness.md` and
`docs/release/play-console-checklist.md` in this branch still describe the
**released v1.0.0** behaviour — two-decimal coordinate rounding,
`ACCESS_FINE_LOCATION`, and browser/platform speech recognition. Those
statements are correct for `main` and for the shipped Play release, and are
deliberately left unchanged here; rewriting them to describe unreleased
behaviour would misdescribe the app users actually have. They do **not**
describe the code in this branch. This file and
`docs/release/parakeet-v3-android-phone-evaluation.md` are the authoritative
V2 sources until the shared documents are version-scoped at release time.

## Decisions

- Android speech input must use `SpeechRecognizer.createOnDeviceSpeechRecognizer()`
  on API 31+ only, after runtime availability checks. Android API 24–30 and API
  31+ devices without a compatible local recognizer must show voice input as
  unavailable. No generic Android `SpeechRecognizer`, Web Speech, remote
  retry, or silent online fallback is permitted.
- A speech session is one-shot. Daymark does not write audio or transcript
  files, and must not log recognition payloads. Cancellation and lifecycle
  exits must invalidate callbacks and destroy the recognizer.
- English narration remains on the bundled local Kokoro engine.
- French and Spanish Android narration must use an installed Android TTS voice
  for which `Voice.isNetworkConnectionRequired()` is false. If no such voice
  exists, narration reports an offline-voice-unavailable error instead of
  switching engines.
- Android declares `ACCESS_COARSE_LOCATION` only and does not declare
  `ACCESS_FINE_LOCATION`. Use the approximate coordinate returned by Android
  without additional decimal rounding. On web/PWA platforms without the same
  permission-level approximation guarantee, snap device-derived coordinates
  to a 0.025-degree grid before weather requests.
- Typed place search remains separate: user-entered queries still go to
  Open-Meteo geocoding.
- The bundled GeoNames locality data remains reverse-lookup only. Forward
  offline place search is a separate investigation and is not included in this
  release unless an indexed prototype passes its own acceptance criteria.

## Compatibility

- Keep `minSdk 24`, `targetSdk 36`, and `compileSdk 36`.
- Android API 24–30: voice input unavailable unless a separately approved
  bundled offline model is implemented in a later change.
- Android API 31+: runtime-check `isOnDeviceRecognitionAvailable()` and use
  `createOnDeviceSpeechRecognizer()`. Model/language support must be tested on
  devices; generic recognizer fallback is prohibited.
- No new speech model dependency is introduced by this implementation slice.
  A bundled model remains a separately reviewed option due to size, licence,
  CPU and battery trade-offs. A separate, **unmerged** local experiment adds a
  bundled Parakeet TDT 0.6B v3 int8 model behind a `v2test` build type; see
  "Local test builds" below. It is not part of this branch and is not part of
  the shipped candidate.

## Offline place search evaluation

The current bundled locality dataset contains 235,857 records and is a reverse
lookup structure (coordinates to locality name), not a forward search index.
It cannot replace Open-Meteo geocoding as-is.

A local forward-search implementation would need a name-to-coordinate index,
normalization for accents/diacritics, multilingual aliases, and ranking by
population/admin hierarchy. The audit's preliminary size estimate is an
additional 5–20 MB, to be measured rather than treated as a committed result.
Likely limitations include lower recall for small settlements, spelling errors,
alternative names and non-Latin scripts, plus the ongoing burden of refreshing
the dataset. Offline search would keep typed queries on-device, but would trade
the provider's maintained search coverage for a bounded local index.

Decision for this release: retain Open-Meteo geocoding. Run a time-boxed,
separate prototype and compare recall, latency, localized aliases and compressed
index size before deciding whether offline search merits a future release.
Until that changes, typed place queries still leave the device and must be
considered in Data safety.

## Approximate device-location evaluation

Android is configured to request only `ACCESS_COARSE_LOCATION`. Android's
documentation describes approximate location as an estimate at roughly
3 km² accuracy and recommends requesting coarse permission only when this
meets the feature's needs. Daymark should use the OS-returned approximate
coordinate as-is rather than applying a second, much coarser rounding step.

For web/PWA use, `location-privacy.ts` snaps device-derived coordinates to a
0.025-degree grid. Around London this grid cell is approximately 2.8 km
north/south by 1.7 km east/west (about 4.8 km²). This is a fallback policy for
platforms that do not expose Android's permission-level approximate mode; it
is not a universal guarantee of the same physical cell area at every latitude.

The user can also choose a city/place manually and deny GPS permission. Typed
place search remains a separate path and goes to Open-Meteo geocoding; it is
not made local by the GPS permission change.

Forecast impact: Android's OS-derived approximate location and the web/PWA grid
should preserve more regional detail than 0.1-degree rounding. Coastal,
elevation and urban differences can still affect the selected forecast point.
Test representative London, coastal and elevated UK locations. Confirm that
regional comparison labels do not imply street-level precision.

Google Play defines approximate location as an area greater than or equal to
3 km², and its Data safety guidance says off-device transmissions still need
review even when the app itself uses location transiently. Open-Meteo's terms
state that server logs can contain geographical coordinates and are kept up to
90 days; do not claim that the full provider path is ephemeral or that no
coordinates are transmitted. Validate the final Data safety answers against
the shipped code and provider behaviour.

## Release gates

- [x] CI typecheck, build, unit tests and browser tests pass on the PR.
      GitHub Actions `verify` succeeded on branch head `fe18893` (2026-10-19),
      covering typecheck, build, Vitest, Capacitor sync, `:app:assembleDebug`,
      Playwright and the dependency audit. Note that CI builds only the `debug`
      variant and does not cover the local `v2test` experiment.
- [ ] Review native permission/cancellation handling and correct any static or
      runtime defects found by CI.
- [ ] Physical Android 12+ test: local recognizer and selected language model
      available; Ask Daymark produces the expected local result. Partial
      evidence 2026-10-15 (device `Nothing A059P, Android 16`, airplane mode,
      offline):
      microphone captured, Kokoro narrated a rain answer, no recognizer errors
      in logcat — but the transcript itself was not independently captured, so
      this gate stays open.
- [ ] Physical Android 12+ test: on-device recognizer/model unavailable; UI
      reports unavailable and there is no generic recognizer fallback.
      Untested on-device; deterministic unit coverage added
      (`voice-input-native.test.ts`, `voice-failure-messages.test.ts`) pins the
      refused-start, terminal `offline-unavailable`, and localized message
      behaviour without touching system packages.
- [ ] Android API 24–30 test: voice input is unavailable; no network recognizer
      is invoked.
- [ ] Cancel, timeout, error, app backgrounding, route unmount and repeated
      attempts invalidate sessions, clear transient handlers and destroy native
      recognition sessions. No recognition payload appears in logcat.
- [ ] French and Spanish narration: an installed local voice is selected; with
      only network-dependent voices available, narration fails with the explicit
      offline-unavailable state. Deferred: suitable local voices are not
      installed on the test device; not claimed as physically tested. The
      `offline-voice-unavailable` error chain (plugin gating → hook errorCode →
      localized `voice-error` UI) is verified by inspection and pinned locale
      strings only.
- [x] English Kokoro works in airplane mode and does not use system TTS.
      Verified 2026-10-15 (device `Nothing A059P, Android 16`, airplane mode):
      narration completed offline with ~7.6 s to first audio buffer on cold
      start. This is a maintainer-attested device observation; no logcat or
      packet-capture artefact for it is kept in this repository. English
      narration is unchanged from v1.0.0, where the same behaviour is recorded
      in `docs/release/android-production-readiness.md`.
- [ ] Network instrumentation on a physical device during voice input and
      narration records no speech service traffic. Outstanding: logcat showed
      no recognizer errors or payloads, but absence of log messages is not
      treated as proof of no traffic. Preserve redacted test evidence and
      confirm no payload is sent to weather/geocoding endpoints.
- [x] Android device test confirms Daymark runs with only `ACCESS_COARSE_LOCATION`
      and sends the OS-provided approximate fix without an additional rounding
      step. Verified 2026-10-15 on a `Nothing A059P` running Android 16 with
      an isolated test package `io.github.sami_gor.daymark.v2test` (production
      untouched):
      `FINE` ignored, `COARSE` granted foreground, earlier transient
      `POSITION_UNAVAILABLE` failures resolved on retry when the OS delivered a
      fix, and local weather displayed. Confirm API responses are useful at that
      precision — done for the tested fix; wider UK coverage remains
      optional. The specific test area is withheld from this public record.
- [x] Web/PWA test confirms that only the 0.025-degree-grid coordinates are sent
      for device-derived location, and no raw GPS values appear in requests.
      Covered by the Playwright test "granted web geolocation loads weather
      from grid-rounded coordinates without reverse geocoding", which asserts
      the grid coordinates in the outgoing request URL and asserts that the raw
      value is absent. The geolocation provider is mocked; this is not a
      physical-device GPS test.
- [ ] Test representative UK microclimate locations and confirm the final Play
      Data safety classification against the actual data flow and provider path.
- [x] Existing test suite remains green; resolve any unrelated regression before
      release. 19 test files / 244 unit tests and 153 browser tests pass on
      branch head `fe18893` (2026-10-19).
- [ ] Reconcile store privacy policy and Data safety answers only after the
      shipped candidate's actual behaviour is verified. This includes the
      in-app privacy pages (`src/pages/privacy.tsx` and the FR/ES variants),
      which describe the location change on this branch but still describe
      browser/platform voice recognition rather than the on-device path.
- [ ] Re-check the Play Data safety form against Play's multi-version rule.
      The Data safety section describes the **sum** of data collection and
      sharing across **all versions currently distributed** on Google Play.
      While v1.0.0 (which declares `ACCESS_FINE_LOCATION` and transmits a
      two-decimal fix) remains distributed, an Approximate-location-only answer
      would be inaccurate. Either withdraw v1.0.0 from Play or declare both
      location types until it is gone.
- [ ] Increment `versionCode` / `versionName`, build and verify the signed AAB,
      distribute the candidate via closed testing, then submit the production
      release only after review.

## Data not moved offline in this change

- Open-Meteo receives approximate device-location coordinates and typed
  geocoding queries.
- This reduces the precision of device-derived location; it does not prevent
  the app from transmitting a location estimate off-device.
- Open-Meteo's terms state that free API server logs may contain coordinates
  and are retained for up to 90 days. Reconcile this provider-side handling
  with the final Data safety response rather than assuming ephemeral processing.

## Local test builds (never distributed)

A separate local experiment adds a `v2test` Android build type behind the
package ID `io.github.sami_gor.daymark.v2test`. It is **not part of this
branch** and is **not part of the shipped candidate**. It exists only to
evaluate a bundled on-device ASR model on a phone.

| Property | Value |
|---|---|
| Package ID | `io.github.sami_gor.daymark.v2test` (distinct from `io.github.sami_gor.daymark`) |
| Signing | Android debug key — not the Play upload key, so it cannot be submitted to Play as-is |
| `debuggable` | `true` |
| ABIs | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` (the shipped v1.0.0 bundle is arm64-v8a only) |
| Size | approximately 934 MiB, including roughly 670 MB of model assets |
| Uploaded to Play | Never. Not signed with the upload key, debuggable, and not built by CI. |

Two properties of that experiment are recorded here because they would matter
if it were ever promoted:

- The model weights are redistributed under a licence that carries an
  attribution obligation (CC-BY-4.0), alongside an Apache-2.0 runtime and its
  bundled MIT-licensed runtime libraries. The licensing table in
  `docs/release/android-production-readiness.md` covers the v1.0.0 stack only
  and must be extended before any candidate that bundles a model is shipped.
- The harness exports a broadcast receiver without a permission, so any
  application on the device can trigger a model load. This is acceptable for a
  personal debug build that is never installed alongside other applications,
  but it must be changed before the experiment is shared.

## Evidence log

| Check | Status |
|---|---|
| Repository changes isolated on branch | Done (`v2/privacy-hardened-voice`, branch head `fe18893`; this document's corrections are on a separate review branch) |
| Draft pull request created | Done (PR #36) |
| Local build/test execution in this environment | Done 2026-10-15: full unit suite green (20 files, 249 tests, incl. new offline-unavailable and failure-message coverage); debug `.v2test` APK built and verified by package ID. The 249-test figure includes the two local, uncommitted test files; the **committed** branch runs 19 files / 244 unit tests plus 153 browser tests. |
| GitHub Actions CI and CodeQL | Completed — success on branch head `fe18893` (2026-10-19): `verify`, CodeQL `analyze`, and the GitLab mirror all succeeded. PR #36 checks reflect the pushed head. |
| Physical-device verification (device `Nothing A059P` running Android 16, test package `...v2test`, production untouched, connectivity restored) | Approximate location: passed after transient `POSITION_UNAVAILABLE` (fix delivered, local weather shown). Offline Ask: response produced (rain answer narrated), transcript not independently captured. English Kokoro offline: passed (~7.6 s cold-start first buffer). FR/ES offline voices, on-device unavailable scenario, and packet-level capture: untested/outstanding |
| Play Console / AAB / deployment | Intentionally unchanged |
