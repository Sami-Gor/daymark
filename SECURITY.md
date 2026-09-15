# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security problems.

Use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-reviewing/privately-reporting-a-security-vulnerability) on this repository (Security → Report a vulnerability) if enabled. Otherwise, open a security advisory draft or contact the repository owner through their GitHub profile.

Please include a description, reproduction steps, and affected file paths where possible. Reports are handled in good faith; coordinated disclosure is appreciated.

## Scope

In scope: this repository's code and shipped artifacts — the React/Vite web app and PWA (`artifacts/weather-app`, deployed from `dist/public`), and the Android app built from `artifacts/weather-app/android` (Capacitor shell with the native `DaymarkVoice` plugin and bundled Kokoro model).

Out of scope: third-party services themselves (Open-Meteo, Google Play, device speech/TTS engines) and hosting-platform configuration outside this repository — though misconfigurations shipped *in* this repository (e.g. `public/_headers`) are in scope.

## Security posture

### Web app / PWA

- **Client-only** — no backend, database, accounts, sessions, ads, analytics or telemetry
- **Minimal supply chain** — 12 runtime dependencies, lockfile-pinned, with a minimum-release-age install policy
- **Runtime validation** — every Open-Meteo response is parsed through Zod schemas at a single network boundary; malformed data degrades gracefully; all external fetches carry a 10-second timeout
- **Privacy by default** — geolocation only on explicit user action; coordinates rounded to ~1 km before transmission; the only persisted item is the language preference (`daymark.locale`); no location, transcripts, cookies, IndexedDB or other storage
- **Strict CSP** — production header set in `artifacts/weather-app/public/_headers` (`default-src 'none'`, `script-src 'self'`, `connect-src` limited to this origin and the Open-Meteo hosts; no `unsafe-eval`)
- **Service worker** — caches the same-origin app shell only; Open-Meteo traffic is never intercepted or cached
- **Speech** — recognition is delegated to the browser/platform speech service and may be processed remotely; Daymark stores no transcripts. On the web, narration uses the browser's speech-synthesis voice

### Android app (Capacitor)

- **Capacitor WebView** — loads bundled local assets only; no remote `server.url`; no new web origins beyond the data hosts above
- **Native voice** — the `DaymarkVoice` plugin runs the Kokoro model through Rust/JNI in-process; English narration is fully on-device and never falls back to a network/system TTS; French/Spanish use the device system TTS engine
- **Permissions** — `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` (used only for user-initiated geolocation), `RECORD_AUDIO` (speech input, kept in memory), `MODIFY_AUDIO_SETTINGS`; no background location, storage or notification permissions; `android:allowBackup="false"`
- **Lifecycle** — narration stops on pause/background; audio focus is requested per utterance; no background services or receivers beyond platform defaults
- **Deep links** — restricted to the production host (`daymark-weather.pages.dev`) via the manifest intent filter and the app's runtime allow-list
- **Release/signing boundary** — the upload keystore and `keystore.properties` are gitignored and never committed; AABs are uploaded to Google Play, which re-signs them with the Play app-signing key (held by Google). No secrets ship in the client or native artifacts

## Supported versions

The default branch (`main`) is supported. There are no tagged releases yet; fixes apply to the tip of `main`. Android distribution is currently in Google Play closed testing (package `io.github.sami_gor.daymark`, versionCode 1 / versionName 1.0.0).
