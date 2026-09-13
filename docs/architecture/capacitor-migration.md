# Capacitor native shell migration

Status: in progress (branch `migration/capacitor-native-shell`).

## Why

Daymark's Android app was a Bubblewrap Trusted Web Activity (TWA). A TWA renders
the site in the user's browser (Chrome) and gives the host app no access to the
web content beyond URL-level signals. That blocks native capabilities we need,
above all the local Kokoro text-to-speech engine, and it made the release chain
depend on Digital Asset Links and a Play App Signing fingerprint.

A Capacitor shell keeps the exact same React/Vite app and PWA deployment, adds a
supported JavaScript-to-native bridge, and gives us lifecycle, audio-focus and
packaging control for the native voice path. It also keeps an iOS path open.

The TWA project is preserved at `android/` and tagged `pre-capacitor-daymark`
(branch `poc/kokoro-local-tts`, commit `ff49699`).

## Migration state record (pre-migration)

| Item | Value |
|---|---|
| HEAD | `ff496996fcf9b47d9524d81ac300e69c2974c805` |
| Branch | `poc/kokoro-local-tts` |
| Rollback tag | `pre-capacitor-daymark` (annotated, local) |
| applicationId / namespace | `io.github.sami_gor.daymark` |
| versionCode / versionName | `1` / `1.0.0` |
| minSdk / targetSdk / compileSdk | `23` / `36` / `36` |
| Signing | `android/daymark-upload.keystore`, alias `daymark-upload`, SHA-256 `3C:60:AD:…:20:57` |
| Play metadata | package `io.github.sami_gor.daymark`; AAB versionCode 1; assetlinks pending Play App Signing |
| Deep links | `https://daymark-weather.pages.dev` intent filter, `autoVerify`, fallback Custom Tabs |
| Manifest permissions (TWA) | none declared (web APIs: geolocation, microphone) |
| Release AAB | 84,011,698 B (Kokoro bm_fable) |
| Release APK | 164,094,786 B |
| Debug APK | 168,119,760 B |
| Web bundle | `artifacts/weather-app/dist/public` (JS ~470.6 kB raw / ~140.7 kB gzip; CSS ~51.6 kB) |

## Web architecture (audit)

- **Framework/build:** React 19 + Vite, pnpm workspace package
  `@workspace/weather-app`. Build output `dist/public`; `index.html` entry.
- **Routing:** `wouter`, routes `/`, `/privacy`, `/fr/privacy`, `/es/privacy`;
  `WouterRouter base={import.meta.env.BASE_URL}`; browser history (back button
  is browser history); 404 fallback route.
- **Service worker:** hand-written `public/sw.js`, precache list patched at
  build time by a Vite plugin; registered in `main.tsx` only for production
  web builds. Locality dataset cached on demand via Cache Storage
  (`daymark-locality-v1`), never precached.
- **Storage:** `localStorage` for locale (`i18n.ts`); no IndexedDB.
- **Geolocation:** `navigator.geolocation.getCurrentPosition` (App.tsx), with
  device-location fallback labels; no native permission in the old shell
  (Chrome granted it).
- **Microphone / speech input:** `use-speech-recognition.ts` + AskDaymark use
  `SpeechRecognition`/`webkitSpeechRecognition` (browser), no `getUserMedia`.
- **Speech output:** `use-browser-speech.ts` + `lib/voice-browser.ts` wrap
  `window.speechSynthesis` with `SPEECH_LANGS` (en/fr/es) and single-utterance
  semantics (`speak` cancels current first, `stop` = cancel).
- **Network:** Open-Meteo weather/air-quality/geocoding APIs; CSP whitelists
  those hosts in `public/_headers` and `vite.config.ts` preview headers.
- **Offline:** SW app-shell precache + locality Cache Storage; weather needs
  network.
- **Env/base:** `PORT`, `BASE_PATH` (Vite `BASE_URL`), no other runtime env.
- **Viewport/safe area:** viewport meta in `index.html`; CSS `env(safe-area-*)`
  padding in `index.css`.
- **PWA:** `manifest.webmanifest`, icons, `_headers` (CSP, Permissions-Policy
  `geolocation=(self), camera=(), microphone=(self)`).

## TWA shell (audit)

- `LauncherActivity` extends `com.google.androidbrowserhelper.trusted.LauncherActivity`;
  `DelegationService` extends the browser-helper delegated service (notifications
  disabled); `Application` is empty.
- `androidbrowserhelper:2.6.2` (pulls `androidx.browser:1.9.0-alpha04`).
- Manifest metadata: `asset_statements`, `web_manifest_url`, splash screen,
  status/nav bar colors, `FALLBACK_STRATEGY=customtabs`, `SCREEN_ORIENTATION`,
  file provider, `autoVerify` https intent filter for the production host.
- Digital Asset Links: template only (`asset-links/assetlinks.template.json`
  with `__PLAY_APP_SIGNING_SHA256__`); production `/.well-known/assetlinks.json`
  is not deployed (serves the SPA fallback), so the app currently runs in
  Custom Tabs fallback mode.
- Icons/splash under `android/app/src/main/res/`.
- Kokoro POC: native-only `KokoroTtsTestActivity` + `KokoroLocalTtsEngine`
  (Java) over a Rust JNI cdylib with the bundled model/voice, plus
  `android/kokoro-poc/` build scripts.

## Behaviour that changes under a WebView/native shell

| Area | TWA (before) | Capacitor (after) |
|---|---|---|
| Runtime | Chrome (user's browser) | In-app Android WebView |
| Origin | `https://daymark-weather.pages.dev` | local bundled origin (`https://localhost` default) |
| Service worker | served by Chrome, active | redundant; disable inside native shell, keep for web |
| Geolocation permission | Chrome handles | WebView `onGeolocationPermissionsShowPrompt` + app permission |
| Microphone | Chrome | WebView `onPermissionRequest` + app permission (AskDaymark) |
| Web Speech API | Chrome's speechSynthesis (system TTS) | WebView may lack speechSynthesis → native Kokoro path, else browser fallback |
| External links | Chrome handles | Capacitor opens in external browser (`@capacitor/app`/browser config) |
| Back button | browser history | Capacitor hardware back handling → `window.history.back()` |
| App links | verified by Chrome via DAL | Android intent filters + optional `@capacitor/app` `openUrl` |
| CSP | served by Cloudflare | same headers must be compatible with the local origin |
| Native voice | none | DaymarkVoice plugin → Kokoro |

## Migration design

- Keep `artifacts/weather-app` as the single frontend. Capacitor is added there
  and loads the bundled `dist/public` output (no remote URL in production).
- New Android project: `artifacts/weather-app/android` (Capacitor-generated).
  The old TWA project at repository `android/` stays as the rollback point.
- `DaymarkVoice` is a local Capacitor plugin:
  - TypeScript interface in `src/lib/daymark-voice/` (platform-neutral,
    `registerPlugin<DaymarkVoicePlugin>('DaymarkVoice')`).
  - Android implementation as a Gradle library module
    (`android/daymark-voice`) wrapping the validated `KokoroLocalTtsEngine`,
    the same Rust JNI cdylib, `model_quantized.onnx` and `bm_fable.bin`.
  - Web implementation is a thin no-op; the React layer falls back to
    `use-browser-speech` whenever the native engine is unavailable.
- Unified speech layer: `useDaymarkSpeech` selects
  `kokoro` only for Android native + English + healthy engine;
  `browser` for web/desktop, iOS, French, Spanish, and any native failure.
- Lifecycle: engine initializes once per process, asynchronously, when the
  plugin loads; `speak()` waits for readiness (bounded), Stop cancels
  immediately; audio focus is requested per utterance and abandoned on stop or
  focus loss; the engine stays resident and is released with the bridge.
- PWA stays deployable: service worker registration is skipped inside
  Capacitor; all native calls are feature-detected; the web build is unchanged
  for browsers.

## Toolchain

| Component | Version |
|---|---|
| Capacitor | 8.5.1 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/app`) |
| Android Gradle Plugin / Gradle | 8.13.0 / 8.14.3 |
| JDK | 21 (required by Capacitor 8; TWA used 17) |
| Node / pnpm | 26.8.2 / 12.3.4 |
| package id | `io.github.sami_gor.daymark` (unchanged) |
| minSdk | 24 (Capacitor 8 minimum; TWA supported 23) |
| targetSdk / compileSdk | 36 / 36 (unchanged) |
| versionCode / versionName | 1 / 1.0.0 (unchanged) |
| Signing | `daymark-upload.keystore` (copied into the Capacitor project), alias `daymark-upload` |

## DaymarkVoice plugin

TypeScript (`src/lib/daymark-voice`, `src/lib/system-speech`):

```
isAvailable(): Promise<{ available: boolean }>
getStatus(): Promise<{ state: 'uninitialized'|'loading'|'ready'|'speaking'|'stopped'|'error' }>
speak({ text, lang? }): Promise<void>
stop(): Promise<void>
isSpeaking(): Promise<{ speaking: boolean }>
```

Android implementation: Gradle module `android/daymark-voice` wrapping the
validated `KokoroLocalTtsEngine` (unchanged Java + Rust JNI + `bm_fable`), plus
a `SystemSpeech` plugin (Android `TextToSpeech`) used for French/Spanish.

Before synthesis, `briefing.spokenText` is split by a TTS-only segmenter
(`src/lib/tts-segmentation.ts`): conservative boundaries at sentence endings,
clauses and safe conjunctions, no change to the wording. Segments are streamed
into the running Kokoro session (`nativeStreamStart`/`nativeStreamPush`) and
each sentence is read ahead while the previous one plays. The first segment is
kept short so AudioTrack starts early; excessive leading silence at segment
boundaries is trimmed (the first chunk fully, later chunks down to a natural
lead) while trailing sentence pauses are preserved.

Lifecycle and audio:

- The engine initializes once per process when the plugin loads, off the UI
  thread. `speak()` during `loading` waits (bounded, 45 s) for `ready`.
- Audio focus is requested per utterance (`AUDIOFOCUS_GAIN_TRANSIENT`);
  permanent/transient loss stops playback, duck events are ignored.
- Backgrounding the app stops narration (plugin `handleOnPause`).
- The engine stays resident until the bridge is destroyed; a new `speak()`
  replaces the current utterance deterministically.

Engine selection (`src/lib/speech-engine.ts`):

| Platform | Language | Engine |
|---|---|---|
| Android Capacitor, native available | English | Kokoro `bm_fable` |
| Android Capacitor, native unavailable | English | Web Speech API if present, else Android system TTS |
| Android Capacitor | French/Spanish | Android system TTS (`SystemSpeech`) |
| Web/PWA/desktop | any | Web Speech API |
| iOS | any | Web Speech API (native plugin is a future path) |

## Build and release

```bash
# Web (unchanged PWA deployment)
cd artifacts/weather-app && pnpm build

# Capacitor sync + Android builds (JDK 21)
cd artifacts/weather-app
pnpm exec cap sync android
cd android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleDebug
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleRelease :app:bundleRelease
```

Kokoro native material is restored with the scripts in `android/kokoro-poc`.
Both scripts populate the TWA rollback project and the Capacitor plugin module
unconditionally in a clean checkout, and fail with a clear error if the
`daymark-voice` module is missing. The generated assets and `jniLibs` are
gitignored.

## Validation results (API 36 arm64 emulator, release build)

- Capacitor shell launches, bundled assets load from `https://localhost`.
- Routing, hardware back (SPA history; root minimizes), cold/warm App Links
  (`/privacy`, `/fr/privacy`), local storage, background/foreground and
  force-stop/relaunch all work.
- Kokoro: READY, `voice=bm_fable`, streamed narration, Stop
  (`stopped=true`), offline (airplane mode) and repeated narration all pass.
- Web/PWA: typecheck, 203 unit tests, 133 e2e tests and the production Vite
  build pass; the service worker is skipped and cleaned up inside the native
  shell only.
- Known environment limitations: the emulator has no fresh fused location fix
  and blocks mock providers, so "Use my location" could not be validated
  end-to-end; its permission wiring is in place. Google TTS on the emulator
  has no French voice data, so French narration fails cleanly (handled error,
  no crash) — English system TTS works.

| Measurement (emulator) | TWA + Kokoro POC | Capacitor shell |
|---|---|---|
| Launch to weather visible | n/a | ~6.6 s |
| Kokoro init (process start) | 2.7–3.9 s warm | 2.7–3.5 s warm, ~9–13 s cold/under load |
| First audio after "Hear today" | 1.4–1.7 s (1.7 s first sentence) | ~2.4 s after TTS segmentation (was ~4.3 s; first segment 27 chars) |
| Steady PSS | ~474 MB | ~623 MB (Kokoro ~470 + WebView/app) |
| Release APK | 164,094,786 B | 169,165,750 B |
| Release AAB | 84,011,698 B | 89,307,570 B |

Emulator timings are not device performance; the integrated engine, voice and
streaming pipeline are unchanged from the validated POC.

## Cleanup list (prepared, not executed)

Keep for rollback: the whole root `android/` TWA project, `twa-manifest.json`,
`asset-links/`, `androidbrowserhelper` dependency (only referenced by the TWA
project).

Candidates once the Capacitor shell is released:

- `src/hooks/use-browser-speech.ts` — no production usages left (the unified
  hook talks to `lib/voice-browser` directly).
- The root TWA project can be moved to a tag/archive branch; it is not part of
  any production build.

## Rollback

`git checkout pre-capacitor-daymark` (or the `poc/kokoro-local-tts` branch at
`ff49699`) restores the validated TWA/Kokoro state, including the root
`android/` project, which is never modified by this migration.
