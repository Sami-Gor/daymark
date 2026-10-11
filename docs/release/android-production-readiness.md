# Daymark Android production readiness audit

Scope: Capacitor shell, audited on `migration/capacitor-native-shell` (snapshot
at `24b2b5e`; later commits resolved the minor findings below). The migration
is now merged into `main` (PR #15).
Method: repository/static inspection, artifact inspection of the signed release
APK/AAB, emulator runtime checks from the migration and performance passes.
No code or configuration changes were made by this audit. Status labels are
used as follows: **READY** means evidenced as working; **MANUAL PLAY CONSOLE
ACTION (MANUAL)** means a check in the live Console; **MUST FIX** means a
release-blocking defect; and **OPTIONAL** means extra assurance, not a release
gate. Legacy **PDT** labels below refer only to additional device coverage that
was not in the recorded Nothing A059P pass. They do not mean repeat the core
device pass. Section 18 records the completed pass; Sections 20–21 state the
current status and what actually remains.

## 1. Build / release pipeline

Verified from the current tree:

| Check | Result |
|---|---|
| Debug build | passes (`:app:assembleDebug`) |
| Release APK | passes (`:app:assembleRelease`, R8 minification on) |
| Release AAB | passes (`:app:bundleRelease`); `jarsigner -verify` → verified |
| Signing | upload keystore copy inside the Android project, `keystore.properties`, not tracked |
| Certificate | `CN=Daymark Upload`, SHA-256 `34:6B:BE:…:FA:7E` (rotated 2026-09-13; the earlier `3C:60:AD:…:20:57` key is retired) |
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
# prerequisites: Node 24 (CI-tested), pnpm 12+, Rust 1.98.1 + aarch64-linux-android target,
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

Play Console status (manual, cannot be verified from the repo):

1. Play App Signing enrolled via the first upload; the **app signing key**
   SHA-256 still needs to be copied from Play Console → App integrity.
2. Data safety was previously reported complete, but must be rechecked before
   production. Assess the user-initiated location request, WebView speech input,
   and speech-output handoff to browser/system TTS. Do not infer “not collected”
   solely because Daymark itself stores none of these values: controlled WebView
   flows and any off-device provider processing must be assessed under current
   Play guidance, including the conditions for ephemeral processing. See
   [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469).
3. Content rating, target audience, ads (no ads; advertising ID = No),
   government/financial/health, app access and AI asset declarations were
   previously marked complete in the checklist; verify their current Console
   status and confirm the declarations still match the shipped version.
4. The store listing/default listing was previously marked complete. Verify
   status and listed assets in Console before production.
5. Closed testing is **reported complete by the maintainer (11 October 2026)**.
   Repository notes record the first AAB (`309abe94…`, 96,463,981 bytes), the
   Google Group `daymark-testers@googlegroups.com`, and all countries/regions.
   The live track and tester metrics are not independently verifiable here.
6. **Production-access application status is partly known.** The maintainer
   confirmed that **Apply for production is available** in Play Console on
   11 October 2026. Whether the form has since been submitted, approved, or
   returned for additional testing is not verified here. Record the actual live
   state before following the next step.
7. The Daymark website is already deployed. The separate
   `/.well-known/assetlinks.json` endpoint needs a fresh live check: the last
   recorded check returned the SPA HTML fallback, and the JSON file is absent
   from this branch. Do not redeploy the site from scratch. If the endpoint is
   still incorrect, add/publish that single JSON asset after obtaining the Play
   app-signing SHA-256; do not substitute the upload-key fingerprint. This
   affects verified App Links, not basic AAB file upload.

## 3. Digital Asset Links / App Links

- Intent filter: `https://daymark-weather.pages.dev`, `autoVerify`, on
  `MainActivity` (only this host).
- Runtime routing: `resolveDeepLink()` accepts only
  `daymark-weather.pages.dev`/`localhost` and routes through the SPA; cold and
  warm **in-app URL routing** were tested on the emulator (`/privacy`,
  `/fr/privacy`). This did not establish Android's website-domain verification,
  which depends on the separate Digital Asset Links association file.
- The Daymark website itself is already deployed at
  `https://daymark-weather.pages.dev`.
- The last result recorded by this repo's audit was that the separate
  `/.well-known/assetlinks.json` path returned the SPA HTML fallback. The
  actual JSON file is also absent from this branch. I could not independently
  recheck the live endpoint in this session, so treat that as the last recorded
  result, not a new live verification.
- **Action:** check the endpoint first. If it already serves valid JSON with
  the correct package and Play app-signing SHA-256, no deployment is needed.
  If not, publish the missing/corrected JSON asset through the existing
  website deployment workflow; this is an update to the deployed site, not an
  initial website deployment.

**Manual dependency:** the Play App Signing fingerprint is required.
The expected JSON structure for `https://daymark-weather.pages.dev/.well-known/assetlinks.json`
(content-type `application/json`) is:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "io.github.sami_gor.daymark",
      "sha256_cert_fingerprints": [
        "<PLAY_APP_SIGNING_SHA256>",
        "34:6B:BE:F3:43:8C:6F:E8:1E:89:F6:3F:C0:A0:FF:29:E9:6D:A1:98:98:74:E6:BA:18:7A:9E:52:C3:AA:FA:7E"
      ]
    }
  }
]
```

`use_as_origin` is not needed (that relation existed for TWA postMessage, which
is retired). Keep the upload fingerprint for sideloaded builds. After the
endpoint is confirmed correct, check Android domain verification with
`adb shell pm verify-app-links --re-verify io.github.sami_gor.daymark` and Play's
App Links checker. Only test cold/warm opens if verified App Links have not
already been verified or the website's association file changes. This is a
specific App Links check, not a repeat of core device testing.

## 4. Permissions

Merged release manifest contains exactly:

| Permission | Why | Runtime prompt | Denial handling | Verdict |
|---|---|---|---|---|
| `INTERNET` | weather APIs + WebView | no | non-issue | READY |
| `ACCESS_COARSE_LOCATION` | "Use my location" (WebView geolocation) | yes (Capacitor prompts for both) | friendly toast (`locationDenied`) | READY |
| `ACCESS_FINE_LOCATION` | precise fix for the same flow | yes | same | READY |
| `RECORD_AUDIO` | AskDaymark speech recognition | yes (Capacitor WebView permission handler) | UI error state, no crash | Core voice-input flow passed on device (§18); denial/retry edge cases are optional extra coverage |
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

**Already tested on a physical device:** the user-initiated location flow
resolved the locality and refreshed the weather successfully (§18). The
emulator limitation explains why that emulator could not supplement the real
device result; it does not negate the recorded physical-device pass.
Additional edge cases—permanent denial, approximate-only grant, provider/GPS
off, denial then settings change, and call/background interruption—were not part
of that pass and are optional extra coverage.

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

**Already tested on a physical device:** AskDaymark received a transcript and
displayed an answer (§18). Additional compatibility and edge-case coverage—
AOSP versus Google-certified builds, denial/retry, offline recognition,
microphone conflict during narration, lifecycle interruption, and failure copy—
was not all covered in the recorded pass. This is optional extra coverage, not
a requirement to repeat the successful core voice-input test.

## 7. Local TTS / Kokoro

VERIFIED/READY:

- Engine initializes once per process off the UI thread; `speak()` waits for
  READY with a 45 s bound; resident until the bridge is destroyed.
- Model/voice load from `filesDir` copies of bundled assets; hashes match.
- JNI returns error strings/nulls; Java falls back to whole-text synthesis if a
  segment plan does not match, then to the monolithic path if streaming cannot
  start; French/Spanish use the system engine by design, while English
  narration failures surface an error and never fall back to system TTS.
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

**Core narration already tested on a physical device:** playback, Stop,
restart without overlap, and basic lifecycle handling passed (§18).
Headphones/Bluetooth, music/navigation and call interruption, a long thermal
soak, and formal latency benchmarking were not covered in that brief pass and
are optional extended QA.

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

The ~600 MB emulator peak is the main remaining compatibility uncertainty for
lower-memory devices. The recorded Nothing A059P check was a short stability
pass, not a low-memory soak. Testing on 4 GB mid-range/lower-memory devices and
checking background process death/recovery would add assurance, but are optional
broader-compatibility tests—not a reason to repeat the core device test. Android
may kill the process while backgrounded; the app is expected to cold-start again.

## 9. Battery / thermal

Expected costs (not yet measured on hardware): one-off model load CPU burst;
per-narration CPU at roughly real-time synthesis on the emulator (real devices
expected faster); GPS radio only during "Use my location"; microphone only
during recognition; no background services, no wake locks, no analytics.
Optional extended hardware QA: battery drain over 10 minutes of narration,
device temperature, throttled performance after sustained narration, and
cold-start after low-power mode. The recorded device session included a short
stability/temperature observation, not a 10-minute thermal soak. No claim is
made that the extended soak was completed; it is not a blanket release gate.

## 10. Privacy / data flow map

| Data | Origin | Stored | Sent externally | Recipient | Retained |
|---|---|---|---|---|---|
| Precise location | Device GPS | No (in-memory) | Rounded to 2 decimals before send | Open-Meteo (forecast) | No |
| Weather query | App | No | Yes: rounded coordinates + options | `api.open-meteo.com`, `air-quality-api.open-meteo.com` | Provider-side per their policy |
| Location search text | User input | No | Yes, when searching | `geocoding-api.open-meteo.com` | Provider-side |
| Locality name lookup | `localities-v1.json` | Bundled + Cache Storage | No | — | On device |
| Microphone audio | User gesture | No | Depending on platform speech service (possibly Google) | OS/browser speech service | Outside app control |
| Recognition transcript | Speech service | No | No (in-memory only) | — | No |
| TTS narration text | Intent layer | No | Android English: no, local Kokoro; web and Android fr/es: handed to browser/system speech API, whose processing depends on provider/voice configuration | Browser speech service or Android system TTS for relevant paths | Daymark does not retain it; provider-side processing/retention depends on service |
| Preferences | App | `localStorage` (`daymark.locale`) | No | — | Until cleared |
| Analytics | none | — | — | — | — |
| Crash reports | none in-app | — | — | — | — |
| App logs | Instrumentation | logcat only | No | — | Device log buffer |

Privacy summary (for policy/Data Safety review): Daymark sends user-initiated
rounded coordinates and weather/search queries to Open-Meteo; locality naming
uses a bundled GeoNames dataset. Android English narration runs locally through
the bundled Kokoro model. Web narration and Android French/Spanish narration are
handed to browser/system speech APIs; their processing depends on the selected
provider and voice. Daymark does not retain narration text or location history
and has no backend; Ask Daymark input is handed to the browser/platform
recognition service and may be processed remotely. Assess these provider flows
against current Data safety definitions rather than treating “not stored by
Daymark” as equivalent to “not transmitted off device.”

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
- Only `MainActivity` is exported (launcher + HTTPS App Links intent filter
  declaring `autoVerify`; successful domain verification depends on the
  Digital Asset Links endpoint); `FileProvider` and
  `InitializationProvider` are not exported;
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

Web-side (automated): axe-core checks run in the 153-test e2e suite across
widths and flows; the Hear today control has an `aria-label` that swaps between
start/stop, `aria-pressed` reflects state, buttons are real `<button>` elements,
touch targets follow the 44 px minimum, `prefers-reduced-motion` is honoured,
and error/loading copy is text-based.

The recorded physical-device pass verified layout readability at 1.5× font
scale. Additional Android-specific accessibility checks—TalkBack focus order
and announcements, 200% system font scaling, display size changes, keyboard
navigation and on-device contrast—were not all claimed as completed. Treat
these as optional accessibility QA rather than a reason to repeat the tested
font-scale flow. No code defects were found in static review.

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
| No location permission / unavailable / timeout | distinct friendly copy, retryable, no crash (denial/timeout edge-case tests are additional coverage) |
| Network unavailable / API timeout / malformed response | validated response → retry UI, no infinite loading |
| Kokoro init failure | English surfaces the narration error (no system fallback); fr/es keep their system-TTS path |
| Kokoro synth/playback failure | error state, listener notified, no crash |
| Microphone denied / recognition unavailable | UI error; no crash (denial/unavailable edge-case tests are additional coverage) |
| System TTS unavailable | speak rejection surfaces as a state reset; no crash |
| Unsupported language | fr/es use system TTS; if unavailable the narration error is shown |
| Low memory / process restart | cold start; engine re-initializes; in-memory briefing regenerated |

## 18. Physical-device test matrix

Device classes: **A** recent flagship (e.g. Pixel 9/10 class), **B** mid-range
(4–6 GB, e.g. Pixel a-series / Galaxy A), **C** older supported (Android 7–9,
3–4 GB, arm64). This is a reference matrix for broader coverage across device classes; ✓ marks
applicability, not a claim that every row was executed. The completed Nothing
A059P pass is documented below. **The full matrix is not a blanket release
gate**: do not repeat the core flows already marked as passed in §18 and §20.
Rows not covered in the recorded pass are additional QA unless a specific
release risk makes one necessary.

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

### Brief physical-device validation — 14 September 2026

Brief physical-device validation completed on a Nothing A059P running Android
16. Core launch/weather, location, voice input, local Kokoro narration,
stop/restart behaviour, lifecycle handling, enlarged-font usability and short
stability checks passed. Extended multi-device testing, full TalkBack audit,
long thermal soak, and Play-distributed validation were not part of this brief
merge-confidence pass.

| Item | Value |
|---|---|
| Device | Nothing A059P (`A059P`, AsteroidsProEEA) |
| Android | 16 / API 36 (targetSdk 36) |
| Source commit | `69e21c18374957429be173c9b0b7d87d2e0464f2` |
| APK | `app-release.apk`, 169,135,817 bytes |
| APK SHA-256 | `7e24bbcecac8d6f2a3c5843340cc52691099b503ce90001fb1e1e25b281cb7d0` |
| versionCode / versionName | 1 / 1.0.0 |
| Signer certificate SHA-256 | `346BBEF3438C6FE81E89F63FC0A0FF29E96DA1989874E6BA187A9E52C3AAFA7E` (matches upload key; verified with `apksigner`) |
| A — launch / weather / location | PASS: launch and weather render; permission granted; "Use my location" resolved to the locality (Uxbridge); refresh applied; no crash/ANR |
| B — voice input (Ask Daymark) | PASS: `RECORD_AUDIO` granted; transcript "will it rain today" and the answer both appeared |
| C — Kokoro narration | PASS: start toggles to Stop; audio audible and intelligible; Stop silences immediately; restart plays again with no overlap |
| D — lifecycle | PASS: narration stops on Home; app usable after returning |
| E — font scale + stability | PASS: 1.5x layout readable with no clipping observed; no crash/ANR; battery 35.0 °C, thermal status 0; font restored to 1.0 |
| Signer verification | PASS (`apksigner verify --print-certs`) |
| Bluetooth routing | NOT RETESTED IN BRIEF SESSION (no device connected) |

Not covered by this brief pass: broader coverage across classes A/B/C,
TalkBack, a 10-minute thermal soak, call/music interruption, screen lock,
rotation, low-memory kill, French/Spanish system-TTS voice data, a
Google-Play-distributed install, verified App Links, and upgrade install.
This is a record of scope, not a requirement to rerun already-passed tests.
Additional cases may be tested if broader assurance is wanted or a concrete
risk makes a specific case necessary.

## 19. Cleanup checklist (do not remove yet)

- TWA rollback project `android/`, `twa-manifest.json`, `asset-links/` template
  and `androidbrowserhelper` dependency — keep until the production rollout is
  stable and the rollback path is no longer needed. The core physical-device pass
  is already complete (§18).
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
| Play App Signing fingerprint | PENDING (manual) | blocks App Links | signing enrolled on first upload; app-signing SHA-256 not yet recorded | copy from Play Console → App integrity |
| Digital Asset Links endpoint | NEEDS LIVE RECHECK | blocks verified App Links | Last recorded check returned SPA fallback; site is deployed, but this branch has no actual `.well-known/assetlinks.json` file | check live endpoint; if incorrect, publish only the JSON asset with the Play app-signing SHA-256 |
| Data Safety declaration | RECHECK BEFORE PRODUCTION (manual) | policy accuracy | Previously marked complete; location is sent to Open-Meteo after rounding; speech input may be processed off-device; browser/system TTS also receives narration text | review current Play definitions, actual flows, existing Console answers, and privacy policy; see §10 and the checklist |
| Other Play forms (content rating, target audience, ads, app access, AI asset, etc.) | PREVIOUSLY REPORTED DONE (manual) | release gate | recorded as complete in checklist; live Console state not verified | confirm each still reflects the current app and release |
| Closed testing / production-access | CLOSED TEST COMPLETE (maintainer-confirmed); Apply for production reported available | production-access prerequisite if applicable | Maintainer reports closed-test phase complete and Apply for production available; submission/decision status not verified | inspect current Console application status and record whether submitted/approved/returned |
| Location behavior | CORE DEVICE PASS RECORDED | medium | real-device location use passed in brief validation | no need to repeat the completed location path; extended denial/permanent-denial cases are optional coverage |
| Speech recognition | CORE DEVICE PASS RECORDED | medium | real-device voice input and transcript passed; platform service can vary | no need to repeat the completed voice-input path; service/permission edge cases are optional coverage |
| Audio focus/BT/calls | CORE LIFECYCLE PASS; EXTENDED CASES NOT CLAIMED | medium | Home lifecycle passed; Bluetooth/call/music interruption not included in the recorded brief pass | optional extended QA only, unless you specifically want those cases covered |
| Memory on lower-RAM devices | OPTIONAL EXTENDED QA | medium | ~626 MB emulator peak; recorded real-device pass was short | test lower-RAM device only if expanding coverage |
| Battery/thermal | OPTIONAL EXTENDED QA | low-medium | brief 1-minute pass: 35.0 °C, thermal status 0 | 10-minute soak is optional additional coverage |
| Accessibility (TalkBack/font scale) | FONT-SCALE PASS RECORDED; TALKBACK NOT CLAIMED | low-medium | 1.5x font pass 14 Sep 2026; web automations pass | TalkBack audit is optional additional coverage |
| Real-device latency | CORE DEVICE PASS RECORDED; BENCHMARK OPTIONAL | low | real-device flow was exercised; emulator estimate ~2.4 s | no repeat required; benchmark only if needed |
| Privacy/data flow | READY | — | no analytics, rounded coords, no text logs | feed into Data Safety |
| Security (WebView/bridge/components) | READY | — | audit §12 | optional CSP hardening |
| Licensing | READY | — | WTFPL cleared; permissive stack | note bm_fable provenance |
| Dependencies | READY | — | prod audit clean, pinned versions | none |
| Offline behavior | READY | — | airplane-mode checks | none |
| Error states | READY | — | code audit + e2e | device polish |
| Release logging | OPTIONAL | low | no user content | reduce verbosity later |
| Resource shrinking | OPTIONAL | low | not enabled | consider post-launch |
| CSP in native shell | OPTIONAL | low | no CSP headers native | consider meta CSP later |

### A. CODE/PACKAGING GATE
No release-blocking code or packaging defect was identified in this audit.
That does not mean every external release check is complete: Play Console/Data
safety and verified App Links still need their own checks.

### B. PHYSICAL-DEVICE VALIDATION — CORE PASS COMPLETE
A real-device pass was completed on a Nothing A059P running Android 16 (§18).
Launch/weather, location use, voice input, local Kokoro narration, stop/restart,
lifecycle handling, enlarged-font usability and short stability checks passed.
**The core physical-device test is complete; do not repeat it.** The matrix
retains optional extended QA for other device classes, TalkBack, longer thermal
soak, call/music interruption, Bluetooth routing, French/Spanish system TTS,
verified App Links, upgrade install and Play-distributed install. Consider these
only if additional assurance is needed or a specific release risk warrants them.

### C. READY NOW
Build and signing pipeline, package/SDK/ABI configuration, model/voice
integrity, Kokoro lifecycle/Stop/offline/no-text-logging, segmentation
invariants, privacy data map, WebView/bridge security configuration, component
exposure, dependency hygiene, offline shell, web tests (236 unit / 153 e2e),
production web build, privacy policy URL.

### D. OPTIONAL POST-LAUNCH
Reduce release log verbosity, add a native-shell CSP meta tag, enable resource
shrinking, remove the unused browser-speech hook, archive the TWA project,
consider a low-memory/trim listener, evaluate per-voice provenance documentation
with the upstream voice source.

## 21. Release sequence

1. The physical-device pass on a Nothing A059P (Android 16) in §18 is complete.
   Do not make a second device-testing round a release prerequisite. The extra
   coverage listed in §20B is optional and can be added only if justified by a
   specific risk or by a desire for broader compatibility evidence.
2. In Play Console, check App Signing and record the **app-signing** fingerprint.
   Confirm Data Safety, content rating, app access, ads, target audience, AI
   asset and other applicable declarations. The maintainer reports closed
   testing complete; production-access application status remains unverified.
3. Reconcile Data safety for the user-initiated location request, controlled
   WebView speech-recognition path, and browser/system TTS handoff against
   current Play policy and actual provider behaviour. Google says controlled
   WebView data flows and off-device transmission must be considered; do not
   infer answers solely from lack of app-side storage. See
   https://support.google.com/googleplay/android-developer/answer/10787469.
4. Verify the existing website's `/.well-known/assetlinks.json` endpoint
   and the Digital Asset Links statement response. Publish/update that JSON
   asset only if missing or incorrect, using the Play app-signing and upload
   fingerprints. Then verify with the Play link checker and
   `pm verify-app-links`; confirm cold/warm links open in the app.
5. Check the Play Console Dashboard and submit or verify the production-access
   application using actual tester feedback and engagement data; do not reuse
   invented or assumed metrics.
6. After access is approved, use the current Play Console Production workflow
   with the approved/tested release. If another AAB is required, increment
   versionCode, validate its bundle/signature, smoke-test a Play-signed install,
   then stage rollout (e.g. 10% → 50% → 100%) and monitor Android vitals.
7. Keep the local TWA rollback reference until the production rollout is stable.
   The tag `pre-capacitor-daymark` is not published to GitHub; the reachable
   rollback commit is `ff496996fcf9b47d9524d81ac300e69c2974c805`.
