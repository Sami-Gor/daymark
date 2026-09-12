# Daymark Android production readiness audit

Scope: Capacitor shell on `migration/capacitor-native-shell` at `24b2b5e`.
Method: repository/static inspection, artifact inspection of the signed release
APK/AAB, emulator runtime checks from the migration and performance passes.
No code or configuration changes were made by this audit. Findings are
classified per item as **READY**, **PHYSICAL DEVICE TEST REQUIRED (PDT)**,
**MANUAL PLAY CONSOLE ACTION (MANUAL)**, **MUST FIX**, or **OPTIONAL**.

## 1. Build / release pipeline

Verified from the current tree:

| Check | Result |
|---|---|
| Debug build | passes (`:app:assembleDebug`) |
| Release APK | passes (`:app:assembleRelease`, R8 minification on) |
| Release AAB | passes (`:app:bundleRelease`); `jarsigner -verify` → verified |
| Signing | upload keystore copy inside the Android project, `keystore.properties`, not tracked |
| Certificate | `CN=Daymark Upload`, SHA-256 `3C:60:AD:…:20:57` |
| versionCode / versionName | `1` / `1.0.0` |
| SDKs | compile/target 36, min 24 (Capacitor 8 minimum) |
| Native libs in AAB/APK | `arm64-v8a` only (`libkokoro_jni.so`, `libc++_shared.so`) |
| Model integrity | APK asset SHA-256 matches documented values (`model_quantized.onnx` `fbae9257…`, `bm_fable.bin` `f8890831…`) |
| Tracked secrets | none (`git ls-files` has no keystores/properties) |
| Production runtime config | bundled assets, no `server.url`, no dev-server dependency |
| `pnpm audit --prod` | no known vulnerabilities |
| R8 keep rules | Kokoro JNI + Capacitor plugin rules present; release smoke test passed |

Notes:
- `arm64-v8a` only is intentional (Kokoro native library target). Devices
  without 64-bit ARM are filtered by Play; x86_64 emulators cannot run the
  production build (use an arm64 AVD).
- `versionCode 1` is valid for the first upload; every later upload needs a bump.
- `keystore.properties` is required for a signed release build; without it the
  release build fails. Keep the upload key backed up (Play App Signing makes
  upload-key loss recoverable, but only after it is enabled).

Clean-build instructions (verified path, network required for downloads):

```bash
# prerequisites: Node 26+, pnpm 12+, Rust 1.98.1 + aarch64-linux-android target,
# Android NDK 29.0.14206865, JDK 21, Android SDK 36

pnpm install

# 1. Kokoro assets (downloads model + bm_fable, verifies SHA-256)
android/kokoro-poc/scripts/fetch-kokoro-assets.sh

# 2. Rust JNI library (clones pguso/kokoro at the pinned commit, cross-compiles,
#    copies libs into both the rollback TWA project and the Capacitor plugin)
ANDROID_NDK_HOME=$HOME/.bubblewrap/android_sdk/ndk/29.0.14206865 \
  android/kokoro-poc/scripts/build-kokoro-android.sh

# 3. Web bundle + Capacitor sync
cd artifacts/weather-app
pnpm build
pnpm exec cap sync android

# 4. Android builds (signing requires android/keystore.properties + keystore)
cd android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleDebug
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleRelease :app:bundleRelease
```

Generated material (`daymark-voice/src/main/assets/kokoro`, `jniLibs`,
`app/src/main/assets/public`) is gitignored and reproduced by steps 1–3.

## 2. Google Play requirements

Repository-side readiness:

| Item | Status |
|---|---|
| AAB packaging | READY |
| targetSdk 36 (current requirement) | READY |
| 64-bit support | READY (arm64-v8a) |
| Package identity `io.github.sami_gor.daymark` | READY |
| Privacy policy URL | READY (`https://daymark-weather.pages.dev/privacy`, HTTP 200, operator + contact + GeoNames/Open-Meteo disclosure) |
| Ads | none (repo) |
| Login/app access | none; all features reachable without accounts |
| Notifications | none |
| Foreground services | none |
| Storage permissions | none |

Play Console actions still required (MANUAL, cannot be verified from the repo):

1. Enable/confirm Play App Signing and copy the **app signing key** SHA-256
   fingerprint; also copy the **upload key** fingerprint already in this repo.
2. Complete Data Safety (see §10): location (approximate/precise), audio
   (speech recognition), and third-party processing disclosures.
3. Content rating questionnaire (weather utility, no ads, no user content).
4. App access declaration: fully accessible without restrictions.
5. Declare the location and microphone permissions in the store listing where
   requested, with the in-app purpose strings.
6. Closed-testing requirement applicable to personal developer accounts
   (testers/duration gate) before production access; confirm account type.
7. Store listing assets, screenshots, feature graphic (outside this audit).
8. Upload `app-release.aab`; bump `versionCode` for subsequent uploads.

## 3. Digital Asset Links / App Links

- Intent filter: `https://daymark-weather.pages.dev`, `autoVerify`, on
  `MainActivity` (only this host).
- Runtime routing: `resolveDeepLink()` accepts only
  `daymark-weather.pages.dev`/`localhost` and routes through the SPA; cold and
  warm links verified on the emulator (`/privacy`, `/fr/privacy`).
- Production `/.well-known/assetlinks.json` currently returns the SPA HTML
  fallback (verified again during this audit): **DAL is not deployed**, so
  App Links will not verify and links may open in the browser/chooser.

**MANUAL blocker (external):** the Play App Signing fingerprint is required.
Final structure to deploy at `https://daymark-weather.pages.dev/.well-known/assetlinks.json`
(content-type `application/json`):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "io.github.sami_gor.daymark",
      "sha256_cert_fingerprints": [
        "<PLAY_APP_SIGNING_SHA256>",
        "3C:60:AD:BB:70:EB:70:4C:26:A7:B8:16:C2:6A:FC:B4:06:E2:A1:0A:ED:32:2A:EE:AB:A9:3C:6C:B0:81:20:57"
      ]
    }
  }
]
```

`use_as_origin` is not needed (that relation existed for TWA postMessage, which
is retired). Keep the upload fingerprint for sideloaded builds. Verify after
deploy with `adb shell pm verify-app-links --re-verify io.github.sami_gor.daymark`
and Play's App Links checker, then re-test cold/warm links (PDT).

## 4. Permissions

Merged release manifest contains exactly:

| Permission | Why | Runtime prompt | Denial handling | Verdict |
|---|---|---|---|---|
| `INTERNET` | weather APIs + WebView | no | non-issue | READY |
| `ACCESS_COARSE_LOCATION` | "Use my location" (WebView geolocation) | yes (Capacitor prompts for both) | friendly toast (`locationDenied`) | READY |
| `ACCESS_FINE_LOCATION` | precise fix for the same flow | yes | same | READY |
| `RECORD_AUDIO` | AskDaymark speech recognition | yes (Capacitor WebView permission handler) | UI error state, no crash | PDT |
| `MODIFY_AUDIO_SETTINGS` | required by Capacitor alongside `RECORD_AUDIO` for WebView capture | no (normal) | n/a | READY |
| `…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX auto-added, app-private | no | n/a | READY |

No notifications, foreground-service, storage or background-location
permissions. No clearly dead permission found; nothing removed.

## 5. Location

Implementation (`src/App.tsx`): explicit user gesture, `ensureLocalityIndex()`
runs in parallel, coordinates rounded to 2 decimals (~1 km) before any network
call, stale-intent token guard, locality label resolved locally from the
bundled GeoNames dataset, weather fetched once per intent, timeout 12 s,
`maximumAge` 5 min, `enableHighAccuracy: false`.

Error mapping: unsupported API, `PERMISSION_DENIED` (code 1), `POSITION_UNAVAILABLE`
(code 2), `TIMEOUT` (code 3), each with distinct copy; errors dismiss on retry.
No background location, no continuous tracking, nothing persisted.

**PDT:** first-fix latency, permission prompt UX, "don't ask again"/permanent
denial, approximate-only grant, provider-off/GPS-off, denial then settings
change, call/background interruption. The emulator has no fresh fused fix and
blocks mock providers, so no on-device location behavior is proven by this
audit.

## 6. Microphone / speech recognition

Path: AskDaymark → `voice-input-browser.ts` → WebView
`SpeechRecognition`/`webkitSpeechRecognition` (function present in the tested
WebView). Single-shot sessions, explicit user action, monotonic session tokens
prevent stale callbacks, transcript used in-memory only, never logged or stored.
The module explicitly documents that the browser/platform may process speech
remotely.

Classification: **device-dependent and potentially cloud-dependent** — Daymark
does not implement local speech recognition. The UI already discloses "Voice
recognition is handled by your browser or device and may use its speech
service." If the WebView delegates to the Google speech service, audio may
leave the device; this must be disclosed in Data Safety.

**PDT:** real recognition availability on AOSP vs Google-certified builds,
permission denial/retry, offline behavior, microphone conflict while Kokoro
plays, lifecycle interruption, and failure copy.

## 7. Local TTS / Kokoro

VERIFIED/READY:

- Engine initializes once per process off the UI thread; `speak()` waits for
  READY with a 45 s bound; resident until the bridge is destroyed.
- Model/voice load from `filesDir` copies of bundled assets; hashes match.
- JNI returns error strings/nulls; Java falls back to whole-text synthesis if a
  segment plan does not match, then to the monolithic path if streaming cannot
  start; browser/system TTS is only used when native is unavailable.
- AudioTrack is created per narration and released in `finally`; Stop pauses and
  flushes immediately, clears the pending stream, resolves the pending call.
- Pause stops narration; audio focus (`GAIN_TRANSIENT`) is requested per
  utterance, lost focus stops playback, duck events are ignored.
- Process restart re-initializes cleanly (validated repeatedly).
- Segmentation invariants unit-tested; native re-validates the plan.
- Offline English narration verified with airplane mode.
- No narration text is sent over the network, persisted, or included in
  analytics; no log statement contains spoken text (audited `Log.*`, Rust
  `log::`/`eprintln!`, TS `console.*`).
- Memory: PSS plateaus (no per-narration growth); model session reused.

Notes:
- `panic = "abort"` in the Rust release profile means an unexpected Rust panic
  would abort the process (no `catch_unwind`). Panics were not observed; treat
  as a residual risk covered by device testing.
- Bluetooth/headphone routing relies on default AudioTrack routing; untested.

**PDT:** headphones/Bluetooth, music/navigation interruption, phone call
interruption, long narration thermal behavior, real-device latency.

## 8. Memory / performance

Emulator (API 36, 4 GB AVD) values, not device guarantees:

| Metric | Value |
|---|---|
| Launch to weather visible | ~6.6 s (release, includes network) |
| Kokoro init (process start) | 2.7–3.5 s warm; 9–13 s cold/under load |
| First audio after "Hear today" | 2.33–2.59 s warm (first segment 27 chars); ~1.9 s faster than before segmentation |
| Total narration audio | ~26.1 s for the current briefing |
| Steady PSS | ~626–629 MB peak (Kokoro ~470 MB + WebView/app) |
| Repeated narration | stable, no native growth |

The ~600 MB peak is the main device-risk item: it is acceptable on modern
flagships but must be validated on 4 GB mid-range and lower-memory devices,
including background process death and recovery. No low-memory callbacks are
implemented beyond the platform default; Android may kill the process while
backgrounded, and the app cold-starts again (acceptable, but confirm UX).

## 9. Battery / thermal

Expected costs (not yet measured on hardware): one-off model load CPU burst;
per-narration CPU at roughly real-time synthesis on the emulator (real devices
expected faster); GPS radio only during "Use my location"; microphone only
during recognition; no background services, no wake locks, no analytics.
PDT: battery drain per 10 minutes of narration, device temperature, throttled
performance after sustained narration, and cold-start after low-power mode.
No speculative claims are made here.

## 10. Privacy / data flow map

| Data | Origin | Stored | Sent externally | Recipient | Retained |
|---|---|---|---|---|---|
| Precise location | Device GPS | No (in-memory) | Rounded to 2 decimals before send | Open-Meteo (forecast) | No |
| Weather query | App | No | Yes: rounded coordinates + options | `api.open-meteo.com`, `air-quality-api.open-meteo.com` | Provider-side per their policy |
| Location search text | User input | No | Yes, when searching | `geocoding-api.open-meteo.com` | Provider-side |
| Locality name lookup | `localities-v1.json` | Bundled + Cache Storage | No | — | On device |
| Microphone audio | User gesture | No | Depending on platform speech service (possibly Google) | OS/browser speech service | Outside app control |
| Recognition transcript | Speech service | No | No (in-memory only) | — | No |
| TTS narration text | Intent layer | No | **No** for English (Kokoro local); device TTS engine for fr/es may fetch voice data | Google/system TTS (fr/es only) | No |
| Preferences | App | `localStorage` (`daymark.locale`) | No | — | Until cleared |
| Analytics | none | — | — | — | — |
| Crash reports | none in-app | — | — | — | — |
| App logs | Instrumentation | logcat only | No | — | Device log buffer |

Privacy summary (usable for policy/Data Safety): Daymark sends only rounded
(≈1 km) coordinates and weather/search queries to Open-Meteo; locality naming
uses a bundled GeoNames dataset; English narration runs entirely on-device with
the bundled Kokoro model; no analytics, no ads, no accounts, no narration text
or location history is stored or transmitted; speech input is handled by the
platform/browser speech service and may be processed remotely by that provider.

## 11. Logging / debugging

- No `spokenText`, transcript or coordinates in any log statement (audited).
- Java release logs (`KokoroLocalTtsEngine`, `DaymarkVoice`): initialization
  timings, segment counts/lengths, chunk timing, PSS and sample counts. No user
  content; useful diagnostics.
- Rust release logs (`android_logger`): model path, voice name, timing, chunk
  metrics. Local path only.
- Web console (`console.info`): platform, selected engine, segment count; goes
  to logcat via Capacitor only in debug builds.
- Capacitor native logging defaults to debug-only (`loggingBehavior: debug`,
  gated by `FLAG_DEBUGGABLE`); WebView debugging is disabled in release.
- Classification: safe to retain (no sensitivity); OPTIONAL to reduce
  verbosity (see cleanup checklist).

## 12. Security

READY:

- No cleartext traffic (`usesCleartextTraffic` absent, `allowMixedContent: false`).
- App UI loads only bundled assets from `https://localhost`; no `server.url`.
- External navigations are handed to the system browser; the app host never
  loads remote HTML.
- Only `MainActivity` is exported (launcher + verified-app-link filter);
  `FileProvider` and `InitializationProvider` are not exported;
  `ProfileInstallReceiver` is exported but protected by `android.permission.DUMP`.
- No foreground services, no pending intents, no dynamic receivers of ours.
- Deep-link parsing validates scheme/host and never executes input.
- JNI surface: exact-name keeps; text passed as managed strings; no file path
  from user input; assets copied from the APK to fixed names.
- WebView debugging off in release; remote code loading not possible.

OPTIONAL hardening:

- No CSP applies inside the native shell (the `_headers` CSP is only sent by
  the web host). There is no dynamic HTML injection and XSS regression tests
  exist; a `<meta http-equiv="Content-Security-Policy">` for the native origin
  would add defence in depth.
- `CapacitorHttp` is registered but disabled by default and not configured.

## 13. Dependency / supply chain

- npm/pnpm: exact Capacitor versions (`8.5.1`, `@capacitor/app 8.1.1`), pnpm
  lockfile committed; `pnpm audit --prod` clean.
- Gradle: AGP 8.13.0, Gradle 8.14.3, JDK 21 required; Capacitor/AndroidX from
  Google Maven; no unexpected repositories.
- Rust: `Cargo.lock` committed; `ort 2.0.0-rc.13` + ONNX Runtime 1.28.2
  downloaded at build time by `ort-sys` (build-time network dependency).
- Kokoro: cloned by script at pinned commit
  `b42bd5cf915163607cb51984cabf273dcf09755e` (network at build time).
- No git dependencies beyond the pinned clone; no postinstall scripts in added
  packages.
- Builds are reproducible from a clean checkout with network access and the
  documented toolchain; the NDK/Rust versions are documented.

## 14. Licensing

| Component | License | Redistributed | Notes |
|---|---|---|---|
| pguso/kokoro (`kokoro-en` 0.1.5) | Apache-2.0 | compiled | attribution in README |
| Kokoro model weights | Apache-2.0 (upstream repo) | asset | verify upstream card |
| `bm_fable.bin` voice | Apache-2.0 (per model repo) | asset | per-voice training provenance not documented upstream — unresolved, low risk |
| ONNX Runtime 1.28.2 | MIT | linked | build-time download |
| `ort`/`ort-sys` | MIT OR Apache-2.0 | compiled | |
| Rust crates (tokio, jni, log, android_logger, bincode, fancy-regex, regex, futures, pin-project, ndarray, num2words, unicode-segmentation, misaki-rs, cmudict-fast, waken_snowball) | MIT/Apache-2.0/BSD-3 | compiled | permissive |
| `language-tokenizer` 0.1.0 | **WTFPL-2.0** via `license-file` | compiled | previously flagged as missing license; the crate ships `LICENSE.md` (WTFPL v2), a permissive license — **cleared** |
| espeak-ng | GPL-3.0 | not included | verified absent (Misaki-only G2P) |
| Capacitor core/cli/android/app | MIT | compiled | |
| AndroidX/Google libraries | Apache-2.0 | compiled | |
| Fonts (Fraunces, Plus Jakarta Sans, DM Mono) | SIL OFL-1.1 | asset | license files in `src/fonts` |

No copyleft obligations in the distributed binary. The only residual licensing
item is the undocumented per-voice training-data provenance of `bm_fable`:
unresolved but low risk (official voice collection, Apache-2.0 declared).

## 15. Accessibility

Web-side (automated): axe-core checks run in the 133-test e2e suite across
widths and flows; the Hear today control has an `aria-label` that swaps between
start/stop, `aria-pressed` reflects state, buttons are real `<button>` elements,
touch targets follow the 44 px minimum, `prefers-reduced-motion` is honoured,
and error/loading copy is text-based.

PDT (Android-specific): TalkBack focus order and announcements for the voice
button state, system font scaling at 200%, display size changes, keyboard
navigation inside the WebView, and colour-contrast verification on device
profiles. No code defects found in static review.

## 16. Offline / network failure

VERIFIED: shell assets, fonts, icons, locality dataset and Kokoro all load
offline (airplane mode); English narration completes offline; weather shows the
existing retry error ("That forecast went cloudy") without infinite spinners or
crashes; app restart offline works; deep links route offline to bundled routes.
Daymark cannot provide weather data offline and does not cache Open-Meteo
responses by design.

## 17. Error states

| Failure | Handling |
|---|---|
| No location permission / unavailable / timeout | distinct friendly copy, retryable, no crash (PDT for prompt flows) |
| Network unavailable / API timeout / malformed response | validated response → retry UI, no infinite loading |
| Kokoro init failure | plugin rejects → router falls back to browser/system TTS; native marked error for the session |
| Kokoro synth/playback failure | error state, listener notified, no crash |
| Microphone denied / recognition unavailable | UI error; no crash (PDT) |
| System TTS unavailable | speak rejection surfaces as a state reset; no crash |
| Unsupported language | fr/es use system TTS; if unavailable the control hides rather than failing silently |
| Low memory / process restart | cold start; engine re-initializes; in-memory briefing regenerated |

## 18. Physical-device test matrix

Device classes: **A** recent flagship (e.g. Pixel 9/10 class), **B** mid-range
(4–6 GB, e.g. Pixel a-series / Galaxy A), **C** older supported (Android 7–9,
3–4 GB, arm64).

| # | Test | A | B | C | Pass criteria |
|---|---|---|---|---|---|
| 1 | Install release AAB via Play internal testing | ✓ | ✓ | ✓ | installs, launches, no crash |
| 2 | Cold launch online | ✓ | ✓ | ✓ | weather visible < 5 s; no ANR |
| 3 | Location first grant | ✓ | ✓ | ✓ | prompt shown once; city updates; no precise coords on the wire |
| 4 | Location deny + permanent deny | ✓ | ✓ | ✓ | friendly copy; retry flow; no crash |
| 5 | Hear today (English) | ✓ | ✓ | ✓ | Kokoro audio; first audio < 2 s A, < 4 s B/C |
| 6 | Repeat narration ×5 | ✓ | ✓ | ✓ | no overlap, latency stable, memory stable |
| 7 | Stop mid-sentence | ✓ | ✓ | ✓ | immediate silence; next speak works |
| 8 | Headphones | ✓ | ✓ | ✓ | audio routed, Stop works |
| 9 | Bluetooth speaker/headset | ✓ | ✓ | ✓ | routed; disconnect during narration does not crash |
| 10 | Music playing → Hear today | ✓ | ✓ | ✓ | focus pause/duck per system; resumes after |
| 11 | Incoming call during narration | ✓ | ✓ | ✓ | narration stops; no crash |
| 12 | Microphone input (Ask Daymark) | ✓ | ✓ | ✓ | permission prompt; transcript appears; denial copy |
| 13 | Background/foreground | ✓ | ✓ | ✓ | narration stops on home; app returns READY |
| 14 | Screen lock/unlock | ✓ | ✓ | ✓ | narration stops; no crash |
| 15 | Airplane mode restart → Hear today | ✓ | ✓ | ✓ | shell loads; weather retry UI; narration works offline |
| 16 | Deep link cold/warm (after DAL) | ✓ | ✓ | ✓ | opens in app at `/privacy`, `/fr/privacy`; back returns |
| 17 | Upgrade install over previous build | ✓ | ✓ | ✓ | data/settings preserved; no crash |
| 18 | Battery/thermal after 10 min narration | ✓ | ✓ | ✓ | no thermal warning; drain acceptable |
| 19 | Low-memory kill while backgrounded | ✓ | ✓ | ✓ | relaunch cold-starts cleanly |
| 20 | Rotation while idle/narrating | ✓ | ✓ | ✓ | no audio glitch; layout intact |
| 21 | TalkBack + 200% font | ✓ | ✓ | ✓ | controls announced; no clipping |
| 22 | French/Spanish narration | ✓ | ✓ | ✓ | system TTS used; voice data present; clear error if absent |

## 19. Cleanup checklist (do not remove yet)

- TWA rollback project `android/`, `twa-manifest.json`, `asset-links/` template
  and `androidbrowserhelper` dependency — keep until the Capacitor shell has
  shipped and a rollback is no longer needed.
- `artifacts/weather-app/src/hooks/use-browser-speech.ts` — unused in
  production (the unified hook uses `lib/voice-browser` directly).
- `KokoroTtsTestActivity` (TWA project only) — diagnostic, not in the
  Capacitor build.
- Sherpa archives on `poc/local-tts` (tag/branch) — keep as history.
- Verbose release logging (chunk timing, PSS) — optional reduction to
  warn/error plus a single init/READY line.
- `sw.js` in the bundled native assets — harmless but unused inside Capacitor.

## 20. Final readiness matrix

| Area | Status | Severity | Evidence | Required action |
|---|---|---|---|---|
| Build/signing/versioning | READY | — | builds pass, AAB verified, hashes match | none |
| Play App Signing fingerprint | MANUAL | blocks App Links | production assetlinks absent | enable signing, copy fingerprint |
| assetlinks.json deployment | MANUAL | blocks App Links | SPA fallback served at path | deploy exact JSON from §3 |
| Data Safety / content rating / store forms | MANUAL | release gate | repo-side data map ready | complete in Play Console |
| Closed testing (personal account) | MANUAL | release gate | account-type dependent | confirm + run testers |
| Location behavior | PDT | medium | emulator cannot provide fix | device matrix #3–#4 |
| Speech recognition | PDT | medium | WebView API depends on platform service | device matrix #12 |
| Audio focus/BT/calls | PDT | medium | not testable on emulator | device matrix #8–#11 |
| Memory on lower-RAM devices | PDT | medium | ~626 MB emulator peak | device matrix #5–#6, #19 |
| Battery/thermal | PDT | low-medium | not measured | device matrix #18 |
| Accessibility (TalkBack/font scale) | PDT | low-medium | web automations pass | device matrix #21 |
| Real-device latency | PDT | low | emulator ~2.4 s | device matrix #5 |
| Privacy/data flow | READY | — | no analytics, rounded coords, no text logs | feed into Data Safety |
| Security (WebView/bridge/components) | READY | — | audit §12 | optional CSP hardening |
| Licensing | READY | — | WTFPL cleared; permissive stack | note bm_fable provenance |
| Dependencies | READY | — | prod audit clean, pinned versions | none |
| Offline behavior | READY | — | airplane-mode checks | none |
| Error states | READY | — | code audit + e2e | device polish |
| Release logging | OPTIONAL | low | no user content | reduce verbosity later |
| Resource shrinking | OPTIONAL | low | not enabled | consider post-launch |
| CSP in native shell | OPTIONAL | low | no CSP headers native | consider meta CSP later |

### A. MUST FIX BEFORE RELEASE
None found in code or packaging. All gating items are external (Play App
Signing/assetlinks/console forms) or require physical-device validation.

### B. REQUIRES PHYSICAL DEVICE VALIDATION
Location flows, speech recognition, audio focus/Bluetooth/calls, real-device
latency, memory/thermal/battery on 3–6 GB devices, TalkBack/font scaling, app
links after DAL deployment, fr/es system TTS with real voice data, upgrade
install.

### C. READY NOW
Build and signing pipeline, package/SDK/ABI configuration, model/voice
integrity, Kokoro lifecycle/Stop/offline/no-text-logging, segmentation
invariants, privacy data map, WebView/bridge security configuration, component
exposure, dependency hygiene, offline shell, web tests (214 unit / 133 e2e),
production web build, privacy policy URL.

### D. OPTIONAL POST-LAUNCH
Reduce release log verbosity, add a native-shell CSP meta tag, enable resource
shrinking, remove the unused browser-speech hook, archive the TWA project,
consider a low-memory/trim listener, evaluate per-voice provenance documentation
with the upstream voice source.

## 21. Release sequence

1. Physical-device validation (matrix #1–#22 on at least one A and one B device;
   C best effort).
2. Play Console: enable App Signing, copy fingerprints, complete Data Safety,
   content rating, app access, ads declaration.
3. Deploy `assetlinks.json` with Play + upload fingerprints; verify with Play
   link checker and `pm verify-app-links`; re-test cold/warm links.
4. Upload the AAB to internal/closed testing; smoke test the Play-signed install.
5. Run the closed-testing gate if required by the account type.
6. Staged production rollout (e.g. 10% → 50% → 100%) while watching vitals for
   ANRs/crashes, especially memory-related kills.
7. Keep the TWA rollback tag until the production rollout is stable.
