# Daymark V2 — behaviour, policy and Play declaration reconciliation

**Status: DRAFT for release-owner and legal review. Not published. Not a Play Console submission.**
No privacy page, runtime source, Play Console declaration, website or release artifact was changed by this audit.

- **V2 line audited:** `release/v2-integrity` at `8611672` (three commits on top of V2 `ee04449`; the V2 branch is also present as `v2/privacy-hardened-voice`). The candidate artifact was rebuilt from this content and inspected; see the merged-manifest note below.
- **V1 baseline:** the repository's own data-safety record names the released 1.0.0 source as `main` at `50194e8` (`docs/release/data-safety-v1-v2.md:7-10`). V1 line numbers below are from that commit, not from the V2 worktree.
- **Public Play state:** the public Data safety page was read again on 22 October 2026; it still says **No data shared with third parties**, collects **Approximate location**, **Voice or sound recordings** and **In-app search history** (all Optional / App functionality), **encrypted in transit**, and **data can't be deleted**. The same state was recorded on 21 October 2026 in `docs/release/data-safety-v1-v2.md:19-32`.
- **Device/APK inspection scope:** no live Play device was used for packet capture. The candidate AAB's merged base manifest was inspected locally with `bundletool` (debug-signed structural build, 22 Oct 2026): `ACCESS_COARSE_LOCATION` only, no `ACCESS_FINE_LOCATION`, versionCode 2 / versionName 2.0.0, minSdk 24 / targetSdk 36. Production-signing continuity and the Play-signed artifact remain unverified.
- **Worktree state:** the audited candidate is clean at `8611672`. The model-integrity commits add no network speech path or user-data persistence. The candidate release AAB was built from this content and inspected with `bundletool`; the base module declares `ACCESS_COARSE_LOCATION` only.

Evidence labels used below:

- **CONFIRMED** — directly visible in source, manifest, build configuration or the public Play page.
- **INFERENCE** — follows from the platform/architecture but is not proven by a device or provider document.
- **UNVERIFIED** — cannot be established from this repository; a device test, packet capture, Console export or provider term is required.

The central finding is that the live Play form is not consistent with either a V1-only or a V2-only distribution:

- If **V1 is still distributed**, the form is missing **Precise location** (V1 declares `ACCESS_FINE_LOCATION` and sends a two-decimal cell below Play's 3 km² threshold).
- If **only V2 is distributed**, the form is over-declaring **Voice or sound recordings** (V2 Android uses on-device Parakeet), while still not resolving **Shared = No** for Open-Meteo.
- If **both** are distributed, Play's multi-version "sum" rule requires both location types and audio until V1 is gone; the form declares only one location type.
- In every reading, **"No data shared"** depends on a legal exception analysis that is not recorded in the repository or the public form.

---

## 0. Minimal evidence-backed amendments (EN/FR/ES)

**Scope note.** No P2/P3/P4 note files were present in this workspace; every claim below was re-verified directly against the shipped source and the V2 candidate. Proposed texts are drafts only; they are **not** applied to `src/pages/privacy*.tsx` and nothing is published. Legal decisions are flagged inline.

Each amendment uses the evidence labels from §0 of the original draft: **CONFIRMED** (source/manifest/build/public Play page), **INFERENCE** (follows from platform/architecture), **UNVERIFIED** (needs device/provider/Console proof). File:line references are to the V2 tree at `release/v2-integrity` unless marked `main@50194e8`.

### A1 — Opening paragraph: "runs entirely" (EN/FR/ES)
- **Files:** `privacy.tsx:26-29`, `privacy-fr.tsx:24-28`, `privacy-es.tsx:24-28`.
- **Current (EN):** "Daymark is a weather app that runs entirely in your browser or installed app."
- **Proposed (EN):** "Daymark is a weather app whose app logic runs in your browser or installed app. Daymark does not operate a backend, account system, or database of its own. To show weather, air quality, and place suggestions, the app sends requests directly from your device to Open-Meteo, as described below."
- **Proposed (FR):** "Daymark est une application météo dont la logique s'exécute dans votre navigateur ou dans l'application installée. Daymark n'exploite pas de backend, de compte utilisateur ni de base de données propres. Pour afficher la météo, la qualité de l'air et les suggestions de lieux, l'application envoie des requêtes directement depuis votre appareil vers Open-Meteo, comme décrit ci-dessous."
- **Proposed (ES):** "Daymark es una aplicación del tiempo cuya lógica se ejecuta en tu navegador o en la aplicación instalada. Daymark no opera un backend, un sistema de cuentas ni una base de datos propios. Para mostrar el tiempo, la calidad del aire y las sugerencias de lugares, la aplicación envía solicitudes directamente desde tu dispositivo a Open-Meteo, como se describe a continuación."
- **Why:** weather/air-quality/geocoding requests leave the device (`weather.ts:15-17, 232-263, 307-329`). "Of its own" keeps the true no-Daymark-backend fact (`README.md:11, 67`).
- **Strength:** CONFIRMED. **Legal decision?** No (wording only).

### A2 — "no backend" vs "no data shared" distinction (EN/FR/ES)
- **Files:** `privacy.tsx:51, 80-84`, `privacy-fr.tsx:51, 90-95`, `privacy-es.tsx:51, 89-94`; `README.md:67`; `SECURITY.md:27`.
- **Proposed addition to the "short version" bullets:** keep "no user accounts or database, and does not operate its own backend or application server" but add "Daymark does not operate a backend, but third-party services (Open-Meteo; browser speech on web; Android system TTS for French/Spanish) do receive data you send them, as described below."
- **Why:** "no backend" is an infrastructure claim; "no data shared" is a legal Play answer that the data flows do not support without an exception analysis (`data-safety-v1-v2.md:174-179, 256-258`).
- **Strength:** CONFIRMED for flows; **legal decision** for the Play "Shared" answer.

### A3 — Device location (EN/FR/ES)
- **Files:** `privacy.tsx:92-101`, `privacy-fr.tsx:103-113`, `privacy-es.tsx:101-110`; `location-privacy.ts:13-57`; `App.tsx:90-149`; `storage-surface.test.ts:41-64`.
- **Android:** OS approximate fix used unchanged; Daymark does not round it. Add: "**Android, not Daymark, determines the approximate estimate.**" (INFERENCE→CONFIRMED by code path `location-privacy.ts:48-57`).
- **Web/PWA:** 0.025° grid (≈2.8 km N/S, ≈1.7 km E/W, ≈4.8 km² near London; <3 km² above ≈67° latitude). Add the area figure.
- **No persistence:** only `daymark.locale` persists (`storage-surface.test.ts:41-64`); device location/search/transcript/weather are memory-only; web/PWA caches only the locality dataset and app shell (`sw.js:5-8, 51-57`).
- **Provider retention:** Open-Meteo logs may contain coordinates; deleted after 90 days (`weather.ts:232-249`; `privacy.tsx:130-134`).
- **Strength:** CONFIRMED for code/persistence; UNVERIFIED for the Play "Approximate" classification and for the actual coordinate sent (needs device capture). **Legal/technical decision** for the Play declaration.

### A4 — Search-selected places (EN/FR/ES)
- **Files:** `privacy.tsx:111-116`, `privacy-fr.tsx:124-129`, `privacy-es.tsx:120-125`; `weather.ts:232-249, 307-329`; `LocationSearch.tsx:9, 31-79`; `storage-surface.test.ts:7-18`.
- **Wording to keep/add:** typed query goes to `geocoding-api.open-meteo.com`; selecting a result sends that place's **published** latitude/longitude (not the device location, not coarsened); no search history is persisted (query lives in component state, cleared on selection).
- **Strength:** CONFIRMED. **Legal decision?** No for the fact; the Play "In-app search history = Yes/Shared" answer is a **legal decision**.

### A5 — Voice input (EN/FR/ES)
- **Files:** `privacy.tsx:142-158`, `privacy-fr.tsx:158-175`, `privacy-es.tsx:153-169`; `use-speech-recognition.ts:24-36`; `voice-input-native.ts:26-32`; `ParakeetSpeechRecognitionPlugin.java:39-55, 327-436, 491-515`; `voice-input-browser.ts:9-13`.
- **Android (V2):** Parakeet TDT 0.6B v3 int8 via sherpa-onnx, on-device; no `SpeechRecognizer`, no Web Speech, no remote recogniser, no fallback; if the model is unavailable, an explicit error is reported (`voice-input-native.ts:164-197`; plugin `:491-515`). Recording/decoding/payload are memory-only; no audio or transcript is logged.
- **Overclaim to remove:** "recognition runs entirely on your device" → replace with source-verifiable facts; do **not** claim packet-level zero egress. Status: CONFIRMED at source level; **UNVERIFIED at packet/device level** (gates open: `version-2-privacy-hardening.md:165-171, 205-209`).
- **Web/PWA:** browser `SpeechRecognition`/`webkitSpeechRecognition`; provider may process audio remotely; Daymark does not receive/store audio; transcript in memory only. Add: "The browser or platform provider may retain audio or transcripts under its own policy; Daymark cannot see or delete a copy held by that provider." (INFERENCE; legal review recommended.)
- **Strength:** CONFIRMED (source) + UNVERIFIED (packet). **Legal decision?** No for wording; Play "Voice or sound recordings" answer is a **legal/technical decision** (and must not merge web speech into the Android answer).

### A6 — Narration (EN/FR/ES)
- **Files:** `privacy.tsx:160-171`, `privacy-fr.tsx:177-189`, `privacy-es.tsx:171-183`; `speech-engine.ts:4-9, 29-50`; `speech-router.ts:129-171`; `SystemSpeechPlugin.java:145-171, 178-215`; `voice-browser.ts:9-11`.
- **EN:** Kokoro on-device; if native synthesis fails, no fallback to system TTS, explicit error (`speech-router.ts:146-158`).
- **FR/ES (Android):** only an installed voice with `isNetworkConnectionRequired()==false` is selected; voices flagged `KEY_FEATURE_NOT_INSTALLED` are skipped; otherwise explicit `system-tts-offline-unavailable` → UI `offline-voice-unavailable` (`SystemSpeechPlugin.java:145-171, 178-215`; `use-daymark-speech.ts:28-40`). No network-voice fallback.
- **Web/PWA:** browser `speechSynthesis`; voice may be local or remote. Remove the internal "no cloud TTS" comment (`voice-browser.ts:9-11`) — it overclaims; the policy wording is already correct.
- **Proposed addition:** "The text-to-speech engine is a separate app component, which may be supplied by your device manufacturer or Google; its own privacy policy applies." (INFERENCE for vendor; CONFIRMED for the handoff.)
- **Strength:** CONFIRMED (code) + INFERENCE (vendor). **Legal decision?** Yes — whether narration text counts as user data / sharing to the OS TTS engine.

### A7 — Weather/geocoding and hosting (EN/FR/ES)
- **Files:** `privacy.tsx:118-135, 190-214`, `privacy-fr.tsx:131-151, 210-236`, `privacy-es.tsx:127-146, 204-229`; `weather.ts:15-17, 232-249, 279-299, 307-319`; `public/_headers`; `vite.config.ts:50-52`; `locality.ts:16-18`; `locality-load.ts:2-31`.
- **Hosts:** `api.open-meteo.com` (forecast + micro-climate), `air-quality-api.open-meteo.com`, `geocoding-api.open-meteo.com`. Place search sends `name`, `count=8`, `language`, `format=json` (`weather.ts:307-319`).
- **Open-Meteo:** free-API troubleshooting logs may contain coordinates; deleted after 90 days (`privacy.tsx:130-134`).
- **Cloudflare Pages:** static host for web/PWA only; processes standard request metadata (IP, URL, user agent) under its own policy (`privacy.tsx:204-209`). Android assets are local; Cloudflare is not an Android runtime flow.
- **GeoNames:** static dataset; no runtime transfer; lookup runs on device (`locality.ts:16-18`; `src/workers/locality.worker.ts:1-6`).
- **Strength:** CONFIRMED (hosts/params/logs). Open-Meteo's independent-controller characterization is the provider's own statement (INFERENCE/UNVERIFIED). **Legal decision?** Yes — processor roles and "Shared".

### A8 — Retention and deletion (EN/FR/ES)
- **Files:** `privacy.tsx:238-244, 273-283`, `privacy-fr.tsx:262-270, 302-315`, `privacy-es.tsx:253-260, 291-304`; `storage-surface.test.ts:7-18, 41-64`; `data-safety-v1-v2.md:160-170`.
- **Proposed addition (EN):** "Because Daymark has no account or server-side store, there is no Daymark-held account data to delete. You can clear the language preference and the app's local storage in your browser or device settings. Requests sent to Open-Meteo are retained under Open-Meteo's policy, and Daymark cannot delete Open-Meteo's logs. If you have a question or a deletion request, contact us at the address below and we will explain what we can and cannot do."
- **Strength:** CONFIRMED (Daymark-side facts); deletion process/wording is a **legal/product decision**. Do not imply Daymark can erase provider logs.

### A9 — Cookies / host metadata wording (EN/FR/ES)
- **Files:** `privacy.tsx:184`, `privacy-fr.tsx:203`, `privacy-es.tsx:197`; `storage-surface.test.ts:20, 57-64`.
- **Current (EN):** "Daymark does not use cookies …"; **(FR)** "Daymark n'utilise pas de cookies …"; **(ES)** "Daymark no usa cookies …".
- **Proposed (EN):** "Daymark does not set cookies …"; **(FR):** "Daymark ne dépose pas de cookies …"; **(ES):** "Daymark no establece cookies …" (app code sets none; host may process metadata under its own policy).
- **Strength:** CONFIRMED for app code; host behaviour UNVERIFIED. **Legal decision?** No (wording), but Cloudflare config check is an ops action.

### A10 — FR/ES translation fixes (FR/ES only)
- **Files:** `privacy-fr.tsx:196-200`, `privacy-es.tsx:190-194`.
- **Drift:** "pour les recherches hors ligne" / "para consultas sin conexión" implies offline place search. Forward place search is **not** offline; only the locality-name lookup is local (`src/workers/locality.worker.ts:1-6`; `version-2-privacy-hardening.md:75-94`).
- **Proposed FR:** "… dans Cache Storage pour la consultation locale du nom de la localité ; le service worker met séparément en cache les fichiers de l'application."
- **Proposed ES:** "… en Cache Storage para la consulta local del nombre de la localidad; el service worker guarda por separado los archivos de la aplicación."
- **Strength:** CONFIRMED (source). **Legal decision?** No.

### A11 — Third-party list additions (EN/FR/ES)
- **Files:** `privacy.tsx:190-214`, `privacy-fr.tsx:210-236`, `privacy-es.tsx:204-229`; `SystemSpeechPlugin.java:145-171`; `parakeet-assets/build.gradle:16-20`; `app/build.gradle:7-9`; `data-safety-v1-v2.md:164-165`.
- **Add bullets:**
  - "Your Android device's text-to-speech engine — only for French and Spanish narration in the Android app. Daymark selects a voice that does not require network access, but the engine is a separate app component and may be provided by your device manufacturer or Google." (INFERENCE for vendor; CONFIRMED for handoff.)
  - "Google Play — distributes the Android app and delivers the Parakeet model as an install-time asset pack. Google Play's own privacy policy applies to that distribution." (CONFIRMED for asset pack.)
  - In the Open-Meteo bullet: "Open-Meteo processes these requests on its own servers and describes itself as an independent data controller; its own privacy policy applies." (provider's own statement; not independently verified.)
- **Strength:** CONFIRMED/INFERENCE as noted. **Legal decision?** Yes — processor roles and "Shared".

### A12 — Security paragraph: HTTPS (EN/FR/ES)
- **Files:** `privacy.tsx:246-253`, `privacy-fr.tsx:272-280`, `privacy-es.tsx:262-270`; `weather.ts:15-17`; `public/_headers`; `vite.config.ts:50-52`.
- **Proposed addition:** "Requests to Open-Meteo use HTTPS." (CONFIRMED for app-controlled requests; platform speech transport remains outside this statement.)
- **Strength:** CONFIRMED (app-controlled). **Legal decision?** No.

---

## 1. Behaviour inventory

### 1.1 Permissions actually declared

| Line | V1 1.0.0 (`main@50194e8`) | V2 (`HEAD ee04449`) |
|---|---|---|
| `INTERNET` | Yes — `android/app/src/main/AndroidManifest.xml:50` | Yes — `android/app/src/main/AndroidManifest.xml:59` |
| `ACCESS_COARSE_LOCATION` | Yes — `:52` | Yes — `:61` |
| `ACCESS_FINE_LOCATION` | **Yes** — `:53` | **No** — absent from the source manifest; the permission test forbids it (`src/lib/android-manifest-permissions.test.ts:71-77`) |
| `RECORD_AUDIO` | Yes — `:55` | Yes — `:63` |
| `MODIFY_AUDIO_SETTINGS` | Yes — `:57` | Yes — `:65` |
| Package-visibility `<queries>` | None | `RecognitionService` and `TTS_SERVICE` — `:4-11` |
| `allowBackup` | `false` — `:5` | `false` — `:14` |

The V1 build file at `50194e8` is `versionCode 1` / `versionName "1.0.0"` (`main@50194e8:android/app/build.gradle:10-11`); V2 HEAD is `versionCode 2` / `versionName "2.0.0"` (`android/app/build.gradle:15-16`).

**V1 precise-location accounting.** The released line declares both coarse and fine location. Its `findMe()` rounds the received fix to two decimal places before any request (`main@50194e8:src/App.tsx:101-106`). A 0.01° latitude cell is about 1.11 km; a 0.01° longitude cell is about 1.11 × cos(latitude) km. The cell area is therefore about **1.23 × cos(latitude) km²**, at most ~1.23 km² and about 0.77 km² near London — always below Play's 3 km² threshold. Play's own definition treats `ACCESS_FINE_LOCATION` and sub-3 km² location as **Precise** (`docs/release/data-safety-v1-v2.md:128-131`). So V1 is **Precise location**, not Approximate-only, even though the app rounds before transmission.

**V2 coarse-only accounting.** The source manifest declares `ACCESS_COARSE_LOCATION` only (`:61`) and no `ACCESS_FINE_LOCATION`. `resolveDeviceLocation(..., isAndroidNative=true)` returns the OS fix unchanged (`src/lib/location-privacy.ts:48-57`), so the intended Android path sends the OS approximate fix. The permission test reads the **source** manifest, not the merged manifest (`src/lib/android-manifest-permissions.test.ts:15-20`). **Verified against the candidate AAB** (debug-signed structural build, `bundletool dump manifest --module=base`, 22 Oct 2026): the merged base manifest declares `ACCESS_COARSE_LOCATION` and **no** `ACCESS_FINE_LOCATION`; versionCode 2 / versionName 2.0.0; minSdk 24 / targetSdk 36. This closes the documentation contradiction between `data-safety-v1-v2.md:85` and `version-2-privacy-hardening.md:213-216`. Production-signing continuity remains unverified and is a separate gate.

**V1 vs V2 in one line.** V1 = `COARSE + FINE`, then two-decimal rounding; V2 = source manifest `COARSE` only, OS approximate fix unchanged. The first is Play Precise; the second is intended Play Approximate.

### 1.2 Location: what is obtained, coarsened, persisted and sent

**Device location (explicit action only).**

- The app opens on London and does not request geolocation on load (`src/App.tsx:151-154`; default place at `:40`).
- `findMe()` calls `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: false`, `maximumAge: 300000`, `timeout: 12000` (`src/App.tsx:103, 141-148`).
- V2 decides the outgoing coordinate in `resolveDeviceLocation`:
  - Android native: returns `{ latitude, longitude }` unchanged (`src/lib/location-privacy.ts:56`).
  - Every other platform: `roundDeviceLocation` snaps to `DEVICE_LOCATION_GRID_DEGREES = 0.025`, then rounds to three decimals (`:13, 26-32`).
- The comment and code describe the web/PWA grid as about 2.8 km north/south and 1.7 km east/west near London, roughly 4.8 km² (`src/lib/location-privacy.ts:1-12`; `src/App.tsx:104-108`). At latitude φ the cell area is about **7.75 × cos(φ) km²**; it falls below 3 km² above roughly **67° latitude**. So the 0.025° grid is Approximate at UK latitudes, but it is not a universal Approximate guarantee. That matters only if the web/PWA flow is ever packaged in a Play artifact; it is not a Play-distributed artifact today.
- The coordinate is passed to `loadWeather` (`src/App.tsx:122`) and then to `fetchWeather` (`src/lib/weather.ts:232-263`). Forecast and air-quality requests both carry `latitude` and `longitude` (`:233-249`). No other host receives the device coordinate from the app.
- The nearby locality name is resolved **locally** from a static GeoNames dataset (`src/App.tsx:124`; `src/lib/locality.ts:16-18`; `src/workers/locality.worker.ts:1-6`). The web/PWA dataset is fetched from the app's own origin and cached; the Android dataset is bundled (`src/lib/locality-load.ts:2-31`; `src/pages/privacy.tsx:102-108`). No reverse-geocoding request is made.

**Search-selected place (not device location).**

- Typed text goes to `geocoding-api.open-meteo.com/v1/search` with `name`, `count`, `language`, `format` (`src/lib/weather.ts:307-319`). The input is debounced 250 ms and aborts stale requests (`src/components/weather/LocationSearch.tsx:9, 31-63`).
- Selecting a result sends that place's published latitude/longitude to the forecast and air-quality endpoints (`src/lib/weather.ts:232-249`; `src/App.tsx:75-81`). These are **place coordinates**, not the user's device location, and they are not coarsened. The privacy policy correctly distinguishes "the text you type" from device location (`src/pages/privacy.tsx:55-59, 111-116`).
- No search history is persisted. The query lives in component state and is cleared on selection (`src/components/weather/LocationSearch.tsx:73-79`); `storage-surface.test.ts:7-18, 42-64` permits only `daymark.locale`.

**Persistence.** Device location, selected place, weather payload, search text, transcript and exchange exist in React state/memory only. The only intentional persistent preference is `daymark.locale` (`src/lib/i18n.ts:46-56`; `src/lib/storage-surface.test.ts:41-64`). The web/PWA caches the static locality dataset and the app shell; it does not cache weather or air-quality responses (`public/sw.js:5-8, 51-57`; `src/pages/privacy.tsx:173-188`). The Android app loads the locality dataset from bundled assets (`src/pages/privacy.tsx:178-181`).

**Hosts.** `api.open-meteo.com` (forecast, including the micro-climate forecast), `air-quality-api.open-meteo.com` (air quality), `geocoding-api.open-meteo.com` (place search) — `src/lib/weather.ts:15-17`. The web/PWA is served by Cloudflare Pages; Android assets are local. The CSP limits `connect-src` to the app origin and those three Open-Meteo hosts (`public/_headers`; `vite.config.ts:50-52`).

### 1.3 Speech recognition: Android vs web/PWA, V1 vs V2

**V2 Android — on-device Parakeet/sherpa-onnx.**

- `useSpeechRecognition` selects `createParakeetRecognitionController()` when `Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'`; every other platform gets the browser controller (`src/hooks/use-speech-recognition.ts:24-36`).
- The native controller is registered as `ParakeetSpeechRecognition`; the module comment says the path runs Parakeet TDT 0.6B v3 int8 through sherpa-onnx "entirely on the device" with "no Android `SpeechRecognizer` ... and no remote recogniser" (`src/lib/voice-input-native.ts:26-32`).
- The Java plugin repeats that there is no Android recogniser, no Web Speech and no remote recogniser, and says recording/decoding/payload are memory-only with no audio or transcript logging (`HEAD:.../ParakeetSpeechRecognitionPlugin.java:39-55`).
- Capture is `AudioRecord` at 16 kHz mono into an in-memory `SampleBuffer`; it decodes and posts the transcript through `notifyListeners("result", ...)`, then clears the buffer (`HEAD:.../ParakeetSpeechRecognitionPlugin.java:327-436`). A search of the committed Java source finds no `java.net`, HTTP client or socket use in the voice plugins.
- If the model is missing/unusable, the session fails with an explicit error; there is no fallback branch (`src/lib/voice-input-native.ts:164-197`; `HEAD:.../ParakeetSpeechRecognitionPlugin.java:491-515`). The plugin's `isAvailable()` reports `model-missing`, `model-preparing` or `runtime-unavailable` rather than claiming availability (`HEAD:.../ParakeetSpeechRecognitionPlugin.java:118-126`).

**Android V1 — WebView browser speech.**

- V1 `useSpeechRecognition` always creates `createBrowserRecognitionController()`; there is no native branch (`main@50194e8:src/hooks/use-speech-recognition.ts:10-13`).
- V1's manifest comment says "Web Speech Recognition in the WebView" (`main@50194e8:android/app/src/main/AndroidManifest.xml:54`).
- The browser adapter explicitly says the browser or platform may process speech with its own, possibly remote, implementation and that Daymark makes no on-device guarantee (`src/lib/voice-input-browser.ts:9-13`). The repo's readiness doc says the tested WebView had the API and warns that if it delegates to the Google speech service, audio may leave the device (`docs/release/android-production-readiness.md:251-262`).

**The Android system speech plugin is not a recognition path.**

- `SystemSpeechPlugin` exposes only `isAvailable`, `speak`, `stop`, `isSpeaking` (`HEAD:.../SystemSpeechPlugin.java:75-121`). It is used only as the non-Kokoro TTS fallback on Android (`src/lib/speech-adapters.ts:3-19`; `src/hooks/use-daymark-speech.ts:28-47`).
- There is no `android.speech.SpeechRecognizer` or `createSpeechRecognizer` in the Android source; the only occurrence is a comment in the Parakeet plugin (`HEAD:.../ParakeetSpeechRecognitionPlugin.java:44`). The source test pins that absence (`src/lib/android-voice-implementation.test.ts:38-43`).
- The V2 manifest still has a `<queries>` entry for `android.speech.RecognitionService` (`android/app/src/main/AndroidManifest.xml:4-7`), but nothing uses it. It is dead package-visibility configuration, not evidence of a recogniser. V1 had no `<queries>` at all (`main@50194e8:...AndroidManifest.xml:1-57`).

**Web/PWA — browser vendor may process audio remotely.**

- The adapter uses `window.SpeechRecognition ?? window.webkitSpeechRecognition` (`src/lib/voice-input-browser.ts:69-77`) and starts a single-shot session with `continuous=false`, `interimResults=false`, `maxAlternatives=1` (`:164-167`).
- The header comment is the key quote: "The browser or platform may process speech with its own (possibly remote) implementation, so Daymark makes no on-device-processing guarantee" (`:9-13`).
- Which provider the browser/WebView uses, whether it is on-device, and its retention are **not documented in this repository**. They are device/browser properties, not app code (`UNVERIFIED`). The repo's own doc classifies V1 as "device-dependent and potentially cloud-dependent" (`docs/release/android-production-readiness.md:258-262`).

**Transcript handling.** The transcript is passed to the caller, normalized, resolved to a deterministic intent and shown as the latest exchange; only the latest exchange is kept in React state, with no history, storage or logging (`src/components/weather/AskDaymark.tsx:10, 20, 61-79`). The native plugin holds it in memory and does not log it (`HEAD:.../ParakeetSpeechRecognitionPlugin.java:49-50`). The browser adapter says it does not log or store it (`src/lib/voice-input-browser.ts:5-7`).

### 1.4 Narration

- **Android English:** Kokoro on-device through `DaymarkVoice`/JNI. `speech-engine.ts` selects `kokoro` only on Android, for English, when the native plugin reports available (`src/lib/speech-engine.ts:4-9, 29-50`). If native synthesis fails for English, the router does **not** fall back to system TTS; it reports an error (`src/lib/speech-router.ts:146-158`). This is a local-only design.
- **Android French/Spanish:** the router's non-Kokoro path goes to the fallback adapter (`src/lib/speech-router.ts:164-171`); on Android the fallback is `SystemSpeech` (`src/lib/speech-adapters.ts:10-19`). V2's `SystemSpeechPlugin` selects only a voice for which `Voice.isNetworkConnectionRequired()` is false, skips voices flagged `KEY_FEATURE_NOT_INSTALLED`, and rejects with `system-tts-offline-unavailable` if none exists (`HEAD:.../SystemSpeechPlugin.java:145-171, 178-215`). The UI maps that to `offline-voice-unavailable` (`src/hooks/use-daymark-speech.ts:28-40`).
- **V1 French/Spanish:** the V1 plugin called `tts.setLanguage(...)` and then `tts.speak(...)` using the engine's default voice, with no `isNetworkConnectionRequired()` gate (`main@50194e8:.../SystemSpeechPlugin.java:133-141`). The default voice could require network. V1's policy says only "Android system text-to-speech" and that providers manage processing; it does not explicitly warn that the default voice may use the network (`main@50194e8:src/pages/privacy.tsx:116-123`). The V2 source page adds that warning only in the V1 version note (`src/pages/privacy.tsx:33-40`), which is not live.
- **Web/PWA:** browser `speechSynthesis`; the voice may be local or remote (`src/lib/voice-browser.ts:9-11`; `src/pages/privacy.tsx:167-170`). The code comment "no cloud TTS" (`voice-browser.ts:10`) is an overclaim about the API: the app does not call a cloud TTS service, but the browser may select a remote voice. Do not publish the comment's wording.
- **Narration text:** app-generated briefing text, never persisted (`src/pages/privacy.tsx:169-170, 238-243`). On Android, the text is handed to another app component (system TTS) for FR/ES; on web it is handed to the browser's speech engine. Whether that handoff is "sharing" under Play is a legal question (see §4.3).

### 1.5 Weather and geocoding requests: parameters, caching, retention

| Flow | Host | Parameters | App-side cache | Provider-side retention |
|---|---|---|---|---|
| Forecast | `api.open-meteo.com/v1/forecast` | `latitude`, `longitude`, `current`, `hourly`, `daily`, `forecast_days=7`, `timezone=auto` (`src/lib/weather.ts:232-241`) | None; state only | Open-Meteo says free-API logs may contain coordinates and are deleted after 90 days (`src/pages/privacy.tsx:130-134`; `docs/release/data-safety-v1-v2.md:160-170`) |
| Air quality | `air-quality-api.open-meteo.com/v1/air-quality` | `latitude`, `longitude`, `current`, `hourly`, `forecast_days=3`, `timezone=auto` (`:242-249`) | None | Same provider policy; not independently verified |
| Micro-climate | `api.open-meteo.com/v1/forecast` | `latitude`, `longitude`, `current=temperature_2m,precipitation`, `forecast_days=1`, `models=ukmo_seamless`, `timezone=auto` (`:279-299`) | In-memory `Map`, 15 min, key lat/lon to 3 dp (`:166-167, 280-282`) | Same provider policy |
| Place search | `geocoding-api.open-meteo.com/v1/search` | `name` (typed text), `count=8`, `language`, `format=json` (`:307-319`) | None | Same provider policy; query appears in request/log data |
| Locality dataset | app origin (`daymark-weather.pages.dev` on web/PWA) | static file URL, no coordinates (`src/lib/locality.ts:16-18`) | Cache Storage on web/PWA; bundled on Android | Cloudflare/host metadata only; no coordinates sent to GeoNames |

The service worker only intercepts same-origin requests; Open-Meteo is explicitly network-only (`public/sw.js:51-57`). No weather or air-quality response is cached by the app or service worker (`docs/release/android-production-readiness.md:360-375`; `README.md:95`).

### 1.6 Logging, analytics and crash reporting — negative findings

- **No analytics/ad/crash SDK in the web app.** Runtime dependencies include Capacitor, React, Radix toast, `clsx`, `lucide-react`, `tailwind-merge`, `wouter`, `zod` (`artifacts/weather-app/package.json:20-33`). A repository search for Sentry/Firebase/Crashlytics/PostHog/Mixpanel/Amplitude/Segment/Datadog/Bugsnag/GA found no matching production dependency or source import.
- **No analytics/ad/crash SDK in Android.** `app/build.gradle` dependencies are AndroidX, Capacitor, `daymark-voice`, `webkit` and test libraries (`android/app/build.gradle:64-75`); `daymark-voice` adds only the sherpa AAR (`android/daymark-voice/build.gradle:24-33`). There is no `google-services.json`; the conditional Google Services plugin block is inert (`android/app/build.gradle:112-118`). No `AD_ID` permission is declared.
- **No transcript/audio/location logging found.** Android logs in the Kokoro and Parakeet paths contain timings, segment counts, chunk counts, PSS and failure messages, not transcript or audio content (`HEAD:.../KokoroLocalTtsEngine.java:86-106, 211-246, 316-470`; `HEAD:.../ParakeetSpeechRecognitionPlugin.java:491-515`). The web uses `console.error` in the error boundary and dev-only weather warnings; the speech router warns on synthesis failure with an error object, not the spoken text (`src/lib/speech-router.ts:137, 155, 159`; `src/lib/weather.ts:211-216`). This is source inspection, not a runtime logcat audit.
- **Platform-level reporting is not app collection.** Android vitals/Play Console crash data is platform-level. The app contains no crash-reporting SDK and no code that uploads logs. Data safety "Diagnostics" should be answered No for the app, subject to Console confirmation.

### 1.7 Claims and what the evidence supports

| Claim | Where quoted | What the evidence supports | Assessment |
|---|---|---|---|
| "Android voice input ... runs entirely on the device ... audio is processed on the device rather than sent to a speech service" | `README.md:25` | Source shows Parakeet/sherpa-onnx, no `SpeechRecognizer`, no Web Speech, no remote recogniser, no fallback; audio in memory (`src/lib/voice-input-native.ts:26-32`; `HEAD:.../ParakeetSpeechRecognitionPlugin.java:39-55, 327-436`) | **Supported at source level; device/packet proof outstanding.** The repo's own gates say no packet capture and no independent transcript capture (`docs/release/version-2-privacy-hardening.md:165-171, 205-209`). |
| "recognition runs entirely on your device ... does not send your audio to a speech service or to any Daymark server" | `src/pages/privacy.tsx:143-147` | Same source evidence; no network client in the native voice path; no Daymark backend | **Supported at source level; packet-level "no egress" is UNVERIFIED.** Do not describe it as packet-proven. |
| "There is no Android recogniser, no Web Speech and no remote recogniser behind this plugin" | `HEAD:.../ParakeetSpeechRecognitionPlugin.java:43-47`; `SECURITY.md:33` | Source search finds no `SpeechRecognizer`/`createSpeechRecognizer`; only a comment. The manifest's `RecognitionService` query is unused | **Supported for code.** The query is dead config, not a recognition path. |
| "The browser or platform may process speech with its own (possibly remote) implementation" | `src/lib/voice-input-browser.ts:9-13` | The adapter calls the browser API and does not implement recognition; provider path is not in the repo | **Supported as a caveat; provider-specific behaviour UNVERIFIED.** |
| "No backend, no database, no server code — the repository ships static files only" | `README.md:67`; `SECURITY.md:27` | No Daymark-operated backend; static app; direct Open-Meteo calls | **Accurate for Daymark-operated infrastructure.** It does not mean no third-party processing. |
| "Daymark is a weather app that runs entirely in your browser or installed app" | `src/pages/privacy.tsx:27` | Weather, air-quality and place-search requests go to Open-Meteo; web speech/TTS may be remote | **Overbroad as written.** App logic is client-side, but processing is not entirely local. Revise. |
| "no cloud TTS" | `src/lib/voice-browser.ts:10` | The app calls only `window.speechSynthesis`; the browser may use a remote voice | **Internal comment overclaims.** The user-facing policy at `privacy.tsx:167-169` is correct. Fix the comment separately; do not publish the phrase. |
| "No data shared with third parties" | live Play Data safety page, 22 Oct 2026; `docs/release/data-safety-v1-v2.md:26` | Open-Meteo receives coordinates/typed queries; V1 platform speech may receive audio; Cloudflare sees web metadata; Android TTS is an app-to-app handoff | **Not an engineering fact; legal exception analysis required.** The conservative answer is Shared = Yes for location/search (and V1 audio). |
| "Data can't be deleted" | live Play Data safety page; `docs/release/data-safety-v1-v2.md:31-32` | No Daymark account/server store; locale clearable; Open-Meteo logs not deletable by Daymark | **Wording is ambiguous.** The app can offer local deletion and a contact process; provider logs remain outside its control. Legal review. |

---

## 2. Comparison table

Required columns: `Topic | Released V1 behaviour | Intended V2 behaviour | Evidence | Policy discrepancy | Play Console action`.

| Topic | Released V1 behaviour | Intended V2 behaviour | Evidence | Policy discrepancy | Play Console action |
|---|---|---|---|---|---|
| **Precise vs approximate location** | Declares `COARSE` + `FINE`; WebView may receive a precise fix; rounds to 2 dp before sending; cell <3 km² everywhere (≈0.77 km² London) → Play **Precise**. | Android source manifest `COARSE` only; OS approximate fix sent unchanged → intended Play **Approximate**. Web/PWA uses 0.025° grid (≈4.8 km² London; <3 km² above ~67° latitude). | V1 manifest `:52-53`; V1 `App.tsx:101-106`; V2 manifest `:61`; `location-privacy.ts:48-57`; Play threshold `data-safety-v1-v2.md:128-131`. | Live form declares **Approximate only**; V1 precise is not declared. V2 policy states approximate only; source-level, merged AAB unverified. | While V1 is on any distributed track, declare **both Approximate and Precise**. For V2-only, Approximate. Do not change until track contents are known. |
| **Device-location source and coarsening** | `navigator.geolocation` on explicit action; 2 dp rounding on all platforms; no persistence. | Android: OS approximate fix unchanged; web/PWA: 0.025° grid on device; no persistence. | `App.tsx:90-149`; `location-privacy.ts:13-57`; `storage-surface.test.ts:41-64`. | Policy describes both correctly; it does not state that Android chooses the approximation (rather than Daymark). | None directly; ensure policy wording matches the shipped build. |
| **Search-selected places** | Typed query to Open-Meteo geocoding; selected place's published lat/lon sent to forecast; no local history. | Unchanged. | `weather.ts:232-249, 307-329`; `LocationSearch.tsx:31-79`; `storage-surface.test.ts:7-18`. | Policy says text leaves device and searches are not saved — consistent. Search result coordinates are not device location. | Keep **In-app search history = Yes**; decide Shared (legal). Do not label the place's coordinates as the user's location. |
| **In-app search history** | Query text transmitted; no Daymark-side history. | Unchanged. | `weather.ts:313-319`; `LocationSearch.tsx:31-63`; `privacy.tsx:111-116`. | Live form includes it as Optional / App functionality; retention depends on Open-Meteo logs, not Daymark. | Keep **Collected = Yes**, **Optional = Yes**, **Purpose = App functionality**, **Ephemeral = No**; Shared legal. |
| **Audio / voice input** | Android uses WebView `SpeechRecognition`/`webkitSpeechRecognition`; provider may process audio remotely; no on-device guarantee. | Android uses Parakeet on-device; no `SpeechRecognizer`, Web Speech or remote fallback. Web/PWA unchanged (browser speech). | V1 `use-speech-recognition.ts:10-13`; `voice-input-browser.ts:9-13`; V2 `use-speech-recognition.ts:24-36`; `voice-input-native.ts:26-32`; Parakeet `:39-55, 327-436`. | Live form says Audio collected (correct for V1; over-declared for V2-only). V2 policy says on-device; source-level, packet proof open. | Keep **Voice or sound recordings = Yes** while V1 is distributed. For V2-only Android, change to **No** only after device verification. Never merge web into the Android answer. |
| **Transcripts** | Held in memory; latest Ask exchange only; no storage/logs. | Same, native path in memory only. | `AskDaymark.tsx:10, 20, 61-79`; `voice-input-browser.ts:5-7`; Parakeet `:49-50`; `storage-surface.test.ts:7-18`. | Policy accurate. Play has no separate transcript type; not declared. | None; keep no-storage regression tests. |
| **Narration / voice output** | English Kokoro local; FR/ES default system TTS, possibly network-backed; web browser speech synthesis (local or remote). | English Kokoro local; FR/ES only an installed voice with `isNetworkConnectionRequired()==false`, else explicit error; web unchanged. | `speech-engine.ts:29-50`; `speech-router.ts:129-171`; V1 `SystemSpeechPlugin.java:133-141`; V2 `SystemSpeechPlugin.java:145-171, 178-215`; `voice-browser.ts:9-11`. | V1 policy does not clearly warn FR/ES default voice may use network (version note only in V2 source, not live). V2 policy omits the TTS engine as a distinct third-party component. | Legal review whether narration text is user data / sharing to OS TTS. No Play data type unless it contains user data; document the analysis. |
| **Diagnostics / logs** | No app analytics/crash SDK; Android logcat local; web console local/dev-only. | Same. | `package.json:20-33`; `app/build.gradle:64-75, 112-118`; `KokoroLocalTtsEngine.java:86-106, 211-246`; `Parakeet...java:491-515`; `README.md:86`. | Policy says no analytics/telemetry; consistent. Play form does not declare Diagnostics. | Confirm no hidden SDK in final AAB; keep **Diagnostics = No** (platform vitals is not app collection). |
| **Analytics / ads** | No analytics, advertising or tracking SDK; no ad ID. | Same. | `package.json:20-33`; `app/build.gradle:64-75`; no `google-services.json`; no `AD_ID`. | Policy consistent. | **No ads; no advertising ID**; confirm existing Console answers. |
| **Data sharing** | Open-Meteo receives coordinates and typed queries; V1 platform speech may receive audio; Cloudflare sees web metadata; Android TTS is an app handoff. | Open-Meteo receives approximate coords and queries; Android speech stays on-device; web speech unchanged; Android TTS on-device. | `weather.ts` hosts/params; `voice-input-browser.ts:9-13`; `privacy.tsx:190-214`; `SystemSpeechPlugin.java:145-171`. | Live form says **No data shared**; this is an absolute that the data flows do not support without a legal exception. Open-Meteo describes itself as an independent controller and keeps logs up to 90 days (`data-safety-v1-v2.md:160-170`). | Legal decision: **No** only if user-initiated-action/service-provider exception is documented and accepted; otherwise **Shared = Yes** for location and search (and V1 audio). |
| **Data retention** | Daymark stores no location/search/transcript/weather history; locale persists; provider retention outside app. | Same; V2 adds no new persistence. | `storage-surface.test.ts:7-18, 41-64`; `weather.ts:166-167`; `privacy.tsx:238-244`; `data-safety-v1-v2.md:160-170`. | Policy says provider policies apply; live form says data can't be deleted. Policy has no deletion-request wording or process, only a general contact. | **Ephemeral = No** for location/search (provider logs). Deletion answer **No** with explanation; do not imply Daymark can erase Open-Meteo logs. |
| **Encryption in transit** | Open-Meteo HTTPS; web HSTS/CSP; Android URLs HTTPS; V1 platform speech transport unknown. | Open-Meteo HTTPS; Android no speech egress; web browser speech transport unknown. | `weather.ts:15-17`; `public/_headers`; `vite.config.ts:50-52`; `docs/release/data-safety-v1-v2.md:203-205`. | Live form says **Yes** globally; that is not proven for V1 platform speech. | Do not answer a blanket **Yes** unless the platform speech transport is confirmed; for V2-only Android, the app-controlled flows are HTTPS. Legal/technical sign-off. |
| **Deletion** | No account/server store; locale clearable; provider logs not deletable; live form says "can't be deleted". | Same. | `privacy.tsx:173-188, 273-283`; `data-safety-v1-v2.md:206`; `play-console-checklist.md:133-136`. | Policy lacks a deletion-request process (it has only a general contact); "can't be deleted" is ambiguous. | Decide the deletion-request answer and support process; match policy wording. Legal/product. |
| **Children** | General-audience weather utility; no accounts; public listing PEGI 3. | Same. | `privacy.tsx:264-271`; `data-safety-v1-v2.md:209-211`; public listing. | PEGI 3 is a content rating, not a target-audience determination. Policy says "not specifically designed for children." | Confirm target audience in Console; if it includes children, apply Families policy. Legal/Console. |
| **Third-party processors** | Open-Meteo, Cloudflare (web/PWA), browser speech (web and V1 Android), Android system TTS, GeoNames static data, Google Play distribution. | Open-Meteo, Cloudflare (web/PWA), browser speech (web), Android system TTS (FR/ES), GeoNames static data, Google Play distribution/asset pack. | `privacy.tsx:190-214`; `weather.ts:15-17`; `SystemSpeechPlugin.java:19-27`; `app/build.gradle:7-9`; `parakeet-assets/build.gradle:16-20`. | Policy lists most, but not the Android TTS engine as a separate app component or Google Play as distributor. The "browser speech service" bullet says Android does not contact a speech service; true for V2 but not V1 (version note covers V1). | Legal review of processor roles; no data-type change solely because of Google Play delivery. Add TTS/Play disclosures to policy. |
| **"No backend" claim** | Daymark operates no backend/database; app calls Open-Meteo directly; static host for web. | Same. | `README.md:11, 67`; `SECURITY.md:27`; `privacy.tsx:27, 51, 240-252`; `weather.ts`. | "No backend" is true for Daymark-operated infrastructure. "Runs entirely in your browser" (privacy.tsx:27) overstates because weather/geocoding/speech may be remote. | No Console action; revise policy sentence. Do not use "no backend" to answer "No data shared." |
| **Permissions / merged manifest** | V1 manifest `COARSE + FINE`; first AAB versionCode 1. | Source manifest `COARSE` only; versionCode 2. **Candidate AAB merged manifest verified: COARSE only, no FINE.** | V1 manifest `:52-53`; V2 manifest `:61`; `android-manifest-permissions.test.ts:15-20`; candidate AAB `bundletool dump manifest --module=base`. | Policy and candidate artifact agree on no FINE. Docs no longer contradict each other. | **Done for the candidate AAB.** Re-check the final Play-signed artifact after re-signing. |
| **Policy publication / version** | Live policy recorded as 11 September 2026 text; V1 source page effective 11 October 2026. | Source pages updated for 2.0.0 (effective 11 Oct, last updated 21 Oct); the candidate AAB bundles that text, but it is **not deployed** to the live site. | `main@50194e8:privacy.tsx:21`; `privacy.tsx:23`; `play-console-checklist.md:282-295`; `version-2...:240-250`. | V2 policy is ahead of the live site and the shipped AAB; effective date is not the publication date if deployed later. | Deploy EN/FR/ES, set actual effective date, rebuild AAB, verify bundled pages. |
| **Android system TTS / OS vendor** | Default system TTS voice; may require network; no explicit V1 warning. | Only installed offline voice; explicit failure if none; still a separate app component. | V1 `SystemSpeechPlugin.java:133-141`; V2 `:145-171, 178-215`; `privacy.tsx:162-170`; `data-safety-v1-v2.md:108`. | V1 policy gap (network possibility); V2 policy does not identify the engine vendor or its role. | Legal review of on-device app-to-app handoff; add processor disclosure. |
| **Web/PWA scope** | Browser speech recognition/synthesis; Cloudflare hosting; not a Play artifact. | Unchanged. | `privacy.tsx:150-157, 167-170, 204-209`; `docs/release/data-safety-v1-v2.md:71-73`. | Play answers must not merge web speech with Android; policy describes both. | Keep web/PWA out of the Play Data safety answer; it is a separate distribution. |
| **Cookies / IP metadata** | App code sets no cookies/sessionStorage/IndexedDB; Cloudflare/Open-Meteo see IP and request URL. | Same. | `storage-surface.test.ts:20, 57-64`; `privacy.tsx:184-188, 204-209`; `sw.js:51-57`. | "Daymark does not use cookies" is broader than "does not set cookies"; host may process metadata. | No data type change; ops check Cloudflare config; revise wording to "does not set cookies." |
| **Default forecast on open** | Loads London forecast on mount; no geolocation prompt. | Same. | `App.tsx:40, 151-154`; `privacy.tsx:55-59`. | Correctly disclosed as default place; London coordinates are not user location. | No location declaration for the default forecast. |

---

## 3. Draft policy revisions

**These are proposed texts only. Do not apply them to `src/pages/privacy*.tsx` in this audit.** They are written to remove overclaims and to make the policy match the evidence. Each has a status label and a rationale; legal review is required where marked.

### R1 — Opening paragraph (EN)

**Current:** `src/pages/privacy.tsx:26-29`

> Daymark is a weather app that runs entirely in your browser or installed app. This policy explains, in plain language, what information is involved when you use it.

**Proposed:**

> Daymark is a weather app whose app logic runs in your browser or installed app. Daymark does not operate a backend, account system, or database of its own. To show weather, air quality, and place suggestions, the app sends requests directly from your device to Open-Meteo, as described below. This policy explains what information is involved when you use Daymark.

**Why:** "Runs entirely in your browser or installed app" can be read as "no processing leaves the device." Weather, air-quality and geocoding requests do leave the device (`src/lib/weather.ts:15-17, 232-263, 307-329`). "Of its own" preserves the true no-Daymark-backend fact (`README.md:11, 67`).

**Status:** CONFIRMED (source and README).

### R2 — Device location paragraph (EN)

**Current:** `src/pages/privacy.tsx:92-101`

> In the installed Android app, Daymark requests approximate location only: it declares Android's ACCESS_COARSE_LOCATION permission and does not declare ACCESS_FINE_LOCATION. Daymark uses the approximate estimate returned by Android without further rounding. In the web/PWA version, the browser's device location is snapped on your device to a 0.025-degree grid (about 2.8 km north/south and 1.7 km east/west near London) before it is sent to Open-Meteo. This reduces precision; it does not anonymise the request. The approximate coordinates still leave your device and are sent to Open-Meteo. Daymark itself does not save your location, and the app returns to its default location when you reload or reopen it.

**Proposed replacement (add the two clarifications in bold):**

> In the installed Android app, Daymark requests approximate location only: it declares Android's ACCESS_COARSE_LOCATION permission and does not declare ACCESS_FINE_LOCATION. **Android, not Daymark, determines the approximate estimate.** Daymark uses the estimate returned by Android without further rounding. In the web/PWA version, the browser's device location is snapped on your device to a 0.025-degree grid (about 2.8 km north/south and 1.7 km east/west near London, **roughly 4.8 km²**) before it is sent to Open-Meteo. This reduces precision; it does not anonymise the request. The approximate coordinates still leave your device and are sent to Open-Meteo. Daymark itself does not save your location, and the app returns to its default location when you reload or reopen it.

**Why:** The source shows the Android path is a pass-through of the OS fix (`src/lib/location-privacy.ts:48-57`), while the web path performs the grid rounding (`:26-32`). The area figure is derived from the 0.025° cell and is consistent with the repo's own 4.8 km² estimate (`src/lib/location-privacy.ts:5-7`).

**Status:** CONFIRMED for the code path; the Play "Approximate" classification is a legal/technical determination, not a policy fact. Do not add a Play definition to the policy unless legal wants it.

**Optional release note (not policy text):** If the policy is used to explain the Play declaration, add: "The 1.0.0 two-decimal rounding produced an area smaller than Google Play treats as approximate location; 2.0.0 on Android requests approximate location only." This is supported by the math in §1.1 and the repo's own conclusion (`docs/release/data-safety-v1-v2.md:39-43`), but it is Play-facing language and needs legal review.

### R3 — Android voice input paragraph (EN)

**Current:** `src/pages/privacy.tsx:142-148`

> In the installed Android app, recognition runs entirely on your device: the Parakeet TDT 0.6B v3 speech model, bundled with the app, transcribes your speech locally through the sherpa-onnx runtime. Daymark does not send your audio to a speech service or to any Daymark server. The transcript is held in memory only; Daymark does not record or store your voice audio or speech transcripts.

**Proposed:**

> In the installed Android app, speech recognition is performed on your device by the Parakeet TDT 0.6B v3 model through the sherpa-onnx runtime. The Android voice code does not contain a network speech-recognition path, a platform speech recogniser, or a fallback to one; if the model is unavailable, Daymark reports that voice input is unavailable. Daymark does not send your audio to a Daymark server, and the transcript is held in memory only. Daymark does not record or store your voice audio or speech transcripts.

**Why:** This replaces the absolute "runs entirely" with specific, source-verifiable facts: no network recognition path, no `SpeechRecognizer`, no fallback (`src/lib/voice-input-native.ts:26-32`; `HEAD:.../ParakeetSpeechRecognitionPlugin.java:39-55, 491-515`). It still does **not** claim packet-level zero egress. If legal wants a shorter user-facing sentence, keep "on your device" and drop the absolute "entirely."

**Status:** CONFIRMED at source level; **UNVERIFIED at packet/device level**. The repo's gates for packet capture remain open (`docs/release/version-2-privacy-hardening.md:165-171, 205-209`).

### R4 — Web voice-input paragraph (EN)

**Current:** `src/pages/privacy.tsx:150-157`

> In the web/PWA app, voice recognition is handled by your browser's SpeechRecognition or webkitSpeechRecognition interface. Depending on your browser, operating system, and configuration, that service may send your audio to the browser or platform provider for processing, including a remote service. Daymark does not receive the audio; the browser returns a transcript to Daymark so it can answer the question, and Daymark holds that transcript in memory without storing it.

**Proposed addition at the end:**

> The browser or platform provider may retain audio or transcripts under its own policy; Daymark cannot see or delete a copy held by that provider.

**Why:** The adapter explicitly makes no on-device guarantee (`src/lib/voice-input-browser.ts:9-13`); provider retention is not documented in the repo. This wording is a cautious inference, not a claim about a specific provider.

**Status:** INFERENCE (provider-dependent); legal review recommended.

### R5 — Narration paragraph (EN)

**Current:** `src/pages/privacy.tsx:161-171`

> "Hear today" reads the briefing aloud. In the Android app, English narration is generated on your device by the bundled Kokoro model. French and Spanish use an installed Android system text-to-speech voice, and Daymark selects only a voice that does not require a network connection; the narration text is passed to that installed voice on your device. If no such offline voice is installed, Daymark reports that narration is unavailable instead of using a network voice or another speech service. In the web app, narration uses the browser's speech-synthesis API, which may use a local or remote voice depending on your browser and settings. Daymark does not operate a speech backend or store narration text.

**Proposed addition after "on your device":**

> The text-to-speech engine is a separate app component, which may be supplied by your device manufacturer or Google; its own privacy policy applies.

**Why:** On Android, `SystemSpeechPlugin` hands the text to the platform `TextToSpeech` service (`HEAD:.../SystemSpeechPlugin.java:145-171`). Which app provides that engine is device-dependent; the repo does not pin a vendor. This is a transparency improvement, not a new data flow.

**Status:** INFERENCE (vendor depends on device); CONFIRMED that the text is handed to the platform TTS component.

**Separate code-comment fix (not policy):** `src/lib/voice-browser.ts:9-11` says "no cloud TTS." That is too strong for the Web Speech API. The policy already says the browser may use a local or remote voice (`privacy.tsx:167-169`). Fix the comment in a code change; do not publish "no cloud TTS."

### R6 — Third-party services list (EN)

**Current:** `src/pages/privacy.tsx:190-214` lists Open-Meteo, GeoNames, browser speech, Cloudflare, Parakeet/sherpa.

**Proposed additions:**

> - **Your Android device's text-to-speech engine** — only for French and Spanish narration in the Android app. Daymark selects a voice that does not require network access, but the engine is a separate app component and may be provided by your device manufacturer or Google.
> - **Google Play** — distributes the Android app and delivers the Parakeet model as an install-time asset pack. Google Play's own privacy policy applies to that distribution.

And, in the Open-Meteo bullet, add:

> Open-Meteo processes these requests on its own servers and describes itself as an independent data controller; its own privacy policy applies.

**Why:** The TTS handoff is real (`HEAD:.../SystemSpeechPlugin.java:145-171`); the Parakeet model is an install-time Play asset pack (`android/parakeet-assets/build.gradle:16-20`; `android/app/build.gradle:7-9`). Open-Meteo's independent-controller wording is recorded in `docs/release/data-safety-v1-v2.md:164-165`.

**Status:** CONFIRMED for the asset pack and TTS handoff; INFERENCE for the specific TTS vendor; Open-Meteo characterization is the provider's own statement (not independently verified).

### R7 — Cookies wording (EN)

**Current:** `src/pages/privacy.tsx:184`

> Daymark does not use cookies, does not use browser session storage or IndexedDB...

**Proposed:**

> Daymark does not set cookies and does not use browser session storage or IndexedDB...

**Why:** The app code sets no cookies; `storage-surface.test.ts:20, 57-64` prohibits `document.cookie`, sessionStorage and IndexedDB. The web/PWA host may process request metadata under its own policy (`privacy.tsx:204-209`). "Does not set" is the app-level fact; "does not use" is broader than the evidence.

**Status:** CONFIRMED for app code; host behaviour UNVERIFIED.

### R8 — Retention and deletion paragraph (EN)

**Current:** `src/pages/privacy.tsx:238-244`

> Daymark has no accounts or database and does not operate its own backend or application server, so it does not retain your location, searches, voice audio, transcripts, or weather history. Your language preference stays on your device until you change it or clear storage. Third-party providers set their own retention periods; please see their policies.

**Proposed addition:**

> Because Daymark has no account or server-side store, there is no Daymark-held account data to delete. You can clear the language preference and the app's local storage in your browser or device settings. Requests sent to Open-Meteo are retained under Open-Meteo's policy, and Daymark cannot delete Open-Meteo's logs. If you have a question or a deletion request, contact us at the address below and we will explain what we can and cannot do.

**Why:** This aligns the policy with the Play deletion question and avoids implying that Daymark can erase provider logs. The provider's 90-day log statement is recorded in `docs/release/data-safety-v1-v2.md:160-170`; the app's only persistent preference is `daymark.locale` (`storage-surface.test.ts:41-64`).

**Status:** CONFIRMED for the Daymark-side facts; the deletion process and wording are **legal/product decisions**.

### R9 — Security paragraph (EN)

**Current:** `src/pages/privacy.tsx:246-253`

**Proposed addition:**

> Requests to Open-Meteo use HTTPS.

**Why:** The endpoint constants are `https://` (`src/lib/weather.ts:15-17`); the web host sends HSTS and a CSP with `upgrade-insecure-requests` (`public/_headers`; `vite.config.ts:50-52`). This is a simple, supportable statement.

**Status:** CONFIRMED for the app-controlled requests; platform speech transport remains outside this statement.

### R10 — Children's paragraph (EN)

**No text change proposed in this draft.** The current wording ("general-audience weather utility and is not specifically designed for children"; `privacy.tsx:264-271`) is defensible, but "not specifically designed for children" is not the same as "not directed to children" for Play's target-audience/Families analysis. The release owner must confirm the Console target audience before changing this sentence. **Status: legal/Console determination.**

### R11 — FR/ES notes

**FR — locality cache wording (translation accuracy).** `src/pages/privacy-fr.tsx:196-198` says the static locality dataset is cached "pour les recherches hors ligne" (for offline searches). Forward place search is **not** offline; only the locality-name lookup is local (`docs/release/version-2-privacy-hardening.md:75-94`; `src/workers/locality.worker.ts:1-6`). Proposed replacement:

> ... dans Cache Storage pour la consultation locale du nom de la localité ; le service worker met séparément en cache les fichiers de l'application.

**ES — same issue.** `src/pages/privacy-es.tsx:190-192` says "para consultas sin conexión." Proposed replacement:

> ... en Cache Storage para la consulta local del nombre de la localidad; el service worker guarda por separado los archivos de la aplicación.

**FR/ES — cookie wording.** If R7 is adopted, change "n'utilise pas de cookies" / "no usa cookies" to "ne dépose pas de cookies" / "no establece cookies" so the translation matches "does not set cookies."

**FR/ES — new third-party bullets.** Translate R6's Android TTS and Google Play bullets. Do not add a vendor name; keep "peut être fourni par le fabricant de votre appareil ou par Google" / "puede ser proporcionado por el fabricante de tu dispositivo o por Google."

**FR/ES — dates.** The source pages currently say effective 11 October 2026 and last updated 21 October 2026 (`privacy-fr.tsx:21`; `privacy-es.tsx:21`). If publication happens later, set both to the actual publication date; do not leave a date that precedes deployment. The repo already flags this (`play-console-checklist.md:291-294`).

**FR/ES — version note.** The V1/V2 distinction in the three languages is materially aligned; no new claims are needed. A native-speaker review is still advisable because the FR/ES pages are meaning-for-meaning translations and one drift was found ("offline searches").

---

## 4. Proposed Google Play Data safety answers

These are **proposals for the owner and legal reviewer**, not submitted answers. The live form is the source of the current state; the V2 column is a plan for the intended Android build. Play's Data safety section describes the **sum** of all versions currently distributed (`docs/release/data-safety-v1-v2.md:124-131`), so the V1 and V2 columns cannot simply be swapped while V1 remains on a track.

### 4.1 Core matrix

`Shared` is the hardest field. The live form says **No**; the conservative engineering reading is **Yes** because Open-Meteo is a third party and describes itself as an independent controller with up-to-90-day logs. The final answer is a **legal determination**, not an engineering fact.

| Data type | V1 collected? | V1 shared? | V2 Android collected? | V2 shared? | Optional? | Purpose | Ephemeral? | Encrypted in transit? | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| **Approximate location** | **Yes** (V1 declares COARSE and may receive a coarse fix; also declares FINE) | **No\*** (live form) / **Yes** (conservative) | **Yes** (OS approximate fix) | **No\*** / **Yes** | **Yes** | App functionality | **No** — Open-Meteo logs up to 90 days | **Yes** for the Open-Meteo HTTPS request | V1 manifest `:52-53`; V2 manifest `:61`; `location-privacy.ts:48-57`; `weather.ts:232-249`; `data-safety-v1-v2.md:160-170` |
| **Precise location** | **Yes** (FINE + 2 dp cell <3 km²) | **Not declared** (the live form has no Precise row) / **Yes** (conservative) | **No** (source manifest coarse only; **candidate AAB merged manifest verified coarse-only**) | **N/A** (not collected) | **Yes** | App functionality | **No** | **Yes** for the Open-Meteo HTTPS request | V1 `App.tsx:101-106`; V2 manifest `:61`; `android-manifest-permissions.test.ts:71-77`; `data-safety-v1-v2.md:39-43` |
| **In-app search history** | **Yes** (typed query to geocoding) | **No\*** / **Yes** | **Yes** (unchanged) | **No\*** / **Yes** | **Yes** | App functionality | **No** — provider logs, not memory-only | **Yes** | `weather.ts:307-319`; `LocationSearch.tsx:31-63`; `data-safety-v1-v2.md:192-197` |
| **Voice or sound recordings** | **Yes** (WebView speech; provider may process audio remotely; conservative) | **No\*** / **Yes** | **No** for Android-only (on-device Parakeet; source-level, packet proof open) | **N/A** (not collected) | **Yes** | App functionality | V1 **No/unknown**; V2 **N/A** | V1 **unverified for platform speech**; V2 **N/A** | V1 `use-speech-recognition.ts:10-13`; `voice-input-browser.ts:9-13`; V2 `use-speech-recognition.ts:24-36`; `voice-input-native.ts:26-32`; Parakeet `:39-55`; `data-safety-v1-v2.md:198-203` |
| **Diagnostics / crash logs** | **No** app collection; platform vitals only | **No** | **No** app collection | **No** | N/A | N/A | N/A | N/A | `package.json:20-33`; `app/build.gradle:64-75`; no crash SDK; `data-safety-v1-v2.md:204` |
| **Device or other IDs** | **No** | **No** | **No** | **No** | N/A | N/A | N/A | N/A | No ad ID permission; no device-ID API in source; `data-safety-v1-v2.md:204` |
| **App activity / interactions** | **No** beyond search history | **No** | **No** beyond search history | **No** | N/A | N/A | N/A | N/A | No analytics SDK; only the geocoding query is transmitted |

`*` The live form's answer where that type is declared. The live form has no Precise row, so "Not declared" is the accurate V1 description for that type. The conservative answer is **Yes** for location, search and V1 audio because the data leaves the app and reaches a third party. The decision depends on Play's service-provider and user-initiated-action exceptions and on Open-Meteo's independent-controller position (`docs/release/data-safety-v1-v2.md:174-179, 256-258`).

**Approximate vs precise, in one sentence:** V1 can collect both (it declares both permissions; a user grant may be coarse or precise, and the sent cell is always below 3 km², so Play Precise applies); V2 Android is intended Approximate only, because the source manifest is coarse-only. The live form declares Approximate only, which is correct for V2 and incomplete for V1.

### 4.2 Other declarations

| Play field | V1 (live) | V2 (planned) | Basis | Engineering fact or legal decision? |
|---|---|---|---|---|
| Does the app collect or share user data? | **Yes** | **Yes** (Android location + search; audio No) | V1: location/search/audio. V2: location/search. | Engineering fact for transmission; legal for "share." |
| Ads / advertising ID | **No ads; no advertising ID** | **No ads; no advertising ID** | No ad SDK, no AD_ID permission, no ad code (`package.json:20-33`; `app/build.gradle:64-75`). | Engineering fact. |
| Analytics | **No** | **No** | No analytics SDK; no telemetry code. | Engineering fact. |
| Crash logs / diagnostics | **No app collection** | **No app collection** | No crash SDK; Android vitals is platform-level. | Engineering fact + Console wording. |
| Data encrypted in transit | **Yes** (live form; not proven for V1 platform speech) | **Yes** for app-controlled flows; confirm the global wording | Open-Meteo HTTPS; Android URL constants HTTPS; web HSTS/CSP. V1 platform speech transport not verified; V2 Android has no speech egress. | **Partly legal/technical.** Do not treat the live Yes as proven for V1 platform speech. |
| Data can be deleted / deletion request | **No mechanism** (live form) | **No mechanism**; local storage can be cleared | No account/server store; locale clearable; Open-Meteo logs not deletable by Daymark (`privacy.tsx:238-243, 273-283`). | **Legal/product decision**; wording must match the support process. |
| Target audience / children | General audience; PEGI 3 public listing | Same | `privacy.tsx:264-271`; public listing. PEGI 3 is not the target-audience answer. | **Legal/Console decision.** |
| AI asset declaration | Previously completed; re-check | Parakeet is an on-device ASR model, not generative content | `docs/release/data-safety-v1-v2.md:210`; `play-console-checklist.md:137`. | Console declaration; legal/product. |
| App access | All functionality without login | Same | No accounts/login. | Engineering fact. |

### 4.3 Third-party processor analysis (for the "Shared" answer)

| Recipient | What it receives | Role | Does this force "Shared = Yes"? |
|---|---|---|---|
| **Open-Meteo** | Device coords or searched place coords; typed query; IP/request URL; request parameters | Weather/geocoding provider; says it is an independent data controller; logs up to 90 days | **Legal question.** The user-initiated-action exception may apply, but the independent-controller/retention wording weakens the service-provider exception. Conservative answer: **Yes**. |
| **Cloudflare Pages** | Web/PWA request metadata: IP, URL, user agent | Static host/CDN for web/PWA only | Likely service provider; legal review. Not an Android runtime flow (Android assets are local). |
| **Browser speech provider** | Audio (web; V1 Android via WebView), possibly remote | Platform/browser service; role depends on device/browser | **Legal question.** V1 only; V2 Android has no such path. Conservative answer for V1: **Yes**. |
| **Android system TTS engine** | Narration text (FR/ES) | Separate app component on the device; may be Google/OEM | **Legal question** whether the text is user data and whether the on-device handoff is "sharing." If narration contains only app-generated forecast text, likely not a listed data type; if it includes a searched place name, review. |
| **Google Play** | App install/asset-pack delivery; platform account data | Distributor, not an app data recipient | Not an app collection/sharing flow; disclose in policy for transparency. |
| **GeoNames** | Nothing at runtime | Static dataset source | No runtime transfer; no Data safety entry. |

### 4.3.1 Answers that are legal determinations, not engineering facts

The following cannot be settled by source inspection and need the owner/legal reviewer:

- **"Shared" for every data type.** Engineering can show that Open-Meteo, Cloudflare, a browser speech provider or an Android TTS engine receives data. Whether Play's service-provider exception or specific user-initiated-action exception applies is legal.
- **A blanket "encrypted in transit = Yes" while V1 is distributed.** The app-controlled HTTPS flows are confirmed; the platform speech transport is not.
- **The deletion-request answer and wording.** Daymark has no account/server store, but users may have rights in relation to provider-held data that Daymark cannot delete.
- **Children/target audience and Families policy.** PEGI 3 is a content rating, not the target-audience answer.
- **The "No data shared" public answer.** It is inconsistent with the plain data flows unless a legal exception is recorded.

### 4.4 If V1 is withdrawn

If no 1.0.0 artifact remains on any Play track (including closed/internal tracks that are distributed):

- **Approximate location** stays **Yes** for V2 Android.
- **Precise location** can become **No**.
- **In-app search history** stays **Yes**.
- **Voice or sound recordings** can become **No** for the Android artifact, because V2 uses on-device Parakeet. This must be re-checked if any Android fallback to Web Speech is reintroduced.
- The **Shared** decision for Open-Meteo remains; it is not affected by removing V1.
- The **encryption** answer becomes easier (no platform-speech path), but still needs the legal/technical sign-off for the global form.

---

## 5. Outstanding policy/Console actions

Owner roles are generic because this draft does not assign named individuals.

| # | Action | Owner | Dependency | Already flagged in repo? |
|---|---|---|---|---|
| 1 | Read Play Console read-only: highest `versionCode` on every track, current Data safety answers, privacy URL, target audience, ads, AI asset, native-symbols warning | Release owner | Signed-in Console | Yes — `play-console-checklist.md:241-244`; `data-safety-v1-v2.md:249-252` |
| 2 | Determine whether V1 1.0.0 is still distributed on any track | Release owner | Console track contents | Yes — `play-console-checklist.md:123-130`; `data-safety-v1-v2.md:253-255` |
| 3 | If V1 is distributed, declare **Precise location** in addition to Approximate; keep Audio | Release owner | #1/#2 | Yes — `play-console-checklist.md:112-130`; `data-safety-v1-v2.md:190, 198` |
| 4 | Decide **Shared = No/Yes** for Open-Meteo and V1 platform speech; record the user-initiated-action/service-provider analysis | Legal/privacy reviewer | Provider terms; UI/disclosure review | Yes — `data-safety-v1-v2.md:174-179, 256-258`; `play-console-checklist.md:118-121` |
| 5 | Decide the global **encrypted in transit** answer; confirm the V1 platform speech transport or avoid a blanket Yes | Legal/security | Provider documentation or acceptable risk decision | Yes — `data-safety-v1-v2.md:203-205` |
| 6 | Decide the **deletion request** answer and support process; do not imply Daymark can delete Open-Meteo logs | Legal/product | Support process | Yes — `play-console-checklist.md:133-136`; `data-safety-v1-v2.md:206` |
| 7 | Confirm **target audience/children** and Families applicability; PEGI 3 is not the answer | Release owner/legal | Console target-audience form | Yes — `data-safety-v1-v2.md:209-211` |
| 8 | Re-check the **AI asset** declaration for the on-device Parakeet ASR model | Release owner | Console | Yes — `play-console-checklist.md:137`; `data-safety-v1-v2.md:210` |
| 9 | Deploy EN/FR/ES policy pages; set effective/last-updated to the actual publication date; rebuild the Android AAB and verify the bundled pages | Release owner | Web deployment + signing | Yes — `play-console-checklist.md:259-295`; `version-2...:240-250` |
| 10 | **DONE for the candidate AAB:** merged manifest has no `ACCESS_FINE_LOCATION`, versionCode 2, install-time `parakeet` pack, bundled V2 policy text. Re-check after re-signing with the production key. | Android release engineer | Built signed AAB | Yes — `data-safety-v1-v2.md:85, 268-269`; `version-2...:210-227` |
| 11 | Device/packet proof that V2 Android voice makes no speech network request and has no fallback | QA/security | Approved capture method; test device | Yes — `data-safety-v1-v2.md:261-262`; `version-2...:205-209` |
| 12 | Device proof that the V2 Android request carries the OS approximate fix, with a request-URL capture | QA | Test device; approved capture | Yes — `data-safety-v1-v2.md:263-264`; `version-2...:210-227` |
| 13 | Device proof of FR/ES offline voice selection and explicit `offline-voice-unavailable` | QA | Device with FR/ES offline voices | Yes — `data-safety-v1-v2.md:265-266`; `version-2...:184-190` |
| 14 | Obtain the V1 Android WebView speech provider path and retention terms | Security/legal | Device/provider documentation | Yes — `data-safety-v1-v2.md:259-260`; `play-console-checklist.md:106` |
| 15 | Review the Android system TTS engine's role/vendor and whether narration text is "sharing" | Legal/Android reviewer | Device/TTS documentation | Partly — `play-console-checklist.md:108` asks to check the actual provider; not fully resolved |
| 16 | Cloudflare/host configuration check: no unexpected analytics, cookies or request-metadata processing; reconcile "does not set cookies" wording | Ops/release owner | Cloudflare dashboard | Partly — `privacy.tsx:204-209`; not in checklist |
| 17 | Fix FR/ES translation drift: "offline searches" → local locality-name lookup; update cookie wording | Localization/release owner | Translation review | No — new in this draft |
| 18 | Fix the `voice-browser.ts` "no cloud TTS" comment (code cleanup, not policy) | Web engineer | Code review | No — new in this draft |
| 19 | Re-check final AAB for no analytics/crash SDK, no `google-services.json`, no `AD_ID` | Android release engineer | Final AAB | Partly — `data-safety-v1-v2.md:204`; `play-console-checklist.md:110` |
| 20 | Record the final Console date, track contents and answers in the release checklist | Release owner | All above | Yes — `play-console-checklist.md:241-244`; `data-safety-v1-v2.md:301-302` |

---

## 6. Verification gaps and what would close them

1. **Merged manifest / signed AAB — CLOSED for the candidate, open for Play signing.** The candidate AAB's merged base manifest was inspected: `ACCESS_COARSE_LOCATION` only, no `ACCESS_FINE_LOCATION`, versionCode 2. The remaining uncertainty is production-signing continuity and the Play-signed artifact, not the V2 permission set.
2. **Device/packet proof for V2 Android voice.** Use an approved, redacted capture method — for example a test-device VPN/PCAP capture or an emulator with a proxy — during a voice session, with device log capture. Confirm no speech-service host is contacted and no audio/transcript appears in logs. Do not publish raw captures containing location or audio. This closes the "no speech egress" claim; until then it is source-verified only.
3. **Device proof for the Android coordinate.** Capture the request URL or a server log showing the actual coordinate sent after a "Use my location" action on a coarse-only install. Confirm it is the OS fix, not a rounded or precise value. This closes the Play Approximate classification.
4. **FR/ES offline voice proof.** On a device with an installed offline FR/ES voice, confirm selection and playback; on a device without one, confirm the explicit error and no network-voice fallback.
5. **V1 speech provider.** Identify the WebView/browser speech provider and its retention/transport terms for the released build. This is required before a blanket "encrypted in transit" or "Shared = No" answer for V1.
6. **Play Console export.** Highest version code, track contents, current Data safety answers, target audience, AI asset. The public storefront does not expose these.
7. **Legal review.** "Shared," deletion, encryption, children/target audience, and the Open-Meteo independent-controller position are legal determinations. Engineering can state what leaves the app; it cannot decide the Play exception or the GDPR/UK GDPR position.
8. **Host configuration.** Cloudflare analytics/cookies/request-metadata configuration is outside the repo. Check the dashboard if the policy says "no cookies" or "no analytics" at host level.

**What this audit does not prove:** it does not prove packet-level zero egress for V2 voice, and it does not prove the live Play form matches the shipped build. The candidate AAB's merged manifest was verified to lack `FINE`; the Play-signed artifact and Console answers remain **UNVERIFIED**.

---

## Appendix — Minimal patch set (EN/FR/ES)

These are the smallest text edits that remove the overclaims identified in §0/A1–A11. They are **proposed text only**; do not apply without legal review where an amendment is flagged as a legal decision. Paths are relative to `artifacts/weather-app/`.

**A1 — Opening paragraph (remove "runs entirely").**

- `src/pages/privacy.tsx:27` — replace
  `Daymark is a weather app that runs entirely in your browser or installed app.`
  with
  `Daymark is a weather app whose app logic runs in your browser or installed app. Daymark does not operate a backend, account system, or database of its own. To show weather, air quality, and place suggestions, the app sends requests directly from your device to Open-Meteo, as described below.`
- `src/pages/privacy-fr.tsx:26-27` — replace
  `Daymark est une application météo qui fonctionne entièrement dans votre navigateur ou en tant qu'application installée.`
  with
  `Daymark est une application météo dont la logique s'exécute dans votre navigateur ou dans l'application installée. Daymark n'exploite pas de backend, de compte utilisateur ni de base de données propres. Pour afficher la météo, la qualité de l'air et les suggestions de lieux, l'application envoie des requêtes directement depuis votre appareil vers Open-Meteo, comme décrit ci-dessous.`
- `src/pages/privacy-es.tsx:26-27` — replace
  `Daymark es una aplicación del tiempo que funciona por completo en tu navegador o como aplicación instalada.`
  with
  `Daymark es una aplicación del tiempo cuya lógica se ejecuta en tu navegador o en la aplicación instalada. Daymark no opera un backend, un sistema de cuentas ni una base de datos propios. Para mostrar el tiempo, la calidad del aire y las sugerencias de lugares, la aplicación envía solicitudes directamente desde tu dispositivo a Open-Meteo, como se describe a continuación.`

**A3 — Device location (add "Android, not Daymark" + area).**

- `src/pages/privacy.tsx:92-101` — insert after "does not declare ACCESS_FINE_LOCATION." : `Android, not Daymark, determines the approximate estimate.`; after "1.7 km east/west near London" insert `, roughly 4.8 km²`.
- `src/pages/privacy-fr.tsx:103-113` and `src/pages/privacy-es.tsx:101-110` — apply the same two clarifications in translation.

**A5 — Voice input (remove "entirely").**

- `src/pages/privacy.tsx:142-148` — replace "recognition runs entirely on your device" with "speech recognition is performed on your device" and add "The Android voice code does not contain a network speech-recognition path, a platform speech recogniser, or a fallback to one; if the model is unavailable, Daymark reports that voice input is unavailable." Remove "entirely." Add to the web paragraph: "The browser or platform provider may retain audio or transcripts under its own policy; Daymark cannot see or delete a copy held by that provider."

**A6 — Narration (add TTS engine disclosure).**

- `src/pages/privacy.tsx:161-171` — insert after "passed to that installed voice on your device." : `The text-to-speech engine is a separate app component, which may be supplied by your device manufacturer or Google; its own privacy policy applies.`

**A7 — Third-party list (add TTS engine + Google Play + Open-Meteo controller).**

- `src/pages/privacy.tsx:190-214` — add bullets for "Your Android device's text-to-speech engine" and "Google Play"; add to the Open-Meteo bullet: "Open-Meteo processes these requests on its own servers and describes itself as an independent data controller; its own privacy policy applies."
- `src/pages/privacy-fr.tsx:210-236` and `src/pages/privacy-es.tsx:204-229` — translate the same bullets.

**A8 — Retention/deletion (add deletion process).**

- `src/pages/privacy.tsx:238-244` — append: "Because Daymark has no account or server-side store, there is no Daymark-held account data to delete. You can clear the language preference and the app's local storage in your browser or device settings. Requests sent to Open-Meteo are retained under Open-Meteo's policy, and Daymark cannot delete Open-Meteo's logs. If you have a question or a deletion request, contact us at the address below and we will explain what we can and cannot do."

**A9 — Cookies wording.**

- `src/pages/privacy.tsx:184` — "does not use cookies" → "does not set cookies".
- `src/pages/privacy-fr.tsx:203` — "n'utilise pas de cookies" → "ne dépose pas de cookies".
- `src/pages/privacy-es.tsx:197` — "no usa cookies" → "no establece cookies".

**A10 — FR/ES locality cache wording.**

- `src/pages/privacy-fr.tsx:196-198` — "pour les recherches hors ligne" → "pour la consultation locale du nom de la localité".
- `src/pages/privacy-es.tsx:190-192` — "para consultas sin conexión" → "para la consulta local del nombre de la localidad".

**A12 — Security paragraph (HTTPS).**

- `src/pages/privacy.tsx:246-253` — append: "Requests to Open-Meteo use HTTPS." (and FR/ES equivalents).

**Code-comment cleanup (not policy):**

- `src/lib/voice-browser.ts:9-11` — remove "no cloud TTS"; the browser may select a remote voice.

**Legal decisions contained in this patch set:** A2 (Play "Shared"), A5 (Play "Voice or sound recordings" for Android), A6 (whether narration text is "sharing"), A8 (deletion-request answer/process), A11 (third-party processor roles), and A10's effective-date handling. All other items are wording/engineering facts.

## 7. Source index

**V2 source (HEAD `ee04449`; use `git show HEAD:<path>` because the worktree is dirty):**

- `artifacts/weather-app/android/app/src/main/AndroidManifest.xml` — permissions, queries.
- `artifacts/weather-app/src/lib/location-privacy.ts` — grid and Android pass-through.
- `artifacts/weather-app/src/App.tsx` — `findMe`, default place, request flow.
- `artifacts/weather-app/src/lib/weather.ts` — hosts, parameters, caches, geocoding.
- `artifacts/weather-app/src/lib/voice-input-native.ts` — Parakeet controller.
- `artifacts/weather-app/src/lib/voice-input-browser.ts` — browser speech adapter.
- `artifacts/weather-app/src/hooks/use-speech-recognition.ts` — Android/web selection.
- `artifacts/weather-app/src/lib/speech-router.ts` — Kokoro vs fallback routing.
- `artifacts/weather-app/src/lib/speech-engine.ts` — English/Android selection.
- `artifacts/weather-app/src/lib/speech-adapters.ts` — Android system TTS fallback.
- `artifacts/weather-app/src/hooks/use-daymark-speech.ts` — TTS adapter wiring.
- `artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/ParakeetSpeechRecognitionPlugin.java` — native ASR.
- `.../SystemSpeechPlugin.java` — FR/ES TTS and offline-voice gate.
- `.../DaymarkVoicePlugin.java` — Kokoro bridge.
- `artifacts/weather-app/android/parakeet-assets/build.gradle` — install-time asset pack.
- `artifacts/weather-app/src/pages/privacy.tsx`, `privacy-fr.tsx`, `privacy-es.tsx` — policy text.
- `artifacts/weather-app/src/lib/storage-surface.test.ts` — persistence guard.
- `artifacts/weather-app/src/lib/android-manifest-permissions.test.ts` — source-manifest guard.
- `artifacts/weather-app/src/lib/android-voice-implementation.test.ts` — no-SpeechRecognizer guard.
- `artifacts/weather-app/public/sw.js`, `public/_headers`, `vite.config.ts` — caching and transport policy.

**V1 source (`main@50194e8`):**

- `artifacts/weather-app/android/app/src/main/AndroidManifest.xml:50-57` — V1 permissions.
- `artifacts/weather-app/src/App.tsx:101-106` — two-decimal rounding.
- `artifacts/weather-app/src/hooks/use-speech-recognition.ts:10-13` — browser-only speech.
- `artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/SystemSpeechPlugin.java:133-141` — default system TTS.
- `artifacts/weather-app/src/pages/privacy.tsx:63-70, 106-123` — V1 policy text.

**Release docs:**

- `docs/release/data-safety-v1-v2.md` — Play state, data matrix, proposed answers, open actions.
- `docs/release/play-console-checklist.md` — release checklist and manual items.
- `docs/release/version-2-privacy-hardening.md` — V2 decisions and open gates.
- `docs/release/android-production-readiness.md` — V1/V2 permission and data-flow map.
- `README.md`, `SECURITY.md` — public claims.

**External state checked:**

- Public Play Data safety page for `io.github.sami_gor.daymark`, read 22 October 2026 (same answers as recorded 21 October 2026).
- The live `/privacy` page returns the SPA shell to a plain HTTP fetch; this audit relies on the repository's recorded live-page check that it still showed the 11 September 2026 text (`play-console-checklist.md:287-289`; `data-safety-v1-v2.md:275-277`). A rendered-browser check is still needed before publication.
