# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security problems.

Use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately) on this repository (Security → Report a vulnerability) if enabled. Otherwise, open a security advisory draft or contact the repository owner through their GitHub profile.

Please include a description, reproduction steps, and affected file paths where possible. Reports are handled in good faith; coordinated disclosure is appreciated.

## Scope

In scope: this repository's code and shipped artifacts — the React/Vite web app and PWA (`artifacts/weather-app`, deployed from `dist/public`), and the Android app built from `artifacts/weather-app/android` (Capacitor shell with the native `DaymarkVoice` plugin and bundled Kokoro model).

Out of scope: third-party services themselves (Open-Meteo, Google Play, device speech/TTS engines) and hosting-platform configuration outside this repository — though misconfigurations shipped *in* this repository (e.g. `public/_headers`) are in scope.

## Security posture

### Web app / PWA

- **Client-only** — no backend, database, accounts, sessions, ads, analytics or telemetry
- **Minimal supply chain** — 12 runtime dependencies, lockfile-pinned, with a minimum-release-age install policy
- **Runtime validation** — every Open-Meteo response is parsed through Zod schemas at a single network boundary; malformed data degrades gracefully; all external fetches carry a 10-second timeout
- **Privacy by default** — geolocation only on explicit user action. The web/PWA and Android V1 round coordinates to two decimal places (~1 km) on the device before transmission; Android V2 snaps device-derived coordinates to a 0.025° grid (longitude step widens above roughly 67° latitude so the represented cell stays at least 3 km²) and never sends the raw device fix. The only user preference persisted by the app is `daymark.locale`. The web/PWA service worker caches the app shell; app code separately caches the locality dataset in Cache Storage. The Android app uses the dataset bundled with its assets. Location/search/transcript history and weather responses are not persisted by the app.
- **Strict CSP** — production header set in `artifacts/weather-app/public/_headers` (`default-src 'none'`, `script-src 'self'`, `connect-src` limited to this origin and the Open-Meteo hosts; no `unsafe-eval`)
- **Service worker** — caches the same-origin app shell only; Open-Meteo traffic is never intercepted or cached
- **Speech** — recognition is delegated to the browser/platform speech service and may be processed remotely; Daymark stores no transcripts. On the web, narration uses the browser's speech-synthesis voice

### Android app (Capacitor)

- **Capacitor WebView** — loads bundled local assets only; no remote `server.url`; no new web origins beyond the data hosts above
- **Native voice** — the `DaymarkVoice` plugin runs the Kokoro model through Rust/JNI in-process; Android V2 English narration is on-device and never falls back to network/system TTS. French and Spanish narration was available in V1 through the device system TTS engine (whose data handling depends on the OS voice/provider); it is not included in V2.0.
- **Permissions (version-scoped)** — the declared Android permission surface changed between app versions. The verified V2.0.0 release AAB declares **four** permissions; V1 (versionCode 1) declared **five**.

  | Version | Version code | Declared Android permissions |
  |---|---:|---|
  | V1 | 1 | `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` |
  | V2 | 2 | `INTERNET`, `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` |

  V2 does **not** declare `ACCESS_FINE_LOCATION`. Neither version declares background location, storage or notification permissions; both set `android:allowBackup="false"`. Location is used only for user-initiated geolocation, and speech input is held in memory rather than recorded.
- **Lifecycle** — narration stops on pause/background; audio focus is requested per utterance; no background services or receivers beyond platform defaults
- **Deep links** — restricted to the production host (`daymark-weather.pages.dev`) via the manifest intent filter and the app's runtime allow-list
- **Release/signing boundary** — the upload keystore and `keystore.properties` are gitignored and never committed; AABs are uploaded to Google Play, which re-signs them with the Play app-signing key (held by Google). No secrets ship in the client or native artifacts

### Release evidence

The V2 figures in this policy are pinned to the published `v2.0.0` tag, not to the current working tree or `main`:

- `v2.0.0` → commit [`c371300b3908a8f9805078f26159ff1a44f6538a`](https://github.com/Sami-Gor/daymark/commit/c371300b3908a8f9805078f26159ff1a44f6538a)
- Tagged Android manifest: [`artifacts/weather-app/android/app/src/main/AndroidManifest.xml` at `v2.0.0`](https://github.com/Sami-Gor/daymark/blob/v2.0.0/artifacts/weather-app/android/app/src/main/AndroidManifest.xml) — versionCode 2, versionName 2.0.0, four permissions as listed above
- Release AAB (`app-release.aab`, published release asset) SHA-256: `55366377d50c00dfc53e8bc2e049ec298cd5c087e2de0db2eb8353b182f771b4`

These statements describe the tagged source and the verified release AAB. They do **not** establish that Google Play currently serves that AAB or that its Play-served permission display matches it; the Play bundle discrepancy is unresolved and requires Play Console evidence.

## Supported versions

The public `v2.0.0` tag (commit `c371300b3908a8f9805078f26159ff1a44f6538a`) is the Android 2.0.0 release and is supported. The default branch (`main`) is the development branch and receives fixes. V1 (versionCode 1) remains documented for installed V1 clients but is superseded by V2. For current Android release and Google Play distribution status, consult the maintained release checklist rather than this security policy.
