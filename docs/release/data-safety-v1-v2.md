# Data safety reconciliation — Daymark 1.0.0 and 2.0.0

Status: audit record, 21 October 2026. This document is not a Play Console
submission. No Play Console declaration was changed, and no website deployment
was performed.

Scope: the released `1.0.0` build on `main` (source commit `50194e8`) and the
V2 candidate on `v2/privacy-hardened-voice` (audited at `baf83e9`, committed on
`release/v2-compliance`). Evidence is source, manifest, build configuration and
the public Play listing. There was no packet capture and no accuracy benchmark.

## 1. Public Play state observed (read-only)

The Play Console dashboard was **not accessible read-only** from this
environment: `https://play.google.com/console` redirected to the public
`google.play/business` marketing page, and no signed-in Console session was
present. Console-only state therefore remains a manual check.

The public listing was readable on 21 October 2026:

- <https://play.google.com/store/apps/details?id=io.github.sami_gor.daymark&hl=en&gl=GB>
  — "Updated on Oct 20, 2026"; 10+ downloads; PEGI 3; "Initial production
  release of Daymark."
- <https://play.google.com/store/apps/datasafety?id=io.github.sami_gor.daymark&hl=en&gl=GB>
  — the developer-provided form says:
  - **No data shared with third parties.**
  - Collects **Location → Approximate location**, **Audio → Voice or sound
    recordings**, and **App activity → In-app search history**.
  - Each listed type is **Optional**, purpose **App functionality**.
  - **Data is encrypted in transit.**
  - **Data can't be deleted** (the developer does not provide a deletion
    request mechanism).

This is the public storefront rendering, not the Console form. The listing does
not expose the highest uploaded version code. The source tree has `versionCode
2` / `versionName 2.0.0`; whether that is the highest code on Play is a manual
Console check.

**Finding:** the live form selects Approximate location only. The released
1.0.0 app declares `ACCESS_FINE_LOCATION` and sends a two-decimal coordinate
(`src/App.tsx`, `findMe()`), which at UK latitudes is roughly a 0.8 km² cell —
below Play's 3 km² threshold for Approximate location. The live form therefore
appears to under-declare Precise location for the released build. The "No data
shared" answer also needs a documented user-initiated-action analysis because
Open-Meteo receives the coordinate/search and retains logs for up to 90 days.
Both points are manual/legal decisions, not changes made by this audit.

## 2. Data-flow matrix

Column meanings:

- **Leaves device?** — whether data is transmitted off the device by the app
  or by an app-controlled WebView/API call. "No" is a source-level finding, not
  a packet-level proof.
- **Storage / retention evidence** — separates Daymark's own storage from a
  provider's retention. Daymark has no backend or database.
- **Play Data safety topic** — the Play data type that the flow maps to, if the
  flow is in the Play-distributed Android artifact. Web/PWA-only flows are
  marked as such.

| Data | Source | Destination | Purpose | Storage / retention evidence | Leaves device? | Play Data safety topic |
|---|---|---|---|---|---|---|
| Android device-derived location, V2 | Android/WebView geolocation after "Use my location"; only `ACCESS_COARSE_LOCATION` is declared | `api.open-meteo.com` and `air-quality-api.open-meteo.com` query parameters; Open-Meteo | Forecast and air quality at the user's approximate area | Daymark: React state only, no persistence. Open-Meteo: free-API server logs "may contain sensitive information such as geographical coordinates"; "All log files will be deleted after a period of 90 days." | **Yes** — the OS approximate fix is sent unmodified (`resolveDeviceLocation(..., isAndroidNative=true)`). | **Location → Approximate location** (OS approximation is ≥3 km² by Play's definition). |
| Web/PWA device location | Browser geolocation after explicit action; snapped to a 0.025° grid on the device (`location-privacy.ts`) | Open-Meteo forecast/air-quality endpoints | Same | Daymark: none; Open-Meteo provider logs as above | **Yes** — the grid-rounded coordinates are sent. Near London the cell is ~4.8 km² (Approximate); the cell shrinks with latitude, so the Play classification would need re-derivation if this flow were ever in a Play artifact. | Web/PWA only; not a Play-distributed artifact. If it were, **Approximate location** at the tested latitude. |
| Android device-derived location, V1.0.0 | WebView geolocation; manifest declares `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` | Open-Meteo forecast/air-quality endpoints | Same | Daymark: none; Open-Meteo provider logs as above | **Yes** — coordinates rounded to **two decimal places** before sending (`findMe()` on `main`). | **Location → Precise location** while 1.0.0 is distributed (the two-decimal cell is <3 km²). Also **Approximate location** for V2. |
| Typed place-search query | User keyboard input in the search box | `geocoding-api.open-meteo.com` `name=` query; Open-Meteo | Suggest matching places | Daymark: input state only, no search history. Open-Meteo: request URL/query is processed by the provider; its published free-API privacy text commits to 90-day deletion of webserver logs and does not establish memory-only processing. | **Yes** — the typed text is sent. | **App activity → In-app search history** (Optional; App functionality). |
| Android speech audio and transcript, V2 | Microphone after explicit action; `AudioRecord` 16 kHz mono | On-device Parakeet TDT 0.6B v3 int8 through sherpa-onnx | Speech-to-text for Ask Daymark | Daymark: in-memory audio buffer and transcript only; no files; plugin states no audio/transcript logging. Model files are in app-private storage. | **No, by source inspection.** The Android voice path contains no `SpeechRecognizer`, Web Speech, remote recogniser, retry or online fallback (`android-voice-implementation.test.ts`). Packet-level/device proof is still outstanding. | **Audio → Voice or sound recordings: not collected for a V2-only Android build.** While V1 is distributed, the sum still requires Yes (next row). |
| V1 Android speech audio | Microphone via WebView `SpeechRecognition` / `webkitSpeechRecognition` | Browser/WebView speech service; the provider may process audio remotely | Speech-to-text | Daymark: transcript in memory only. Provider retention unknown; no provider documentation is retained in the repository. | **Potentially yes** — depends on the WebView/platform speech provider; source cannot establish on-device processing. | **Audio → Voice or sound recordings** (Optional; App functionality; ephemeral cannot be claimed). |
| Web/PWA speech audio | Browser `SpeechRecognition` / `webkitSpeechRecognition` | Browser or platform speech provider, possibly remote | Speech-to-text | Daymark: transcript in memory only. Provider retention unknown. | **Potentially yes** — the browser supplies the implementation; Daymark makes no on-device guarantee. | Web/PWA only; not in the Play artifact. |
| Android English narration | Intent/briefing text | On-device Kokoro model through the `DaymarkVoice` JNI plugin | Read the briefing aloud | Daymark: no narration text stored; logs contain timings/segment counts/PSS, not text. | **No** — local engine; no system-TTS fallback for English. | No listed user-data type; on-device processing. |
| Android French/Spanish narration, V2 | Intent/briefing text | Installed Android system TTS engine; only a voice with `isNetworkConnectionRequired() == false` is selected | Read the briefing aloud | Daymark: no narration text stored. The selected voice is installed on the device; the engine's own retention is outside Daymark. | **No off-device send by Daymark** when an eligible offline voice is selected; the text is passed to another on-device app component. If no eligible voice exists, narration fails with `system-tts-offline-unavailable`. | No listed user-data type; on-device app-to-app handoff. Device test of FR/ES voice selection is outstanding. |
| Android French/Spanish narration, V1.0.0 | Intent/briefing text | Device default Android TTS voice | Read the briefing aloud | Daymark: no narration text stored. The default voice may require network; provider retention unknown. | **Potentially yes** — V1 did not gate on `isNetworkConnectionRequired()`. | No listed user-data type unless the narration contains user data; the text is app-generated. Flag for legal review only if a searched place name is considered user data. |
| Web/PWA narration | Intent/briefing text | Browser `speechSynthesis`; voice may be local or remote | Read the briefing aloud | Daymark: no narration text stored; provider/voice retention unknown. | **Potentially yes** — depending on the browser and selected voice. | Web/PWA only; not in the Play artifact. |
| Language preference | Language selector | `localStorage` key `daymark.locale` | Remember UI language | Daymark: on-device only, until cleared. `storage-surface.test.ts` permits this as the only app-controlled persistent key. | **No** | Not collected; on-device preference. |
| Locality dataset and lookup result | Bundled/downloaded static GeoNames dataset; local nearest-locality lookup | Cache Storage (web/PWA) or bundled assets (Android); result used as a label | Name a device-location area without reverse geocoding | Daymark: static asset cached; no coordinates or results persisted as history. | **No** — no GeoNames request; no coordinates sent to GeoNames. | Not collected. |
| Weather/air-quality request metadata | App request | Open-Meteo; Cloudflare for web/PWA static hosting | Deliver forecast/hosting | Open-Meteo logs may contain coordinates and are deleted after 90 days. Cloudflare processes standard request metadata (IP, URL, user agent) for delivery/security under its own policy; Daymark does not control its retention. | **Yes** — IP and request URL necessarily reach the provider/host. | The coordinates/search content are covered by the location/search rows. IP/request metadata is not separately declared unless used to identify a user; manual review. |
| App logs | Android logcat / web console | Device log buffer; Capacitor debug logging only in debug builds | Diagnostics | Daymark: no recognition payload, transcript, coordinates or narration text in audited log statements; Kokoro logs timings/PSS, Parakeet logs model-preparation failure. Logcat is a device buffer. | **No** — not sent to Daymark. | Not collected. |
| Analytics / crash SDK data | None found in app dependencies or source | None | — | No analytics, advertising or crash-reporting SDK in `package.json`, Gradle dependencies or source. Android vitals/Play Console crash data is platform-level, not an app SDK. | **No app-controlled flow** | No app analytics/crash-log collection. Confirm platform-level Play reporting is not treated as app collection (manual). |
| Third-party libraries and model delivery | Capacitor/React/Radix/zod/wouter/lucide; sherpa-onnx/ONNX Runtime; Kokoro; GeoNames; Open-Meteo | On-device libraries; Open-Meteo only for runtime weather/geocoding; Google Play for model asset-pack delivery | App runtime, UI, on-device inference, weather | No analytics/ads/crash SDK found. Model/licence notices in `THIRD-PARTY-NOTICES.md`. Play asset pack is app content, not user data. | Only the Open-Meteo flows above. | No additional data types. |

## 3. V1.0.0 vs V2 candidate — code-level differences

| Area | Released 1.0.0 (`main`, `50194e8`) | V2 candidate (`baf83e9`) | Evidence |
|---|---|---|---|
| Android location permission | `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION` | `ACCESS_COARSE_LOCATION` only; `ACCESS_FINE_LOCATION` absent | app manifest / `android-manifest-permissions.test.ts` (merged manifest not rebuilt) |
| Device-location precision | Rounded to two decimal places on the device | Android: OS approximate fix used unmodified; web/PWA: 0.025° grid on the device | `src/App.tsx`, `src/lib/location-privacy.ts` |
| Android speech input | WebView `SpeechRecognition` / `webkitSpeechRecognition`; provider may be remote | Parakeet TDT 0.6B v3 int8 through sherpa-onnx; on-device; no fallback | `voice-input-browser.ts` vs `voice-input-native.ts`, `ParakeetSpeechRecognitionPlugin.java` |
| Web/PWA speech input | Browser speech recognition | Unchanged | `use-speech-recognition.ts` branches on Android native |
| Android English narration | Bundled Kokoro, local | Bundled Kokoro, local | `speech-router.ts`, `DaymarkVoicePlugin` |
| Android French/Spanish narration | Device default system TTS; may require network | Only an installed voice with `isNetworkConnectionRequired() == false`; explicit offline-unavailable error otherwise | `SystemSpeechPlugin.java` on each commit |
| Typed place search | Open-Meteo geocoding | Unchanged | `weather.ts` `searchPlaces()` |
| Analytics / crash SDK | None found | None found | `package.json`, Gradle files, source search |
| versionCode / versionName | 1 / 1.0.0 | 2 / 2.0.0 | `artifacts/weather-app/android/app/build.gradle` |
| compile / target / min SDK | 36 / 36 / 24 | 36 / 36 / 24 | `variables.gradle` |
| Native debug symbols | Not configured in the first release | `ndk.debugSymbolLevel 'SYMBOL_TABLE'` in release | `app/build.gradle`; whether the AAB actually carries them is untested here |
| Model delivery | Kokoro assets in the app | Parakeet added as an install-time Play asset pack | `parakeet-assets/build.gradle` |
| Privacy text in the artifact | Released policy (live page still shows the 11 September 2026 text) | Source pages updated for 2.0.0, but not deployed and not in a shipped AAB | live `/privacy` fetch, 21 Oct 2026 |

No source-level analytics, advertising, crash-reporting or tracking SDK was
found in either tree. That is not proof that a platform never logs or reports
anything; it is only evidence about code and dependencies. Absence of log lines
was not treated as proof of no network traffic.

## 4. Current official guidance (fetched 21 October 2026)

### Play Data safety

Source: <https://support.google.com/googleplay/android-developer/answer/10787469?hl=en>

- **Collection** means "transmitting data from your app off a user's device."
  It includes libraries/SDKs and "user data collected from a webview which has
  been opened from your app, if your app is in control of the code/behavior
  delivered through that webview."
- **Ephemeral processing** must still be included in the form, but is not shown
  if the data is only in memory and retained no longer than necessary to
  service the request. The article's weather-location example does not apply
  when the provider keeps logs; Open-Meteo says logs are deleted after 90 days,
  so Daymark does **not** claim ephemeral processing.
- **Sharing** includes off-device transfers and on-device transfers to another
  app. Exceptions include a **service provider** acting on the developer's
  instructions, and a **specific user-initiated action** where the user
  reasonably expects the data to be shared, or prominent disclosure and
  consent.
- **Multi-version rule:** the Data safety section "describes the sum of your
  app's data collection and sharing across all its versions currently
  distributed on Google Play." If any version requires collection, it must be
  declared required, not optional.
- **Data types:** Approximate location is an area **greater than or equal to 3
  square kilometers**, including Android `ACCESS_COARSE_LOCATION`; Precise
  location is **less than 3 square kilometers**, including
  `ACCESS_FINE_LOCATION`.

Other relevant points: "You alone are responsible for making complete and
accurate declarations"; encryption-in-transit is declared only if it applies to
all user data collected by the app, including SDKs; the deletion question asks
whether the developer provides a deletion-request mechanism.

### Target API level

Source: <https://support.google.com/googleplay/android-developer/answer/11926878?hl=en>

- From **31 August 2026**, new apps and app updates must target **Android 16
  (API 36)** or higher (Wear OS/Automotive/TV/XR have separate levels).
- Existing apps must target **Android 15 (API 35)** or higher to remain
  available to new users on newer Android versions.
- An extension to **1 November 2026** can be requested in Console.

Daymark's `compileSdk 36` / `targetSdk 36` / `minSdk 29` is compliant with the
new-app/update requirement. The extension is not needed for target 36.

### Open-Meteo terms and provider retention

Source: <https://open-meteo.com/en/terms> (fetched 21 October 2026)

- The free API is for non-commercial use, subject to rate limits, under
  **CC BY 4.0**.
- Privacy section: "We may collect non-personal information, such as IP
  addresses, for technical reasons such as server maintenance or prevent
  misuse, but this information is not linked to user identities in any way."
- "For troubleshooting purposes, we keep webserver log files that may contain
  sensitive information such as geographical coordinates. We do not share this
  data with any third party. All log files will be deleted after a period of 90
  days."
- OpenMeteo GmbH says it "acts as an independent data controller for the
  personal data processed for the purposes described in this privacy notice."

The provider's "non-personal" wording is not treated as proof of full
anonymisation under Play's "Anonymous data" sharing exception. Its 90-day log
retention is the reason Daymark does not mark location/search processing
ephemeral. Daymark cannot delete Open-Meteo's logs on a user's behalf.

## 5. Proposed Data safety answers — sum of distributed versions

These are proposals for manual review, not submitted answers. "Shared" is the
hardest field: the current live form says No, relying on the user-initiated
action (and possibly service-provider) exception. The conservative alternative
is Yes. The source and UI support a user-initiated reading, but the final answer
is a legal/product decision and must match the privacy policy and in-app
disclosure.

| Play field | Proposed answer (V1 + V2 sum) | Rationale | Confidence | Manual decision |
|---|---|---|---|---|
| Does the app collect or share user data? | **Yes** | Location, typed search, and (while V1 is distributed) speech audio leave the device. | High | No |
| Approximate location — collected | **Yes** | V2 Android sends the OS approximate fix to Open-Meteo; web/PWA grid flow also exists. | High | No |
| Approximate location — shared | **No (if the user-initiated-action exception is accepted) / Yes (conservative)** | Open-Meteo is a third party and an independent controller; its logs may retain coordinates for 90 days. The live form says No. | Low | **Yes — legal/policy review** |
| Approximate location — optional/required | **Optional** | User can deny location and use search or the default place; no version requires it. | High | No |
| Approximate location — purpose | **App functionality** | Forecast/air quality. | High | No |
| Approximate location — ephemeral | **No** | Provider logs are retained up to 90 days; ephemeral requires memory-only, no longer than necessary. | High | No |
| Approximate location — encrypted in transit | **Yes** | Open-Meteo requests are HTTPS; TLS is enforced by the app. | High | No |
| Precise location — collected | **Yes while v1.0.0 is distributed; No after it is withdrawn** | V1 declares `ACCESS_FINE_LOCATION` and sends a two-decimal coordinate (<3 km²). V2 Android declares coarse only. | High on code; Medium on Play classification | **Yes — confirm rollout/withdrawal** |
| Precise location — shared / optional / purpose / ephemeral / encryption | Same pattern as approximate: **No/Yes sharing decision; Optional; App functionality; Ephemeral No; Encrypted Yes** | Same provider path and retention. | Medium | **Yes — sharing decision** |
| In-app search history — collected | **Yes** | Typed `name=` queries go to `geocoding-api.open-meteo.com`; no local search history is stored. | High | No |
| In-app search history — shared | **No (if the user-initiated-action exception is accepted) / Yes (conservative)** | Same Open-Meteo analysis. | Low | **Yes** |
| In-app search history — optional/required | **Optional** | Search is optional; default place works without it. | High | No |
| In-app search history — purpose | **App functionality** | Place suggestions. | High | No |
| In-app search history — ephemeral | **No** | Provider request/log handling is not documented as memory-only; 90-day log retention applies to provider logs. | Medium | **Yes — confirm provider logging** |
| In-app search history — encrypted in transit | **Yes** | HTTPS. | High | No |
| Voice or sound recordings — collected | **Yes while v1.0.0 is distributed; No for a V2-only Android build** | V1 Android uses WebView speech recognition; the provider may process audio remotely. V2 Android uses on-device Parakeet with no remote path (source-level; packet proof open). | High on code; Medium on V1 provider | **Yes — V1 withdrawal / provider path** |
| Voice or sound recordings — shared | **No (if the user-initiated/service-provider exception is accepted) / Yes (conservative)** | The speech provider may be a platform service; its role and retention are not documented in the repo. | Low | **Yes — provider terms** |
| Voice or sound recordings — optional/required | **Optional** | Ask Daymark is optional; denial leaves the app usable. | High | No |
| Voice or sound recordings — purpose | **App functionality** | Speech-to-text for Ask Daymark. | High | No |
| Voice or sound recordings — ephemeral | **No / unknown** | No evidence of memory-only provider processing or a retention period. Do not claim ephemeral. | Low | **Yes — obtain provider docs** |
| Voice or sound recordings — encrypted in transit | **Yes for app-controlled flows; manual for platform speech** | The app's own Open-Meteo calls are HTTPS. The platform/browser speech transport is outside app control and was not packet-verified. The form has one global answer, so do not answer Yes unless the whole path is confirmed. | Medium | **Yes** |
| Data types not listed | **No** — no account/personal info, financial, health, messages, photos/videos, files, calendar, contacts, app interactions, installed apps, other UGC, web browsing, crash logs, diagnostics or device IDs declared | No accounts, no analytics/crash SDK, no ad ID, no device-ID access. Android vitals is platform-level. | Medium | **Yes — confirm no hidden SDK/provider** |
| Encryption in transit | **Yes**, if the voice path's platform transport is confirmed encrypted; otherwise this cannot be a blanket Yes | Open-Meteo is HTTPS. The app declares one global answer. | Medium | **Yes** |
| Deletion request mechanism | **No** | Daymark holds no account or server-side user data; it cannot delete Open-Meteo logs. Current live form says "Data can't be deleted." | High on Daymark; Medium on form wording | **Yes — match current Console answer** |
| Ads / advertising ID | **No ads; no advertising ID** | No ad SDK, no ad ID permission/use. | High | No |
| App access | **All functionality available without special access** | No login/account. | High | No |
| Target audience / content rating | **General audience; weather utility; no user-generated content; PEGI 3-like** | Current public listing shows PEGI 3. | High on public listing; Medium on questionnaire | **Yes — Console** |
| AI asset declaration | **Previously completed; re-check** | Parakeet is an on-device ASR model, not a generative content feature. The existing declaration may still be accurate. | Medium | **Yes — Console** |
| Families policy | **Not applicable / not child-targeted** | General-audience weather app. | High | No |

### If/when v1.0.0 is withdrawn

If no 1.0.0 artifact remains on any Play track and the Android app is V2-only:

- **Approximate location** stays Yes (V2 Android).
- **Precise location** can become No.
- **In-app search history** stays Yes.
- **Voice or sound recordings** can become No for the Android artifact, because
  V2 Android recognition is on-device. The web/PWA speech path is not a Play
  artifact. This must be re-checked if any Android fallback to Web Speech is
  ever reintroduced.
- The "sum" rule still applies to any older artifact left on a track, including
  closed/internal tracks that are distributed.

## 6. Release configuration checks

Observed from source and the public listing on 21 October 2026. "Untestable"
means this audit could not inspect the relevant Play artifact or Console page.

| Check | Evidence | Status |
|---|---|---|
| Package | `io.github.sami_gor.daymark` in `capacitor.config.ts`, `applicationId` in `android/app/build.gradle`, and the public listing URL. | **OK** (source + public listing) |
| Version | `versionCode 2` / `versionName 2.0.0` in `android/app/build.gradle`; released v1.0.0 was `1` / `1.0.0`. | **Source OK; highest Play code untestable** |
| compile / target / min SDK | 36 / 36 / 24 in `variables.gradle`. | **OK**; target 36 meets the 31 Aug 2026 new-app/update requirement |
| ABI | `arm64-v8a` only in `daymark-voice/build.gradle`; Play filters non-arm64 devices. | **OK** (source) |
| Native debug symbols | Release `ndk { debugSymbolLevel 'SYMBOL_TABLE' }` in `android/app/build.gradle`; the first AAB did not upload symbols (checklist §10). | **Configured; AAB contents untestable** |
| Parakeet licence | CC BY 4.0 attribution, licence link, source URL, int8 form/provenance and SHA-256 pins in `THIRD-PARTY-NOTICES.md`; model card is CC BY 4.0. | **OK in source; verify final bundle** |
| Privacy URL | `https://daymark-weather.pages.dev/privacy`, `/fr/privacy`, `/es/privacy` all HTTP 200 `text/html`; `/.well-known/assetlinks.json` HTTP 200 `application/json`. | **Live URL OK; live policy text is older than source** |
| Privacy-page accessibility | Semantic `h1`/`h2`, `<article lang>`, labelled language switcher, keyboard-focusable links; 15 privacy-page browser tests pass, including 320/390 px no-overflow checks. No TalkBack/screen-reader audit. | **Automated OK; device a11y untested** |
| Store listing | Public listing "Updated on Oct 20, 2026", 10+ downloads, PEGI 3, "Initial production release of Daymark"; no ads or in-app-purchase badge observed. | **Public listing OK; Console metadata manual** |
| App access / ads / audience / rating | No login or account in source; no ad SDK; general-audience weather utility; public rating PEGI 3. | **Source/public OK; Console forms manual** |
| Data safety consistency | Live form: Approximate location only, audio, search history, no sharing, encrypted, can't delete. Precise location for v1.0.0 and the "No sharing" analysis do not reconcile from source alone. | **MISMATCH — manual/legal** |
| Play Console | Dashboard redirected to the public marketing page; no signed-in session. | **Untestable read-only** |

## 7. Open evidence and manual actions

- [ ] Sign in to Play Console read-only and record the highest `versionCode` on
      each track, the current Data safety answers, the privacy-policy URL, the
      app-access/ads/audience/rating/AI-asset rows, and any native-symbols
      warning. This audit could not open the Console dashboard.
- [ ] Resolve the **Precise location** mismatch: either the live form is wrong
      for v1.0.0, or v1.0.0 has been withdrawn. Do not change the form to
      Approximate-only while a precise build is still distributed.
- [ ] Decide whether "Shared = No" is defensible under Play's user-initiated
      action exception for Open-Meteo, given its independent-controller wording
      and 90-day logs. If not, mark location and search as Shared = Yes.
- [ ] Obtain the actual Android WebView/browser speech provider path and
      retention terms for v1.0.0; the repository does not contain them.
- [ ] Device/packet-level proof that the V2 Android voice path makes no speech
      network request and has no fallback. Source tests are not packet proof.
- [ ] Device proof that the Android V2 coordinate sent on the wire is the
      OS-provided approximate fix, with a request-URL capture.
- [ ] Device proof of FR/ES offline voice selection and the explicit
      `offline-voice-unavailable` path.
- [ ] Cancellation/lifecycle/no-payload-log verification on a device.
- [ ] Confirm the AAB actually carries native debug symbols and that the
      privacy pages in the AAB match the deployed web policy.
- [ ] Check TalkBack focus/announcements and 200% font scaling on the three
      privacy pages. Only automated layout/overflow checks were run here.
- [ ] Verify the final AAB contains the CC BY 4.0 attribution and the int8
      provenance note, and that no additional licence obligation comes from the
      sherpa-onnx AAR's bundled libraries.
- [ ] Deploy the revised policy pages (EN/FR/ES) and set the effective date to
      the actual publication date; then rebuild the Android AAB so the bundled
      policy matches. The live policy is still the 11 September 2026 text.
- [x] Re-run the privacy-page tests and the web build after these text changes
      (21 October 2026): TypeScript passed, 262 unit tests passed, the
      production build passed, and the 15 privacy-page browser tests passed. No
      accuracy benchmark was run for this audit.

## 8. Publication steps prepared for the maintainer (not executed)

The privacy-page edits in this branch are source-controlled but **not deployed**.
When the release owner is ready:

1. Run `pnpm --filter @workspace/weather-app build` and the normal web checks.
2. Deploy `artifacts/weather-app/dist/public` through the existing Cloudflare
   Pages workflow (do not create a new deployment path).
3. Verify `https://daymark-weather.pages.dev/privacy`, `/fr/privacy` and
   `/es/privacy` show the version note, the 2.0.0 Android/web distinction and
   the current effective/last-updated dates. Set the effective date to the
   actual publication date at that point.
4. Rebuild the Android bundle with `versionCode 2` / `versionName 2.0.0` (or the
   next unused code confirmed in Console) so the bundled policy matches, and
   read the three policy pages from the built assets before signing.
5. Update the Play Data safety form only after the track contents are known and
   the legal sharing decision is recorded. Do not change the form to
   Approximate-only while a precise v1.0.0 build is still distributed.
6. Record the Console check date, highest version code, track contents and the
   final Data safety answers in `play-console-checklist.md`.

No CI workflow, Play Console declaration, or website deployment was changed by
this audit.

## 9. Source references

- V2 location: `artifacts/weather-app/src/App.tsx` (`findMe`),
  `artifacts/weather-app/src/lib/location-privacy.ts`
- V2 voice input: `artifacts/weather-app/src/lib/voice-input-native.ts`,
  `artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/ParakeetSpeechRecognitionPlugin.java`
- V2 voice output: `artifacts/weather-app/src/lib/speech-router.ts`,
  `.../SystemSpeechPlugin.java`, `.../DaymarkVoicePlugin.java`
- Network boundary: `artifacts/weather-app/src/lib/weather.ts`
- Storage: `artifacts/weather-app/src/lib/i18n.ts`,
  `artifacts/weather-app/src/lib/storage-surface.test.ts`,
  `artifacts/weather-app/public/sw.js`
- Policy pages: `artifacts/weather-app/src/pages/privacy.tsx`,
  `privacy-fr.tsx`, `privacy-es.tsx`
- Manifest/build: `artifacts/weather-app/android/app/src/main/AndroidManifest.xml`,
  `artifacts/weather-app/android/app/build.gradle`,
  `artifacts/weather-app/android/variables.gradle`
- Live public listing and Data safety page, accessed 21 October 2026.
