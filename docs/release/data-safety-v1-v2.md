# Data safety reconciliation — Daymark V2

**Status:** implementation and declaration audit, 27 October 2026. This is
**not** a Play Console submission. No Console declaration, signing material,
AAB, deployment, or public policy page was changed.

**Scope:** the V2 candidate on `release/v2-candidate` (HEAD `30ff64b`, plus the
uncommitted privacy changes under review), the current web/PWA demo, and the V1
transition. The Play Data safety form applies to the Android package; the
standalone web/PWA is not a Play artifact, although the same public policy
covers it. No packet capture or live microphone session was performed.

## 1. Official rules used

Consulted 27 October 2026:

1. Google Play Console Help, **“Provide information for Google Play's Data
   safety section”**,
   <https://support.google.com/googleplay/android-developer/answer/10787469?hl=en>.
   Definitions of collection, sharing, ephemeral processing, data types,
   encryption in transit, deletion, track scope and the version-sum rule.
2. Google Play Console Help, **“User Data”**,
   <https://support.google.com/googleplay/android-developer/answer/10144311?hl=en>.
   Transparency, consent and sensitive-data policy context.
3. Google Play Console Help, **“Manage target audience and app content
   settings”**,
   <https://support.google.com/googleplay/android-developer/answer/9867159?hl=en>.
   Target-age declaration and accuracy guidance.
4. **Open-Meteo Terms & Privacy**, <https://open-meteo.com/en/terms>, fetched
   27 October 2026. Provider evidence; not a Google rule.

The owner has settled the audience at **Ages 18+ only**. No child age group is
selected for V2. The in-app content is a general weather utility and contains
no child-directed characters, activities, rewards or advertising. The Google
Play Families Policy child-targeting process is therefore not a separate
blocker for this adult-targeted design, subject to the final store-listing and
content-rating check. This is not a claim of Families approval or of a legal
exemption.

### Audience declaration and separate assessments

The 18+ choice is a **Google Play target-audience declaration**, not a technical
access restriction. Daymark has no date-of-birth gate, and the setting does not
prove that minors cannot access the app.

The **UK Children's Code / Age Appropriate Design Code** assessment is separate
from the Play declaration. Selecting 18+ does not by itself resolve those UK
privacy obligations; the assessment must be completed where the Code applies.

The Open-Meteo terms are silent on child-directed use. The earlier mixed-age
Families proposal is withdrawn under the owner's 18+ decision, but that decision
does not establish that Open-Meteo is approved or prohibited for child users.
That remains a specific provider assessment if the audience changes or if a
regulator treats the service as likely to be accessed by children; it is not a
separate child-targeting blocker for the adult-only design. No provider contact
was made.

### Proportionate UK Children's Code assessment

The controls are: a general weather utility with no child-directed characters,
activities, rewards or advertising; an 18+ store declaration that is not an
age gate; optional coarse location with on-device latitude-aware rounding; no
search history; no advertising or profiling; no transcript/audio history; and
clear privacy text. No specific unmet Code control has been identified for this
adult-targeted design. External legal sign-off is not required as a generic
release condition; reassess if the content, audience or processing changes.

## 2. V2 source audit

### External network destinations

| Destination | Source / purpose | Data sent | Notes |
|---|---|---|---|
| `https://api.open-meteo.com/v1/forecast` | `artifacts/weather-app/src/lib/weather.ts` — forecast and micro-climate comparison | Coordinates, forecast field names, timezone | HTTPS. Default London and selected/device place requests use this host. |
| `https://air-quality-api.open-meteo.com/v1/air-quality` | `weather.ts` — air quality | Coordinates, air-quality field names, timezone | HTTPS. |
| `https://geocoding-api.open-meteo.com/v1/search` | `weather.ts` — forward place search | Typed `name`, count, language, format | HTTPS. No reverse-geocoding lookup. |
| Same-origin `/locality/localities-v1.json` | `src/lib/locality-load.ts` and `public/sw.js` | Static locality dataset request | Not a third-party destination; cache is an application resource. |
| Web/PWA static host / Cloudflare | deployed web asset delivery | Standard HTTP request metadata | Web/PWA only; Cloudflare’s own policy applies. |
| External links in privacy pages | `<a href>` to Open-Meteo/Cloudflare/GeoNames | None until clicked | Navigation links, not background requests. |

Source/dependency inspection found **no analytics, advertising, crash-reporting,
tracking SDK, external font/CDN request, native HTTP client, or remote speech
provider** in the V2 app. Capacitor is configured for bundled local assets and
`androidScheme: https`; there is no remote `server.url`. The native Java
network-boundary test scans the first-party Java modules for HTTP/URL literals.

### Location

`artifacts/weather-app/src/lib/location-privacy.ts` applies a latitude-aware
on-device grid with a 0.025-degree minimum latitude step. Above the latitude
where a 0.025-degree longitude cell would be below 3 km², the longitude step
widens just enough to preserve that minimum area. `App.tsx` obtains the browser/Android fix only
after an explicit “Use my location” action and passes the rounded coordinates
to `fetchWeather`. Forecast, air-quality and micro-climate requests all use the
same rounded place object; there is no alternate request path with the raw fix.

The default London forecast is requested on opening without location
permission. The Android manifest declares `ACCESS_COARSE_LOCATION` and not
`ACCESS_FINE_LOCATION`. Automated tests inspect outgoing web and simulated
Android request URLs, including forecast and air-quality URLs; physical-device
request inspection from the prior campaign is separate evidence and did not use
packet capture. See `location-privacy.test.ts`, `tests/e2e/app.spec.ts`, and
`network-boundary.test.ts`.

### Place search

`searchPlaces()` trims the query, requires at least two characters, and sends
only:

- `name=<typed query>`
- `count=8` by default
- `language`
- `format=json`

to `geocoding-api.open-meteo.com`. The UI holds the query/results in component
state only. No localStorage, IndexedDB, native database, or search-history
record is written. The query is therefore **In-app search history** for the
off-device request, not a Daymark-maintained search history.

### Voice pathways

- **Ask Daymark:** `use-speech-recognition.ts` creates the native
  `ParakeetSpeechRecognitionPlugin` only on Android. The plugin uses the bundled
  Parakeet TDT 0.6B v3 int8 model through sherpa-onnx on the device. Audio is
  held in memory for the user-initiated session; the source does not persist
  audio or transcript and does not send them to a Daymark server.
- **English narration:** `use-daymark-speech.ts` routes Android English to the
  bundled Kokoro `DaymarkVoice` plugin. `speech-engine.ts` returns `unavailable`
  for non-English and unsupported platforms; there is no browser-speech or
  system-TTS fallback.
- **System TTS:** `MainActivity` registers only `DaymarkVoicePlugin` and
  `ParakeetSpeechRecognitionPlugin`; `SystemSpeechPlugin` is not registered.
  The V2 source has no browser `SpeechRecognition`/`speechSynthesis` calls.
- **Network routes:** the native voice modules contain no HTTP/URL literals;
  the app's only off-device voice-related route is the normal weather/search
  request path, not an audio upload. **No packet capture was performed.** This
  is source/test evidence, not proof of zero speech egress.
- **Limitations:** no live microphone session, no audible narration, no
  recognition accuracy/latency measurement, and no packet-level speech privacy
  verification. The current candidate does not include PR #54's patched
  sherpa-onnx runtime; this audit is not validation of that patch.

### Local preferences and storage

- Web/PWA and Android WebView: `daymark.locale` in localStorage.
- Android: private `SharedPreferences` named `daymark.permissions` containing
  the boolean `microphone-requested`, used only to avoid repeating a microphone
  permission prompt.
- Application resources: bundled model files, web app-shell cache and the
  locality dataset/cache.

These are on-device values. None is intentionally sent to a Daymark backend or
included in a weather/search request. There are no accounts, profiles, location
history, search history, transcript history, recording files or weather-history
records. The policy discloses that clearing local storage does not delete
third-party provider records.

### Privacy-policy access

The app routes `/privacy`, `/fr/privacy`, and `/es/privacy` from `App.tsx` to
the current English, French and Spanish policy pages. The current source pages
describe V2 and the 18+ audience. The public policy routes
`https://daymark-weather.pages.dev/privacy`, `/fr/privacy` and `/es/privacy`
returned HTTP 200 on 27 October 2026 but still rendered the older pre-V2 policy
text; the rendered English, French and Spanish pages carried the 11 September
2026 effective date (the French rendered date uses a different spacing but is
the same policy). No deployment was performed. The public site and the current
candidate source therefore must not be treated as identical until the policy is
deployed.

### Local Android artifact consistency

The local debug AAB (`44aa384c…`) and debug APK (`5eeb5553…`) are QA/debug
builds, not release candidates. Their packaged web bundle still contains the old
`suitable for children and adults` policy wording, while the current source has
the 18+ and source-IP wording. The generated assets were not edited manually. A
new Android bundle must be built from the approved policy source before release;
no rebuild was performed in this audit. The AAB is debug-signed and cannot
verify the production signing path.

## 3. V2 Data Safety decision record

Play’s “collect” definition is transmission of data from the app off-device,
regardless of whether the recipient is the developer or a third party. Daymark
operating no backend does not make the Open-Meteo requests “not collected”; it
removes a Daymark-operated recipient.

| Field | Proposed V2 answer | Evidence | Official source | Status / confidence |
|---|---|---|---|---|
| Approximate location — collected | **Yes** | After explicit location action and permission, the Android coarse fix is sent to Open-Meteo after the latitude-aware grid (0.025° minimum step). Default London is fixed, not device location. | Data Safety collection; Location definitions | High on source facts; not packet-verified. |
| Approximate location — shared | **Yes, provisional** | Open-Meteo is an independent controller receiving the rounded coordinates. No prominent pre-action disclosure naming Open-Meteo is currently shown. | Data Safety sharing; Open-Meteo notice | Conservative owner direction. A “No” answer requires a documented Play exception and legal review. |
| Approximate location — optional | **Yes** | User can decline location; London and place search still work. | Data Safety optional | High. |
| Approximate location — purpose | **App functionality** | Forecast/air quality for the requested area. | Data Safety purposes | High. |
| Approximate location — ephemeral | **No** | Open-Meteo says troubleshooting webserver logs may contain coordinates and are deleted after 90 days. | Ephemeral definition; Open-Meteo notice | High on available provider evidence. |
| Approximate location — encryption in transit | **Yes for V2 requests** | V2 Open-Meteo forecast/air-quality requests use HTTPS. | Encryption in transit | High for V2; not a global yes while V1 is distributed. |
| Precise location — V2 | **No** | Android declares only `ACCESS_COARSE_LOCATION` and no `ACCESS_FINE_LOCATION`; the shared latitude-aware grid is applied before requests. | Data Safety Precise location | Source verified; actual release artifact still needs inspection. V1 still requires a precise-location row. |
| In-app search history — collected | **Yes** | Typed `name` is sent to Open-Meteo geocoding; Daymark retains no query history. | Data collection; App activity / In-app search history | High. |
| In-app search history — shared | **Yes, provisional** | The query is transferred to Open-Meteo, an independent controller. The current UI does not obtain a specific pre-action third-party disclosure/consent. | Data sharing exceptions | Conservative owner direction; a “No” answer needs documented exception/legal review. |
| In-app search history — optional | **Yes** | Default forecast and location selection work without search. | Optional | High. |
| In-app search history — purpose | **App functionality** | Place suggestions. | Purposes | High. |
| In-app search history — ephemeral | **No** | The query is in the request URL, and no evidence establishes memory-only processing. Open-Meteo states a 90-day retention for troubleshooting logs that may contain coordinates, but does not state a query-specific period; do not invent one. | Ephemeral; Open-Meteo notice | No memory-only evidence; query-specific retention remains unstated. |
| In-app search history — encryption in transit | **Yes for V2 requests** | Geocoding uses HTTPS. | Encryption | High for V2; global answer remains blocked by V1. |
| Voice or sound recordings — V2-only | **No collected / No shared** | Parakeet is on-device; audio is in memory; no remote recognizer or system/browser speech path is registered. | On-device processing | Source/test evidence; no packet capture. |
| Microphone permission | **Optional app permission** | `RECORD_AUDIO` only for explicit Ask Daymark. | Collection definition / Android permission | High. |
| Local preferences | **Not a Data Safety collection** | `daymark.locale` and `daymark.permissions`/`microphone-requested` remain on-device. | Collection definition | High, subject to source tests. |
| IP address / network metadata | **No Daymark-selected data type; provider-receipt classification unresolved** | Open-Meteo receives source IP/URL metadata; the policy now discloses this. Daymark does not use IP to identify a user or derive location. | Data Safety IP-address FAQ | No Play data type can be justified from Daymark's own use. Because Play treats off-device transmission as collection, the provider-receipt classification still needs Play/legal resolution; do not guess one. |
| Deletion request mechanism | **No dedicated mechanism** | No accounts or backend user record; no location/search history. Local storage can be cleared; Open-Meteo logs cannot be deleted by Daymark. | Deletion FAQ | Current implementation; policy must not imply provider deletion. |
| Encryption in transit — global | **Not finalized** | V2 requests are HTTPS, but V1 remains distributed and its speech-provider transport is unknown. | Encryption; version-sum rule | Do not select global Yes until V1 is gone or provider transport is evidenced. |
| Other data types | **No additional types identified** | No analytics, ads, crash SDK, contacts, files, messages, health, financial or advertising-ID use found. | Data types | High for inspected source; confirm dependency/SDK inventory at submission. |
| Advertising | **No** | No ad SDK or advertising-ID use found. | Data types/purposes | High. |
| Target audience | **Ages 18+ only** | Owner decision. No child age groups selected; no Families child-audience declaration. | Target audience guidance | Owner-settled; Console not edited. No claim that an age gate is implemented. |

**High-latitude resolution:** the implementation now uses a latitude-aware
longitude step. The 0.025° latitude step is a hard minimum; where a fixed
0.025° longitude step would produce a cell below 3 km², the longitude spacing
widens just enough to keep the effective cell at or above the Play
approximate-location floor. At the exact poles the grid point is clamped to the
last 0.025° cell centre inside the pole so a zero-area point is not emitted.
Deterministic tests cover UK, 67.2°, 80°, 89.9°, 89.975° and pole inputs.


**IP determination:** on the inspected V2 source, Daymark does not use IP
addresses for identification, location inference, analytics or profiling. The
source IP is ordinary transport metadata received by the provider. That yields
no Play data type attributable to Daymark's own use. However, Play applies
“collection” to off-device transmission, so whether the provider's receipt must
be entered under a specific data type is unresolved; it must be resolved with
the actual Play definitions and legal/Play guidance, not guessed.

**Open-Meteo role:** its published notice identifies OpenMeteo GmbH as an
independent data controller and says troubleshooting logs may contain
geographic coordinates and are deleted after 90 days. Daymark does not control
those logs. The provider’s own statement that it does not share data with third
parties does not turn Daymark’s transfer to Open-Meteo into a service-provider
transfer under Play’s definition. No one contacted Open-Meteo.

## 4. V1 audit and combined-version declaration

### V1 source evidence

The available V1 sources are the `main` branch tip `44fd211` and the
release-tested physical-device commit `69e21c`. Both declare `versionCode 1`,
`versionName 1.0.0`, `minSdk 24`, and `targetSdk 36`. `main` is later than the
physical-test commit, so neither revision is proof of the artifact currently
served on every Play track. The release-readiness document's `min 29` row was
changed by commit `30ff64b` during the V2 API-floor work; it is not independent
V1 artifact evidence. The actual V1 manifest still requires inspection.

V1 source behavior:

- `src/App.tsx` rounds device coordinates to two decimal places (about 1 km)
  before the weather request; it does not use the V2 latitude-aware grid.
- Android manifest declares both `ACCESS_COARSE_LOCATION` and
  `ACCESS_FINE_LOCATION`.
- Ask Daymark uses browser/WebView `SpeechRecognition`; audio may be processed
  by the platform/browser speech provider, which is outside Daymark’s control.
- English Android narration uses local Kokoro. French/Spanish Android narration
  uses the registered Android `SystemSpeechPlugin` (system TTS), with browser
  speech synthesis on web/PWA.
- Weather, air-quality and geocoding requests use the same three Open-Meteo
  hosts. V1 source contains no analytics/advertising/crash SDK and no native
  HTTP client.
- V1 persists `daymark.locale` in local storage. It has no V2
  `daymark.permissions` Parakeet prompt flag.
- V1 source contains no transcript/audio persistence in its adapters, but the
  browser/platform speech provider and system TTS path can have their own
  off-device processing. No provider-level packet capture or terms evidence is
  available in this repository.

### Combined declaration while V1 remains distributed

Play requires the Data safety form to describe the **sum** of practices across
all versions currently distributed. While V1 remains on production, open,
closed or a staged rollout, the final global answer must include:

- **Approximate location — Yes** and **Precise location — Yes (source
  indicates)**: V1 sends a two-decimal coordinate and declares
  `ACCESS_FINE_LOCATION`. Console must verify the actual versionCode/artifact;
  do not assume the `main` or `69e21c` source is byte-identical to the V1
  artifact users have.
- **In-app search history — Yes**; typed queries go to Open-Meteo.
- **Voice or sound recordings — Yes / shared unresolved** while V1 is
  distributed: browser/WebView recognition may send audio to a provider, and
  the provider path/retention/transport are not established.
- **Encryption in transit — not global Yes**: V1 weather/search HTTPS does not
  establish the transport used by its speech provider or system TTS path.
- **Deletion — same no-account/no-provider-log mechanism**.
- **IP/network metadata — unresolved** as above.

Internal-testing-only artifacts are exempt. Closed/open/production tracks and
staged rollouts are included. Notifying users does not change distribution and
does not remove V1 from the global declaration. Existing V1 installations are
not deliberately disabled; V1 removal is tied to the full V2 production
release, not a fixed date.

Once V1 is no longer currently distributed on any non-internal track, the
official version-sum rule no longer requires V1 rows. A conservative owner may
retain them until support ends, but the form must not be labeled “V2-only”
while V1 is still distributed.

### Final proposed global matrix by applicable version

This is the proposed answer set for a global form covering V1 while it remains
distributed outside internal testing, plus V2. It is not a Console submission.

| Data type / field | V1 source evidence | V2 source evidence | Proposed global answer |
|---|---|---|---|
| Approximate location | Coarse permission exists, but V1 also declares fine and sends two decimals; precise row is the conservative source-led classification. | Coarse manifest, latitude-aware grid, no fine permission. | **Collected Yes; Shared Yes (provisional); Optional Yes; App functionality; Not ephemeral.** |
| Precise location | V1 source sends two-decimal coordinates with `ACCESS_FINE_LOCATION`; actual distributed manifest remains to be checked. | V2 does not collect precise location. | **Yes while V1 is distributed; No for V2.** |
| In-app search history | Typed query to Open-Meteo; no Daymark history. | Typed query to Open-Meteo; no Daymark history. | **Collected Yes; Shared Yes (provisional); Optional; App functionality; Not ephemeral.** |
| Voice or sound recordings | Browser/WebView recognition and system/browser TTS; provider transport remains external. | Parakeet and Kokoro on-device; no system/browser/remote fallback; no transcript/audio persistence found. | **V1: Yes (conservative); V2: No collected; global: Yes while V1 is distributed.** |
| IP / requested URL metadata | Provider receives transport metadata; no Daymark use for identification/location. | Same. | **Disclosed; no Daymark-selected Play data type; provider-receipt category remains a specific legal/Play classification question.** |
| Local preferences / models | `daymark.locale`; no V2 permission flag in V1 source. | `daymark.locale`; `daymark.permissions`/`microphone-requested`; bundled models. | **Not a Data Safety collection.** |
| Encryption in transit | Weather/search source uses HTTPS; V1 speech/TTS provider transport is not established. | V2 Open-Meteo requests use HTTPS. | **Yes for Daymark-controlled V2 requests; global Yes is not claimed while V1 speech transport is unverified.** |
| Deletion | No account/history deletion mechanism; provider logs are outside Daymark control. | Same. | **No dedicated deletion mechanism; local clearing does not delete provider records.** |

### Track/version inventory template — owner confirmation only

The only Play Console fact required to reconcile this matrix is the actual
track/version inventory. Fill this from a read-only Console view; do not change
tracks.

| Track | Version code | Version name | Release status / rollout | Internal-only? | Included in global form? |
|---|---:|---|---|---|---|
| Production |  |  |  | No | Yes if distributed |
| Open testing |  |  |  | No | Yes if distributed |
| Closed testing |  |  |  | No | Yes if distributed |
| Internal testing |  |  |  | Yes if internal-only | Exempt unless separately distributed |
| Staged rollout |  |  |  | No | Yes if active |

The actual V1 artifact manifest and speech/TTS provider evidence are separate
artifact/runtime questions, not Console settings.

### Exact Play Console fact still required

**Only the track/version inventory in the template above requires Play Console
confirmation.** It establishes whether V1 is still distributed outside internal
testing and which versionCode/versionName the global form must include. The
18+ audience decision is already made; target, content-rating and minor-access
settings are operator checks, not facts about the data-flow matrix. Artifact
manifest/speech evidence is a separate artifact/runtime question.

## 5. Remaining blockers

1. **V1 declaration:** the Console track/version inventory is the remaining
   Console fact; the actual V1 artifact manifest and speech/TTS provider
   evidence are separate artifact/runtime checks. Do not submit a V2-only form
   while V1 is distributed.
2. **Global encryption:** not final until all applicable V1 speech/TTS paths
   and all current distributed versions are covered.
3. **IP/network metadata:** classify only with the actual Play definitions and
   legal/Play guidance; do not guess a data type.
4. **Sharing:** the conservative V2 answer is Yes for location and search;
   a No answer requires a documented user-initiated-action/prominent-disclosure
   exception and legal review.
5. **High-latitude area definition:** implemented and source/test verified by
   the latitude-aware longitude step and pole-safe clamp; the release artifact
   still needs build-time verification.
6. **Deletion:** no dedicated mechanism; clearing local storage does not delete
   Open-Meteo records.
7. **Public policy deployment:** the public URL still rendered the 11 September
   2026 policy; the current V2 source policy has not been published.
8. **Speech evidence:** the V2 source/data-flow review and regression tests
   establish that audio/transcript content is not sent to network clients,
   analytics, telemetry or persisted history. Packet capture is not a
   standalone release gate; no universal zero-traffic claim is made. Live
   microphone/accuracy/latency behaviour remains a device-quality check.
9. **Console:** target audience, content rating and Data Safety were not edited.
   The owner-selected 18+ target is a preparation decision; no age gate or
   Restrict Minor Access is verified in this app.
10. **UK/Open-Meteo:** the proportionate UK assessment records no specific
    unmet control; the Open-Meteo child-directed-use assessment is a specific
    provider item only if the audience changes. Selecting 18+ is not a legal
    conclusion or a technical access control.
11. **Artifact alignment:** local debug Android artifacts contain old policy
    wording; the public policy routes were still old at the last check. A new
    Android bundle and authorised policy deployment are required for release.

## 6. Evidence references

- V2 network: `artifacts/weather-app/src/lib/weather.ts`,
  `src/lib/locality-load.ts`, `public/sw.js`,
  `src/lib/network-boundary.test.ts`, `capacitor.config.ts`
- V2 location: `src/lib/location-privacy.ts`, `src/App.tsx`,
  `src/lib/location-privacy.test.ts`, `tests/e2e/app.spec.ts`,
  `android/app/src/main/AndroidManifest.xml`
- V2 search: `src/lib/weather.ts` (`searchPlaces`),
  `src/components/weather/LocationSearch.tsx`
- V2 voice: `src/lib/speech-engine.ts`, `speech-router.ts`,
  `src/hooks/use-daymark-speech.ts`, `src/hooks/use-speech-recognition.ts`,
  `android/daymark-voice/.../ParakeetSpeechRecognitionPlugin.java`,
  `android/app/src/main/java/.../MainActivity.java`
- V2 storage: `src/lib/i18n.ts`, `src/lib/storage-surface.test.ts`,
  `android/daymark-voice/.../ParakeetSpeechRecognitionPlugin.java`
- V1 source: `git show main:...` and `git show 69e21c:...` for `App.tsx`,
  `AndroidManifest.xml`, `use-speech-recognition.ts`,
  `use-daymark-speech.ts`, `SystemSpeechPlugin.java`, `weather.ts`;
  `main` tip `44fd211`; physical-test source `69e21c`.
- Open-Meteo Terms & Privacy: <https://open-meteo.com/en/terms>
- Official Play Console Help links in §1.

No Play Console edit, provider contact, commit, deployment or policy
publication was made.
