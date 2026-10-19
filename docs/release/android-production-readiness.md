# Daymark Android production readiness audit

Scope: Capacitor shell, audited on `migration/capacitor-native-shell` (snapshot
at `24b2b5e`; later commits resolved the minor findings below). The migration
is now merged into `main` (PR #15).
Method: repository/static inspection, artifact inspection of the signed release
APK/AAB, emulator runtime checks from the migration and performance passes.
The technical Android audit did not change Android runtime behaviour or build
configuration. This PR updates documentation and public privacy-policy copy;
those source changes are not live until deployed and are not included in the
already-uploaded AAB. Status labels are used as follows: **READY** means
evidenced as working; **MANUAL PLAY CONSOLE ACTION (MANUAL)** means a check in
the live Console; **MUST FIX** means a release-blocking defect; and **OPTIONAL**
means extra assurance, not a release gate. Section 18 records the completed
physical-device pass; Sections 20–21 state the current status and what
actually remains.

**Document scope.** This audit describes the **released v1.0.0** build — the
bundle uploaded to Google Play and the code on `main`. The
`v2/privacy-hardened-voice` branch changes the location permission, the
coordinate precision and the Android speech path. Those changes are called out
inline as **v2 candidate** behaviour and are specified in full in
`docs/release/version-2-privacy-hardening.md`. The v2 candidate is not released,
and the v1.0.0 statements below remain accurate for the app users actually
have. Where the two differ, both are stated.

## 1. Build / release pipeline

Verified against the released v1.0.0 artefacts (the signed AAB and release APK
inspected below). The rows below are not re-verified by every later commit; the
commit each was verified against is named in §18.

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
| Dependency audit | CI enforces `pnpm audit --audit-level critical`; no critical advisories |
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
# Adjust this machine-specific NDK location if your Android NDK is installed elsewhere.
ANDROID_NDK_HOME=$HOME/.bubblewrap/android_sdk/ndk/29.0.14206865 \
  android/kokoro-poc/scripts/build-kokoro-android.sh

# 3. Web bundle + Capacitor sync
cd artifacts/weather-app
pnpm build
pnpm exec cap sync android

# 4. Android builds (signing requires artifacts/weather-app/android/keystore.properties
#    plus the upload keystore path configured there; neither local signing file is committed)
cd android
# macOS example; on other systems use the equivalent path to the installed JDK 21.
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

Play Console / release status: Daymark has moved to production (maintainer-confirmed, 13 October 2026). No further verification of production status is required for this documentation update. The remaining Console notes below concern data declarations and optional link-association configuration, not whether the app is in production.

1. Play App Signing enrolled via the first upload; the **app signing key**
   SHA-256 is recorded and live:
   `04:3C:41:E1:C9:EC:F5:B5:2C:17:6C:5D:AE:1C:28:8A:10:B0:F8:67:95:6F:6F:C9:F5:3D:98:73:08:5E:9F:FA`
   (Play Console → App integrity → App signing key certificate). The live
   association file also retains the upload key
   `34:6B:BE:F3:43:8C:6F:E8:1E:89:F6:3F:C0:A0:FF:29:E9:6D:A1:98:98:74:E6:BA:18:7A:9E:52:C3:AA:FA:7E`
   for sideloaded builds. Fix preserved in PR #35 (merge
   `8f85a96610703b43a5131f8841e2d490913851de`).
2. Data safety was previously reported complete. As post-release housekeeping,
   reconcile user-initiated location, controlled-WebView speech input and
   browser/system TTS output with the saved form. Google Play defines collection
   as off-device transmission and includes controlled WebViews. Open-Meteo's
   free-API terms say server logs may contain coordinates and are deleted after
   90 days, so the transmitted location must not be labelled ephemeral merely
   because Daymark itself does not store it. See [Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469)
   and [Open-Meteo Terms & Privacy](https://open-meteo.com/en/terms).
3. Content rating, target audience, ads (no ads; advertising ID = No),
   government/financial/health, app access and AI asset declarations were
   previously marked complete in the checklist. No production-status check is
   required by this audit; change these declarations only if they no longer
   describe the released app.
4. The store listing/default listing was previously marked complete. No extra
   status check is required; update its assets or text only if the live listing
   no longer matches the released app or any revised privacy-policy publication.
5. Closed testing is complete and Daymark has moved to production
   (maintainer-confirmed, 13 October 2026). Do not retain the old "Apply for
   production available" wording as the current release state.
7. The Daymark website is already deployed and the separate
   `/.well-known/assetlinks.json` endpoint is live and verified: HTTP `200`,
   content-type `application/json`, package `io.github.sami_gor.daymark`,
   with the Play app-signing fingerprint above plus the upload-key
   fingerprint. The DAL statement API returns the expected association
   statements. Do not redeploy the site from scratch. This affects verified
   App Links, not basic AAB file upload. On-device domain verification
   remains optional and untested (see §3).

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
- The previous recorded result was that the separate
  `/.well-known/assetlinks.json` path returned the SPA HTML fallback. That is
  superseded: the production endpoint is now live and verified (HTTP `200`,
  `application/json`, correct package and both fingerprints; DAL statement API
  returns the expected statements). The file is published at
  `artifacts/weather-app/public/.well-known/assetlinks.json` (preserved in
  PR #35, merge `8f85a96610703b43a5131f8841e2d490913851de`) and served through
  the normal Cloudflare Pages deployment with a
  `Content-Type: application/json` `_headers` rule.
- **No further website action is needed for this fix.** The former
  create-from-scratch instructions are retained only as history: the
  `.well-known` directory was created, the template was copied with the real
  Play fingerprint, and the `_headers` rule was added.

The live JSON at `https://daymark-weather.pages.dev/.well-known/assetlinks.json`
(content-type `application/json`) is:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "io.github.sami_gor.daymark",
      "sha256_cert_fingerprints": [
        "04:3C:41:E1:C9:EC:F5:B5:2C:17:6C:5D:AE:1C:28:8A:10:B0:F8:67:95:6F:6F:C9:F5:3D:98:73:08:5E:9F:FA",
        "34:6B:BE:F3:43:8C:6F:E8:1E:89:F6:3F:C0:A0:FF:29:E9:6D:A1:98:98:74:E6:BA:18:7A:9E:52:C3:AA:FA:7E"
      ]
    }
  }
]
```

`use_as_origin` is not needed (that relation existed for TWA postMessage, which
is retired). The upload fingerprint is kept for sideloaded builds.
**Android on-device domain verification has not been independently tested and
is not claimed as complete**; it is optional additional verification. If
wanted, use `adb shell pm verify-app-links --re-verify
io.github.sami_gor.daymark` and Play's App Links checker. Cold/warm opens
likewise remain optional. This is a specific App Links check, not a repeat of
the completed core device testing.

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

**v2 candidate:** `ACCESS_FINE_LOCATION` is removed from the merged manifest.
The app requests `ACCESS_COARSE_LOCATION` only and uses the approximate fix
Android returns. The `INTERNET` permission remains, for the existing weather and
WebView features rather than for the voice path. The exported-component set is
unchanged; the candidate adds only package-visibility `<queries>` entries for
`RecognitionService` and `TTS_SERVICE`.

## 5. Location

Implementation (`src/App.tsx`): explicit user gesture, `ensureLocalityIndex()`
runs in parallel, coordinates rounded to 2 decimals (~1 km) before any network
call, stale-intent token guard, locality label resolved locally from the
bundled GeoNames dataset, weather fetched once per intent, timeout 12 s,
`maximumAge` 5 min, `enableHighAccuracy: false`.

Error mapping: unsupported API, `PERMISSION_DENIED` (code 1), `POSITION_UNAVAILABLE`
(code 2), `TIMEOUT` (code 3), each with distinct copy; errors dismiss on retry.
No background location, no continuous tracking, nothing persisted.

**v2 candidate:** the Android path no longer applies the two-decimal rounding
step — it sends the OS-provided approximate fix unmodified. The web/PWA path
snaps device-derived coordinates to a 0.025-degree grid on the device. Both
are covered by unit and browser tests; neither has been verified on a physical
device for the candidate.

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

**v2 candidate:** on Android the path becomes
`use-speech-recognition.ts` → `voice-input-native.ts` →
`OnDeviceSpeechRecognitionPlugin` → `SpeechRecognizer.createOnDeviceSpeechRecognizer()`
(API 31 and above). There is no generic recogniser, remote retry or silent
online fallback, and network or server errors are mapped to a terminal
`offline-unavailable` state. The web path is unchanged and remains the browser
speech service. The candidate's classification for the **Android** build is
therefore "on-device", while the web path stays "potentially cloud-dependent";
the two must not be merged in a Data safety answer.

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
| Precise location | Device GPS after user action | Not stored by Daymark after request | Rounded to 2 decimals before sending | Open-Meteo (forecast) | Open-Meteo says free-API server logs may contain coordinates and are deleted after 90 days; not ephemeral |
| Weather query | App | No | Yes: rounded coordinates + options | `api.open-meteo.com`, `air-quality-api.open-meteo.com` | Provider-side logging/retention follows Open-Meteo policy; free-API logs deleted after 90 days |
| Location search text | User input | No | Yes, when searching | `geocoding-api.open-meteo.com` | Provider-side |
| Locality name lookup | `localities-v1.json` | Bundled + Cache Storage | No | — | On device |
| Microphone audio | User gesture | No | Depending on platform speech service (possibly Google) | OS/browser speech service | Outside app control |
| Recognition transcript | Speech service | No | No (in-memory only) | — | No |
| TTS narration text | Intent layer | No | Android English: no, local Kokoro; web: browser speech synthesis; Android French/Spanish: native Android system TTS. Remote processing depends on the selected voice/provider | Browser speech service (web) or Android system TTS (French/Spanish) | Daymark does not retain it; provider-side processing/retention depends on service |
| Preferences | App | `localStorage` (`daymark.locale`) | No | — | Until cleared |
| Analytics | none | — | — | — | — |
| Crash reports | none in-app | — | — | — | — |
| App logs | Instrumentation | logcat only | No | — | Device log buffer |
| Approximate device location (**v2 candidate**) | Android approximate fix after user action | Not stored by Daymark after request | Sent unmodified; no additional rounding | Open-Meteo (forecast, air quality) | Provider-side logging applies |
| Grid-snapped device location (**v2 candidate**, web/PWA) | Device coordinates after user action | Not stored by Daymark after request | Snapped to a 0.025-degree grid on the device | Open-Meteo (forecast, air quality) | Provider-side logging applies |
| Microphone audio (**v2 candidate**, Android) | User gesture | No | No — on-device recogniser only | — | No |
| Recognition transcript (**v2 candidate**, Android) | On-device recogniser | No | No (in-memory only) | — | No |

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
| GeoNames locality dataset (`localities-v1.json`) | CC BY 4.0 | asset | credited in the privacy pages; attribution obligation |

No copyleft obligations in the distributed binary. The residual licensing items
are the undocumented per-voice training-data provenance of `bm_fable`
(unresolved but low risk — official voice collection, Apache-2.0 declared) and
the GeoNames attribution obligation.

### V2 candidate licensing

The following would be redistributed by a candidate that bundles an on-device
ASR model. None of it is in the released v1.0.0 binary, and none of it is in the
current `v2/privacy-hardened-voice` branch. The table is recorded here so the
attribution and notice obligations are known before such a candidate is built.

| Component | License | Redistributed | Notes |
|---|---|---|---|
| sherpa-onnx runtime and JNI | Apache-2.0 | candidate asset | retain the licence notice |
| ONNX Runtime Android shared libraries (bundled inside the sherpa runtime) | MIT | candidate asset | retain the copyright notice; distinct from the build-time `ort` link above |
| Bundled ASR model weights (e.g. Parakeet TDT 0.6B v3 int8) | CC-BY-4.0 | candidate asset | attribution plus an indication of the int8 quantisation |

No candidate that bundles a model may ship until these obligations are
discharged and recorded in the repository.

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
| A — launch / weather / location | PASS: launch and weather render; permission granted; "Use my location" resolved to the expected test locality; refresh applied; no crash/ANR |
| B — voice input (Ask Daymark) | PASS: `RECORD_AUDIO` granted; a recognised transcript and the corresponding answer both appeared (the verbatim prompt and transcript are withheld from this public record) |
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
risk makes a specific case necessary. If the revised privacy-policy wording in
this PR is adopted, publish the website update and include the policy source
changes in the next Android bundle so the web and in-app policies stay aligned;
this PR has not built or uploaded a new AAB.

## 19. Cleanup checklist (do not remove yet)

- TWA rollback project `android/`, `twa-manifest.json`, `asset-links/` template
  and `androidbrowserhelper` dependency — keep until the production rollout is
  stable and the rollback path is no longer needed. The core physical-device pass
  is already complete (§18).
- The former `artifacts/weather-app/src/hooks/use-browser-speech.ts` hook was
  removed in `332adba`; there is nothing left to clean up.
- `KokoroTtsTestActivity` (TWA project only) — diagnostic, not in the
  Capacitor build.
- Keep any local Sherpa POC archives as historical material. Old notes refer
  to `poc/local-tts`, but verify that branch/tag exists before relying on it
  from a fresh clone; local-only refs are not available through GitHub.
- Verbose release logging (chunk timing, PSS) — optional reduction to
  warn/error plus a single init/READY line.
- `sw.js` in the bundled native assets — harmless but unused inside Capacitor.

## 20. Final readiness matrix

| Area | Status | Severity | Evidence | Required action |
|---|---|---|---|---|
| Existing AAB build/signing/versioning | EXISTING AAB VERIFIED; POLICY COPY NOT PACKAGED | release consistency | uploaded versionCode 1 AAB signature/hash were verified in the prior artifact audit; this PR changes privacy-page source text but not the existing bundle | if adopting the policy changes, deploy the web version and build/validate a new AAB with the next unused versionCode; then smoke-test a Play-signed install |
| Play App Signing fingerprint | DONE (recorded, live) | App Links website side | signing enrolled on first upload; app-signing SHA-256 `04:3C:41:…:9F:FA` recorded from Play Console → App integrity; live file also keeps upload `34:6B:BE:…:FA:7E`; preserved in PR #35 (`8f85a96`) | none for this fix |
| Digital Asset Links endpoint | DONE (live, verified) | verified App Links (website side) | Production endpoint returns HTTP 200 + `application/json` with the correct package and both fingerprints; DAL statement API returns the expected statements | none; on-device domain verification remains optional and untested |
| Data safety declaration | POST-RELEASE POLICY ACCURACY CHECK | policy accuracy | Previously marked complete; rounded location is sent to Open-Meteo, whose free-API policy says logs may contain coordinates for up to 90 days; speech-provider processing varies | reconcile saved form; classify the rounded location as precise, collected, optional, for app functionality and not ephemeral; review sharing against Play's service-provider definition and confirm speech-provider flows; see §10 and checklist |
| Other Play forms (content rating, target audience, ads, app access, AI asset, etc.) | PREVIOUSLY REPORTED DONE (manual) | release gate | recorded as complete in checklist; live Console state not verified | confirm each still reflects the current app and release |
| Production release | PRODUCTION (maintainer-confirmed, 13 October 2026) | current release state | Maintainer says Daymark has moved to production | no further status verification required for this paperwork |
| Location behavior | CORE DEVICE PASS RECORDED | medium | real-device location use passed in brief validation | no need to repeat the completed location path; extended denial/permanent-denial cases are optional coverage |
| Speech recognition | CORE DEVICE PASS RECORDED | medium | real-device voice input and transcript passed; platform service can vary | no need to repeat the completed voice-input path; service/permission edge cases are optional coverage |
| Audio focus/BT/calls | CORE LIFECYCLE PASS; EXTENDED CASES NOT CLAIMED | medium | Home lifecycle passed; Bluetooth/call/music interruption not included in the recorded brief pass | optional extended QA only, unless you specifically want those cases covered |
| Memory on lower-RAM devices | OPTIONAL EXTENDED QA | medium | ~626 MB emulator peak; recorded real-device pass was short | test lower-RAM device only if expanding coverage |
| Battery/thermal | OPTIONAL EXTENDED QA | low-medium | brief 1-minute pass: 35.0 °C, thermal status 0 | 10-minute soak is optional additional coverage |
| Accessibility (TalkBack/font scale) | FONT-SCALE PASS RECORDED; TALKBACK NOT CLAIMED | low-medium | 1.5x font pass 14 Sep 2026; web automations pass | TalkBack audit is optional additional coverage |
| Real-device latency | CORE DEVICE PASS RECORDED; BENCHMARK OPTIONAL | low | real-device flow was exercised; emulator estimate ~2.4 s | no repeat required; benchmark only if needed |
| App data-flow behaviour | POST-RELEASE DATA SAFETY RECONCILIATION | policy accuracy | no in-app analytics, rounded location requests, no transcript/location logging; Open-Meteo logs may retain coordinates for up to 90 days; speech providers may process data off-device | update the saved form where needed: precise location, collected, optional, app functionality, not ephemeral; resolve sharing using Play's service-provider definition and confirm voice-provider flows; see §2, §10 and checklist |
| Security (WebView/bridge/components) | READY | — | audit §12 | optional CSP hardening |
| Licensing | READY | — | WTFPL cleared; permissive stack; GeoNames dataset credited | note bm_fable provenance; a candidate that bundles an ASR model must add its Apache-2.0 / MIT / CC-BY-4.0 attribution (§14) |
| Dependencies | READY | — | prod audit clean, pinned versions | none |
| Offline behavior | READY | — | airplane-mode checks | none |
| Error states | READY | — | code audit + e2e | device polish |
| V2 candidate (`v2/privacy-hardened-voice`) | NOT RELEASED — candidate gates open | release gate | `docs/release/version-2-privacy-hardening.md`; the branch changes the location permission, the coordinate precision and the Android speech path | complete the open gates, bump `versionCode`, rebuild and sign, then submit through closed testing. The shared documents above still describe v1.0.0 by design. |
| Release logging | OPTIONAL | low | no user content | reduce verbosity later |
| Resource shrinking | OPTIONAL | low | not enabled | consider post-launch |
| CSP in native shell | OPTIONAL | low | no CSP headers native | consider meta CSP later |

### A. CODE/PACKAGING GATE
The prior artifact audit found no release-blocking Android runtime or packaging
defect in the uploaded AAB. This PR adds privacy-policy source edits; those edits
are not in that AAB. If adopted, successful CI, a new Android bundle with the
next unused versionCode, and a Play-signed smoke test are needed before the
revised in-app policy wording is live. Data safety and App Links checks remain
separate.

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
exposure, dependency hygiene, offline shell, web tests (236 unit / 153 e2e on `main`; 244 unit on the v2 candidate),
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
2. In Play Console, the **app-signing** fingerprint is recorded
   (`04:3C:41:…:9F:FA`; upload `34:6B:BE:…:FA:7E` retained second).
   Confirm Data safety, content rating, app access, ads, target audience, AI
   asset and other applicable declarations. The maintainer reports closed
   testing complete and Daymark moved to production (maintainer-confirmed,
   13 October 2026). The release status is accepted as confirmed for this audit.
3. Reconcile Data safety for the user-initiated location request, controlled
   WebView speech-recognition path, and browser/system TTS handoff against
   current Play policy and actual provider behaviour. Google says controlled
   WebView data flows and off-device transmission must be considered; do not
   infer answers solely from lack of app-side storage. See
   https://support.google.com/googleplay/android-developer/answer/10787469.
4. Production is recorded as live, per maintainer confirmation. No further
   production-status check is required for this paperwork.
5. Digital Asset Links is a separate app-link check, not a prerequisite for
   applying for production access. The existing website's
   `/.well-known/assetlinks.json` endpoint and the Digital Asset Links statement
   are verified live (HTTP 200, `application/json`, correct package and both
   fingerprints; fix preserved in PR #35 merge `8f85a96`). No further website
   change is needed for this fix. On-device domain verification with the Play
   link checker and `pm verify-app-links` remains optional and untested.
6. As post-release follow-up, if adopting the privacy-policy source edits in
   this PR, deploy the revised web policy and build a matching Android AAB with
   the next unused versionCode (expected 2 if versionCode 1 remains latest);
   validate its bundle/signature and smoke-test the Play-signed install. Monitor
   Android vitals after the production release.
7. Keep the local TWA rollback reference until the production rollout is stable.
   The tag `pre-capacitor-daymark` is not published to GitHub; the reachable
   rollback commit is `ff496996fcf9b47d9524d81ac300e69c2974c805`.
