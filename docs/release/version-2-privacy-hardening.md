# Daymark Version 2 — privacy hardening

Status: implementation in progress on `release/v2-candidate` at
`30ff64b5…`. Open pull-request status is not evidence that the candidate has
passed verification. V2.2 road-map items are not current V2 behaviour.

This document tracks candidate Version 2 behaviour. It is not evidence that the
candidate has passed device verification and must not be used to update the
published Data safety answers until the gates below are complete. Historical
test entries below retain their original dates and are not current-tree results.

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
- French and Spanish narration is unavailable in V2 and is planned for V2.2.
  The app shows an explicit unavailable message. The Android system-TTS plugin
  is not registered, so there is no system-TTS, network-voice or browser
  fallback.
- The web/PWA demo has no Ask Daymark, Hear today, browser recognition or
  browser synthesis path.
- Android declares `ACCESS_COARSE_LOCATION` only and does not declare
  `ACCESS_FINE_LOCATION`. Both Android and web/PWA snap device-derived
  coordinates to the same 0.025-degree grid on the device before weather
  requests; no alternate request path sends the raw fix.
- Typed place search remains separate: user-entered queries still go to
  Open-Meteo geocoding.
- The bundled GeoNames locality data remains reverse-lookup only. Forward
  offline place search is a separate investigation and is not included in this
  release unless an indexed prototype passes its own acceptance criteria.

## Audience assessment

The owner has selected **Ages 18+ only** as the Google Play target audience. It
is a store declaration, not a technical access restriction: the app has no age
gate and does not prove that minors cannot access it. The UK Children's Code /
Age Appropriate Design Code must be assessed separately where it applies;
selecting 18+ does not resolve those UK obligations. Open-Meteo's published
terms are silent on child-directed use. The provider is neither declared
approved nor prohibited for child users, and no provider contact was made.

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

Android requests only `ACCESS_COARSE_LOCATION`; the V2 app also applies the
same on-device 0.025-degree grid as web/PWA before sending a location-derived
weather request. The OS permission and the grid are separate privacy steps.
Around London the grid cell is approximately 2.8 km north/south by 1.7 km
east/west (about 4.8 km²). It is not a universal guarantee of the same physical
cell area at every latitude. The web/PWA uses the identical grid.

The user can also choose a city/place manually and deny GPS permission. Typed
place search remains a separate path and goes to Open-Meteo geocoding; it is
not made local by the GPS permission change.

Forecast impact: the shared 0.025-degree grid, together with Android's coarse
permission, should preserve more regional detail than 0.1-degree rounding. Coastal,
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

## Data safety reconciliation — public evidence as at 27 October 2026

The Play Console dashboard was not accessible read-only from the audit
environment; the public storefront and its Data safety page were readable. On
21 October 2026 the public form declared **No data shared**, and listed
**Approximate location**, **Voice or sound recordings** and **In-app search
history**, all Optional / App functionality, with encryption in transit and
"Data can't be deleted". It did not list Precise location.

That does not match the released v1.0.0 code, which declares
`ACCESS_FINE_LOCATION` and sends a two-decimal coordinate (below Play's 3 km²
threshold). The owner states that v1.0.0 remains available until the full V2
production release, so the live saved answer appears wrong for the released
build; the public listing does not expose the track contents or the highest
version code. Confirm this in Console rather than withdrawing V1 during this
audit. The live form's "No data shared"
answer also depends on Play's user-initiated-action exception for the
Open-Meteo transfer; that analysis is not recorded in the Console export
because no export is available. The field-by-field proposal, the full matrix
and the open manual decisions are in
[`data-safety-v1-v2.md`](data-safety-v1-v2.md).

The live privacy pages (`/privacy`, `/fr/privacy`, `/es/privacy`) were checked
on 21 October 2026 and again on 27 October 2026: they still showed the
11 September 2026 policy text, not the V2 wording in this branch. The source
pages are therefore ahead of both the website and the shipped AAB. Do not
describe the V2 policy as published until the website is deployed and a matching
Android bundle is released.

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
- [ ] French and Spanish narration: **not available in V2**; the app must show
      the explicit unavailable message and must not invoke system/network TTS.
      The V2.2 on-device plan is not a current capability.
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
- [x] Web/PWA and Android code tests confirm device-derived coordinates are
      snapped to the 0.025-degree grid before weather requests. The Playwright
      tests inspect outgoing request URLs; the Android-path test sets the
      Capacitor Android platform and asserts the same grid, so the raw browser
      fix is not used. This is not a physical-device GPS test.
- [ ] Test representative UK microclimate locations and confirm the final Play
      Data safety classification against the actual data flow and provider path.
- [x] Existing test suite remains green; resolve any unrelated regression before
      release. 19 test files / 244 unit tests and 153 browser tests pass on
      the branch head this record was written against (`fe18893`, 2026-10-19).
- [ ] Reconcile store privacy policy and Data safety answers only after the
      shipped candidate's actual behaviour is verified. This includes the
      in-app privacy pages (`src/pages/privacy.tsx` and the FR/ES variants),
      which now describe the web/PWA as a limited demo with no voice,
      distinguish Android on-device Parakeet input and local English Kokoro
      narration, disclose that typed geocoding/weather requests and
      approximate location are sent to Open-Meteo, state that French/Spanish
      narration is unavailable in V2, and carry the 1.0.0 transition note. Those source edits are not published and
      are not in a shipped AAB: the live page still showed the 11 September 2026
      text on 27 October 2026. This gate remains open.
- [ ] Re-check the Play Data safety form against Play's multi-version rule.
      The Data safety section describes the **sum** of data collection and
      sharing across **all versions currently distributed** on Google Play.
      While v1.0.0 (which declares `ACCESS_FINE_LOCATION` and transmits a
      two-decimal fix) remains distributed, an Approximate-location-only answer
      would be inaccurate. V1 is intentionally left available until the full V2
      production release; do not withdraw it as part of this documentation task.
      Declare the combined V1 + V2 practices until V1 is no longer distributed
      on any non-internal track.
- [ ] **Target audience / Data Safety gate:** the owner has settled the Play
      target audience at **Ages 18+ only**. No child age group is selected; do
      not enter a Families child-audience declaration. Confirm Data Safety,
      target audience and content rating agree, and record whether any Play
      minor-access restriction is configured. The app does not implement an age
      gate in code, so do not claim that 18+ is technically enforced or that
      minors cannot access the app. Assess the UK Children's Code / Age
      Appropriate Design Code separately where applicable. Open-Meteo's terms
      are silent on child-directed use; do not claim approval or prohibition.
      Console was not edited.
- [ ] **Global V1 declaration:** while V1 remains currently distributed, the
      Data Safety sum must include V1's precise two-decimal location, browser
      speech recognition, system TTS and search behavior. V1 track inventory
      and provider/transport evidence remain outstanding. Do not submit a
      V2-only form. See `data-safety-v1-v2.md`.
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
