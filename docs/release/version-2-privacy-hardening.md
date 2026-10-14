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
- Device-derived GPS coordinates are rounded to one decimal place before
  weather requests. This intentionally trades local precision for a broader
  regional forecast. It does not change typed place search, whose query still
  goes to Open-Meteo geocoding.
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

## Coarser device-location evaluation

A 0.1-degree grid step is approximately 11.1 km north/south and about 6.9 km
east/west around London, giving a grid footprint far larger than the existing
two-decimal coordinate footprint. The implementation rounds device-derived
coordinates to one decimal before weather requests; this is a precision
reduction, not a promise of any specific Google Play classification. Confirm
the actual classification using Play's definitions and the complete final data
flow before editing Data safety.

Forecast trade-off: global weather models should generally be less sensitive
to this coarsening than a roughly 2 km UK regional model. Coastal, elevation and
urban differences can be smoothed or the selected grid point may represent a
different local microclimate. Test representative London, coastal and elevated
UK locations against the current implementation; label regional comparisons as
approximate where appropriate. Typed-place coordinates remain separate and
are not changed by this helper.

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
- [ ] GPS-location test confirms the exact one-decimal coordinates are the only
      device-derived coordinates sent to forecast/air-quality APIs. Confirm
      actual Play Console approximate-versus-precise classification from the
      complete data flow and measure the impact on UK microclimate forecasts.
- [ ] Existing test suite remains green; resolve any unrelated regression before
      release.
- [ ] Reconcile store privacy policy and Data safety answers only after the
      shipped candidate's actual behaviour is verified.
- [ ] Increment `versionCode` / `versionName`, build and verify the signed AAB,
      distribute the candidate via closed testing, then submit the production
      release only after review.

## Data not moved offline in this change

- Open-Meteo receives weather coordinates and typed geocoding queries.
- Coarsening GPS coordinates reduces location precision but does not make
  location data "not collected" under Play's off-device transmission definition.
- The external provider's retention and third-party transfer treatment must be
  considered when completing Data safety.

## Evidence log

| Check | Status |
|---|---|
| Repository changes isolated on branch | Done |
| Draft pull request created | Done |
| Local build/test execution in this environment | Not available; repository clone was blocked by DNS |
| GitHub Actions CI and CodeQL | Started; results pending |
| Physical-device/network verification | Not yet run |
| Play Console / AAB / deployment | Intentionally unchanged |
