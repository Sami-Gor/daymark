# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security problems.

Use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-reviewing/privately-reporting-a-security-vulnerability) on this repository (Security → Report a vulnerability) if enabled. Otherwise, open a security advisory draft or contact the repository owner through their GitHub profile.

Please include a description, reproduction steps, and affected file paths where possible. Reports are handled in good faith; coordinated disclosure is appreciated.

## Scope

In scope: this repository's code and shipped artifacts — the React/Vite web app and PWA (`artifacts/weather-app`, deployed from `dist/public`), and the Android app built from `artifacts/weather-app/android` (Capacitor shell with the native `DaymarkVoice` plugin and bundled Kokoro model).

Out of scope: third-party services themselves (Open-Meteo, Google Play, device speech/TTS engines) and hosting-platform configuration outside this repository — though misconfigurations shipped *in* this repository (e.g. `public/_headers`) are in scope.

## Security posture

The posture below describes the **released v1.0.0** build and the deployed
website. The `v2/privacy-hardened-voice` branch changes the location and voice
behaviour; each affected statement below names the released behaviour and the
v2 candidate behaviour separately. The v2 branch is not released — see
[docs/release/version-2-privacy-hardening.md](docs/release/version-2-privacy-hardening.md).

### Web app / PWA

- **Client-only** — no backend, database, accounts, sessions, ads, analytics or telemetry
- **Minimal supply chain** — 12 runtime dependencies, lockfile-pinned, with a minimum-release-age install policy
- **Runtime validation** — every Open-Meteo response is parsed through Zod schemas at a single network boundary; malformed data degrades gracefully; all external fetches carry a 10-second timeout
- **Privacy by default** — geolocation only on explicit user action; coordinates rounded to ~1 km before transmission (*released v1.0.0. In the v2 candidate, the Android app declares `ACCESS_COARSE_LOCATION` only and sends the OS-provided approximate fix unmodified, and the web/PWA app snaps device coordinates to a 0.025-degree grid on the device*); the only user preference persisted by the app is `daymark.locale`. The web/PWA service worker caches the app shell; app code separately caches the locality dataset in Cache Storage. The Android app uses the dataset bundled with its assets. Location/search/transcript history and weather responses are not persisted by the app.
- **Strict CSP** — production header set in `artifacts/weather-app/public/_headers` (`default-src 'none'`, `script-src 'self'`, `connect-src` limited to this origin and the Open-Meteo hosts; no `unsafe-eval`)
- **Service worker** — caches the same-origin app shell only; Open-Meteo traffic is never intercepted or cached
- **Speech** — *released v1.0.0:* recognition is delegated to the browser/platform speech service and may be processed remotely; Daymark stores no transcripts. *In the v2 candidate:* on Android, recognition runs entirely on the device, using the bundled **Parakeet TDT 0.6B v3 int8** model through the **sherpa-onnx** offline transducer. `android.speech.SpeechRecognizer` is not used anywhere in the Android voice path, and there is no generic recogniser, remote retry or silent fallback: if the model is missing or fails, voice input reports an explicit error. On the web, recognition remains the browser speech service and may be processed remotely. Daymark stores no transcripts. On the web, narration uses the browser's speech-synthesis voice

### Android app (Capacitor)

- **Capacitor WebView** — loads bundled local assets only; no remote `server.url`; no new web origins beyond the data hosts above
- **Native voice** — the `DaymarkVoice` plugin runs the Kokoro model through Rust/JNI in-process; Android English narration is on-device and never falls back to network/system TTS; French/Spanish use the device system TTS engine, whose data handling depends on the OS voice/provider
- **Permissions** — *released v1.0.0:* `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` (used only for user-initiated geolocation), `RECORD_AUDIO` (speech input, kept in memory), `MODIFY_AUDIO_SETTINGS`; no background location, storage or notification permissions; `android:allowBackup="false"`. *In the v2 candidate:* `ACCESS_FINE_LOCATION` is removed — the app requests Android's approximate location and uses the fix Android returns. The `INTERNET` permission remains for the existing weather and WebView features; it is not used by the voice path.
- **Lifecycle** — narration stops on pause/background; audio focus is requested per utterance; no background services or receivers beyond platform defaults
- **Deep links** — restricted to the production host (`daymark-weather.pages.dev`) via the manifest intent filter and the app's runtime allow-list
- **Release/signing boundary** — the upload keystore and `keystore.properties` are gitignored and never committed; AABs are uploaded to Google Play, which re-signs them with the Play app-signing key (held by Google). No secrets ship in the client or native artifacts

## Supported versions

The default branch (`main`) is supported. There are no tagged releases yet; fixes apply to the tip of `main`. For current Android release status, consult the maintained release checklist rather than this security policy.
