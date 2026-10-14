# Daymark Version 2 — privacy hardening

Status: implementation in progress on `v2/privacy-hardened-voice` (draft PR #36).
This document tracks candidate Version 2 behaviour. It is not evidence that the
candidate has passed device verification and must not be used to update the
published Data safety answers until the gates below are complete.

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
  CPU and battery trade-offs.

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

- [ ] CI typecheck, build, unit tests and browser tests pass on the PR.
- [ ] Review native permission/cancellation handling and correct any static or
      runtime defects found by CI.
- [ ] Physical Android 12+ test: local recognizer and selected language model
      available; Ask Daymark produces the expected local result.
- [ ] Physical Android 12+ test: on-device recognizer/model unavailable; UI
      reports unavailable and there is no generic recognizer fallback.
- [ ] Android API 24–30 test: voice input is unavailable; no network recognizer
      is invoked.
- [ ] Cancel, timeout, error, app backgrounding, route unmount and repeated
      attempts invalidate sessions, clear transient handlers and destroy native
      recognition sessions. No recognition payload appears in logcat.
- [ ] French and Spanish narration: an installed local voice is selected; with
      only network-dependent voices available, narration fails with the explicit
      offline-unavailable state.
- [ ] English Kokoro works in airplane mode and does not use system TTS.
- [ ] Network instrumentation on a physical device during voice input and
      narration records no speech service traffic. Preserve redacted test
      evidence and confirm no payload is sent to weather/geocoding endpoints.
- [ ] Android device test confirms Daymark runs with only `ACCESS_COARSE_LOCATION`
      and sends the OS-provided approximate fix without an additional rounding
      step. Confirm API responses are useful at that precision.
- [ ] Web/PWA test confirms that only the 0.025-degree-grid coordinates are sent
      for device-derived location, and no raw GPS values appear in requests.
- [ ] Test representative UK microclimate locations and confirm the final Play
      Data safety classification against the actual data flow and provider path.
- [ ] Existing test suite remains green; resolve any unrelated regression before
      release.
- [ ] Reconcile store privacy policy and Data safety answers only after the
      shipped candidate's actual behaviour is verified.
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

## Evidence log

| Check | Status |
|---|---|
| Repository changes isolated on branch | Done |
| Draft pull request created | Done |
| Local build/test execution in this environment | Not available; repository clone was blocked by DNS |
| GitHub Actions CI and CodeQL | Started; results pending |
| Physical-device/network verification | Not yet run |
| Play Console / AAB / deployment | Intentionally unchanged |
