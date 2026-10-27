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

- Android speech input must use the **Parakeet TDT 0.6B v3 int8** model
  through the **sherpa-onnx** offline transducer, running on the device. This
  replaces Android's `SpeechRecognizer`: the `android.speech.SpeechRecognizer`
  API is not used anywhere in the Android voice path. No generic Android
  `SpeechRecognizer`, Web Speech, remote retry, or silent online fallback is
  permitted. If the model is missing, cannot be loaded, or recognition fails,
  voice input reports an explicit error and nothing else is tried.
- The model runs at the evaluated configuration: 16 kHz audio, 80-dimensional
  features, greedy decoding, CPU inference, and a fresh recognition stream per
  utterance. Each utterance ends on an energy-based endpoint so the user is
  answered when they stop speaking, rather than after a fixed window.
- A speech session is one-shot. Daymark does not write audio or transcript
  files, and must not log recognition payloads. Cancellation and lifecycle
  exits must invalidate callbacks and release the microphone, the recognition
  stream and the audio buffer.
- The model is materialised into the app's private storage on first use so
  ONNX Runtime can memory-map it, and the model is delivered to the device by
  Google Play. Inference never requires a network connection.
- English narration remains on the bundled local Kokoro engine.
- French and Spanish Android narration must use an installed Android TTS voice
  for which `Voice.isNetworkConnectionRequired()` is false. If no such voice
  exists, the plugin rejects with `system-tts-offline-unavailable` (surfaced in
  the interface as `offline-voice-unavailable`) instead of switching engines.
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

- Keep `minSdk 29`, `targetSdk 36`, and `compileSdk 36`.
- The bundled Parakeet TDT 0.6B v3 int8 model is introduced by this slice.
  It is the speech-to-text engine for the Android app, not an experiment: the
  earlier `v2test` build type and its unprotected test receiver are retired.
- The model is redistributed under **CC BY 4.0**, with the attribution and the
  indication of the int8 quantisation recorded in `THIRD-PARTY-NOTICES.md` and
  in the app's privacy pages. The sherpa-onnx runtime is Apache-2.0 and the
  ONNX Runtime libraries it bundles are MIT.
- The model is a large payload. Its size, its delivery through Google Play and
  the consequences for installation and first-run latency are recorded in
  `docs/release/parakeet-v3-android-phone-evaluation.md`.
- Because the model is bundled rather than provided by the operating system,
  voice input is available on every supported Android version, not only on
  API 31 and above. It must still be tested on the declared minimum version.
- Model and language support must be tested on devices; a generic recogniser
  fallback is prohibited.

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

## Data safety reconciliation — 21 October 2026

The Play Console dashboard was not accessible read-only from the audit
environment; the public storefront and its Data safety page were readable. On
21 October 2026 the public form declared **No data shared**, and listed
**Approximate location**, **Voice or sound recordings** and **In-app search
history**, all Optional / App functionality, with encryption in transit and
"Data can't be deleted". It did not list Precise location.

That does not match the released v1.0.0 code, which declares
`ACCESS_FINE_LOCATION` and sends a two-decimal coordinate (below Play's 3 km²
threshold). Either the live answer is wrong for the released build, or v1.0.0
has been withdrawn from distribution; the public listing does not expose the
track contents or the highest version code. The live form's "No data shared"
answer also depends on Play's user-initiated-action exception for the
Open-Meteo transfer; that analysis is not recorded in the Console export
because no export is available. The field-by-field proposal, the full matrix
and the open manual decisions are in
[`data-safety-v1-v2.md`](data-safety-v1-v2.md).

The live privacy page was also checked: on 21 October 2026 it still showed the
11 September 2026 policy text, not the V2 wording in this branch. The source
pages are therefore ahead of both the website and the shipped AAB. Do not
describe the V2 policy as published until the website is deployed and a
matching Android bundle is released.

## Release gates

- [x] CI typecheck, build, unit tests and browser tests pass on the PR.
      GitHub Actions `verify` succeeded on the branch head this record was
      written against (`fe18893`, 2026-10-19),
      covering typecheck, build, Vitest, Capacitor sync, `:app:assembleDebug`,
      the Android JVM unit tests, Playwright and the dependency audit. Note that
      CI builds only the `debug` variant: the release bundle, the model
      packaging and the native debug symbols are not exercised by CI.
- [ ] Review native permission/cancellation handling and correct any static or
      runtime defects found by CI.
- [ ] Physical Android 12+ test: the bundled local recogniser and model are
      available; Ask Daymark produces the expected local result. Partial
      evidence 2026-10-15 (device `Nothing A059P, Android 16`, airplane mode,
      offline):
      microphone captured, Kokoro narrated a rain answer, no recognizer errors
      in logcat — but the transcript itself was not independently captured, so
      this gate stays open.
- [ ] Physical Android 12+ test: the model is unavailable — not installed, or
      corrupt — and the UI reports unavailable with no fallback to any other
      recognizer. Untested on-device. The committed branch adds deterministic
      unit coverage that pins the refused start and the terminal
      `offline-unavailable` behaviour without touching system packages, and a
      source-level check that the Android path contains no
      `android.speech.SpeechRecognizer`.
- [ ] Android API 29–30 test: voice input works with the bundled model, and no
      network recognizer is invoked.
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
- [ ] Android device test confirms Daymark runs with only
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
      which now state that Android speech input is transcribed on-device by the
      bundled Parakeet model, distinguish the Android app from the web/PWA
      browser-speech path, disclose that typed geocoding/weather requests and
      approximate location are sent to Open-Meteo, state the
      installed-offline-voice constraint for French/Spanish narration, and carry
      a version note for 1.0.0 users. Those source edits are not published and
      are not in a shipped AAB: the live page still showed the 11 September 2026
      text on 21 October 2026. This gate remains open.
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

## On-device speech model (integrated)

The Android app recognises speech with the **Parakeet TDT 0.6B v3 int8** model
through the **sherpa-onnx** offline transducer. The earlier `v2test` experiment,
its separate build type and its unprotected test receiver are retired; the model
is now part of the production Android path.

| Property | Value |
|---|---|
| Package | `io.github.sami_gor.daymark` — the production package |
| Model | Parakeet TDT 0.6B v3, int8, CPU inference through sherpa-onnx 1.13.8 |
| Audio | 16 kHz mono, 80-dimensional features, greedy decoding, a fresh stream per utterance |
| Endpointing | energy-based: the utterance ends after speech followed by a short quiet period |
| Fallback | none. No Android `SpeechRecognizer`, no Web Speech, no remote recogniser |
| Model licence | CC BY 4.0, with the int8 quantisation indicated; see `THIRD-PARTY-NOTICES.md` |
| Runtime licences | sherpa-onnx Apache-2.0, ONNX Runtime MIT |

Two properties of the integration are recorded here because they shape what
still has to be proved:

- **The model is a large payload.** It is delivered to the device by Google Play
  and materialised into the app's private storage on first use, so the resident
  memory cost stays low but the installation grows. The measured sizes and the
  delivery options are in
  `docs/release/parakeet-v3-android-phone-evaluation.md`. That decision
  affects installation size and first-run latency and is not settled by this
  branch.
- **The integrated app has not yet been validated on a device.** The recorded
  accuracy and latency figures come from the standalone model harness, not from
  the Daymark screen. Every physical-device gate in this list is still open, and
  none of them may be closed by the standalone results.

## Evidence log

| Check | Status |
|---|---|
| Repository changes isolated on branch | Done (`v2/privacy-hardened-voice`, branch head `fe18893`; this document's corrections are on a separate review branch) |
| Draft pull request created | Done (PR #36) |
| Local build/test execution in this environment | Done 2026-10-15: full unit suite green (20 files, 249 tests, incl. new offline-unavailable and failure-message coverage); debug `.v2test` APK built and verified by package ID. The 249-test figure includes the two local, uncommitted test files; the **committed** branch runs 19 files / 244 unit tests plus 153 browser tests. |
| GitHub Actions CI and CodeQL | Completed — success on branch head `fe18893` (2026-10-19): `verify`, CodeQL `analyze`, and the GitLab mirror all succeeded. PR #36 checks reflect the pushed head. |
| Physical-device verification (device `Nothing A059P` running Android 16, test package `...v2test`, production untouched, connectivity restored) | Approximate location: passed after transient `POSITION_UNAVAILABLE` (fix delivered, local weather shown). Offline Ask: response produced (rain answer narrated), transcript not independently captured. English Kokoro offline: passed (~7.6 s cold-start first buffer). FR/ES offline voices, on-device unavailable scenario, and packet-level capture: untested/outstanding |
| Data safety / public Play audit (2026-10-21) | Public listing and Data safety page read; Console dashboard not accessible read-only; live `/privacy` still shows the 11 September 2026 text. The public form lists Approximate location only and says no data is shared; both need reconciliation against v1.0.0's two-decimal precise fix and Open-Meteo's independent-controller/90-day-log position. No Console or website changes were made. Details: `data-safety-v1-v2.md`. |
| Play Console / AAB / deployment | Intentionally unchanged |
