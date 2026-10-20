# Daymark Version 2 — privacy hardening

Status: implementation in progress on `v2/privacy-hardened-voice` (draft PR #36).
This document tracks candidate Version 2 behaviour. It is not evidence that the
candidate has passed device verification and must not be used to update the
published Data safety answers until the gates below are complete.

**Document scope.** `README.md`, `SECURITY.md`,
`docs/release/android-production-readiness.md` and
`docs/release/play-console-checklist.md` now describe **both** the
**released v1.0.0** behaviour and the **V2 candidate** behaviour, separately
labelled. The released statements are unchanged, because they are correct for
`main` and for the shipped Play release; rewriting them to describe unreleased
behaviour would misdescribe the app users actually have. Read the released
statement for what users have today, and the candidate statement for what
this branch changes. This file and
`docs/release/parakeet-v3-android-phone-evaluation.md` remain the detailed
sources for the candidate.

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

Every gate below is classified by **how it is proved**, because the three
classes are not interchangeable and a green pipeline says nothing about a
physical device or about the Play Console:

- **Automated** — proved by a check that runs in CI on every commit.
- **Physical device** — requires a real device and, for the network-privacy
  gates, a packet capture. A logcat transcript is not sufficient: absence of log
  messages is not evidence of absence of traffic.
- **Play Console** — requires the live Console. It cannot be proved from this
  repository at all, and no gate in that class may be marked complete without a
  recorded, dated Console check.
- **Documentation** — a text change that this repository can evidence.

| # | Gate | Class | Evidence required | Status |
|---|---|---|---|---|
| G1 | CI typecheck, build, unit tests and browser tests pass on the PR | Automated | A green `verify` run on the branch head | **MET** — `verify` succeeded on `fe18893` (2026-10-19) |
| G2 | Native permission and cancellation handling reviewed; defects found by CI corrected | Documentation | A review record naming the reviewed files, plus green CI | **OPEN** — the review was performed and CI is green, but no review record is attached |
| G3 | Physical Android 12+: local recogniser and language model available; Ask Daymark produces the expected local result | Physical device | A redacted transcript capture and a screen record | **PARTIAL** — maintainer-attested observation only; the transcript was never independently captured |
| G4 | Physical Android 12+: recogniser/model unavailable; UI reports unavailable and there is no generic recogniser fallback | Physical device | A screen record of the unavailable state plus a redacted logcat | **OPEN** — unit coverage only; no device run |
| G5 | Android API 24–30: voice input unavailable and no network recogniser invoked | Physical device | A device on API ≤ 30 with a screen record | **OPEN** |
| G6 | Cancel, timeout, error, backgrounding, route unmount and repeated attempts invalidate sessions; no recognition payload in logcat | Physical device | A redacted logcat covering all six triggers | **OPEN** |
| G7 | French and Spanish narration select an installed local voice; with only network-dependent voices, narration fails with the explicit offline-unavailable state | Physical device | A screen record and logcat on a device that has only network-dependent voices | **OPEN** — deferred; the error chain is verified by inspection and pinned locale strings only |
| G8 | English Kokoro works in airplane mode and does not use system TTS | Physical device | A **packet capture**, not a logcat | **PARTIAL** — maintainer-attested playback observation; no capture retained |
| G9 | Network instrumentation records no speech-service traffic during voice input and narration | Physical device | A packet capture, plus a request log for the weather/geocoding endpoints | **OPEN** |
| G10 | The app runs with only `ACCESS_COARSE_LOCATION` and sends the OS-provided approximate fix without extra rounding | Automated **and** Physical device | The merged manifest proves the permission half; a request-URL capture proves the transmitted coordinate | **PARTIAL** — permission half met by the branch; the transmitted coordinate is unproven |
| G11 | Web/PWA: only 0.025-degree-grid coordinates are sent and no raw GPS appears in requests | Automated | The browser test that inspects the outgoing request URL | **MET** — asserted by the Playwright suite on `fe18893` |
| G12 | Representative UK microclimate locations tested and the final Play Data safety classification confirmed | Physical device **and** Play Console | A location sample, then the recorded Console answers | **OPEN** |
| G13 | The existing test suite remains green | Automated | A green `verify` run | **MET** — 19 files / 244 unit tests and 153 browser tests on `fe18893` |
| G14 | Store privacy policy and Data safety answers reconciled against the shipped candidate's verified behaviour, including the in-app policy pages | Documentation **and** Play Console | Updated EN/FR/ES policy copy, then the recorded Console answers | **OPEN** |
| G15 | Play's multi-version Data safety rule re-checked | Play Console | A recorded Console check | **OPEN** — requires Console access |
| G16 | `versionCode`/`versionName` incremented, signed AAB built and verified, closed test, then production submission | Release | The signed artefact and the recorded Console state | **OPEN** — the candidate still reads `versionCode 1` |

**Release readiness is blocked.** Three gates are met by automated evidence
(G1, G11, G13) and one is half met by automated evidence (G10). Every remaining
gate needs a physical device, the Play Console, or a documented review record.
No gate in the *Physical device* or *Play Console* classes may be closed by
CI output, by a logcat excerpt, or by a claim in a document.

The device procedures and the evidence each one needs are specified in
[`device-pass-2026-10-20.md`](device-pass-2026-10-20.md). The Console items
and their exact questions are specified in
[`play-console-review-2026-10-20.md`](play-console-review-2026-10-20.md).

- [x] CI typecheck, build, unit tests and browser tests pass on the PR.
      GitHub Actions `verify` succeeded on the branch head this record was
      written against (`fe18893`, 2026-10-19),
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
      Untested on-device. The committed branch adds deterministic unit
      coverage (`voice-input-native.test.ts`) that pins the refused-start and
      terminal `offline-unavailable` behaviour without touching system
      packages. A further local, uncommitted test file
      (`voice-failure-messages.test.ts`) pins the localized message strings;
      it is not part of this branch.
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
- [ ] English Kokoro works in airplane mode and does not use system TTS.
      **Partial — code inspection plus an airplane-mode playback observation.**
      A local observation on 2026-10-15 (device `Nothing A059P`, Android 16,
      airplane mode) reported narration completing offline with ~7.6 s to first
      audio buffer on cold start. That is a maintainer-attested observation:
      no logcat or packet-capture artefact is kept in this repository, and the
      absence of log messages is not treated as proof of no traffic. The
      ~7.6 s cold start also deviates from the repository's own readiness
      target and from the 4.4–5.3 s first-buffer figure recorded for the Kokoro
      POC, so it needs its own measurement. English narration is unchanged from
      v1.0.0, where the same behaviour is recorded in
      `docs/release/android-production-readiness.md`; that record does not
      evidence this candidate. This gate stays open until a redacted traffic
      capture or a packet-level capture is attached.
- [ ] Network instrumentation on a physical device during voice input and
      narration records no speech service traffic. Outstanding: logcat showed
      no recognizer errors or payloads, but absence of log messages is not
      treated as proof of no traffic. Preserve redacted test evidence and
      confirm no payload is sent to weather/geocoding endpoints.
- [x] Android device test confirms Daymark runs with only
      `ACCESS_COARSE_LOCATION` and sends the OS-provided approximate fix
      without an additional rounding step.
      **Half satisfied by the branch, half pending.** The permission half is
      verifiable from the branch itself: the merged manifest declares
      `ACCESS_COARSE_LOCATION` and does not declare `ACCESS_FINE_LOCATION`,
      and the Android code path sends the OS-provided fix unmodified. The
      device half is **pending**: a local observation on 2026-10-15 (device
      `Nothing A059P`, Android 16) reported `FINE` ignored, `COARSE` granted
      foreground, an earlier transient `POSITION_UNAVAILABLE` resolving on
      retry, and local weather displayed. That is a maintainer-attested
      observation with no retained logcat or request-URL artefact, and it does
      not by itself demonstrate the transmitted coordinate. The retained
      test-build artefact is dated 2026-10-19, so the observation cannot be
      attributed to a build product of that date. Confirm API responses are
      useful at that precision, and attach a request-URL capture or a server
      log showing the coordinate actually transmitted. The specific test area
      is withheld from this public record.
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
      the branch head this record was written against (`fe18893`, 2026-10-19).
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

Three properties of that experiment are recorded here because they would matter
if it were ever promoted:

- **It substitutes the production recognition plugin.** The test build registers
  a different recognition plugin under the **same** Capacitor plugin name as the
  production one, and its availability check returns "available" unconditionally
  rather than testing the device. A `.v2test` build therefore cannot satisfy the
  on-device-recogniser gates in this list — the "recognizer/model unavailable"
  gate, the "API 24–30 unavailable" gate, and the "no generic recognizer
  fallback" gate all describe the production plugin, not this one. A build that
  registers two plugins under one name would silently resolve to whichever was
  registered last.

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
