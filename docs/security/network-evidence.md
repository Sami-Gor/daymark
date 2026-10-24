# Network boundary evidence and capture plan

**Last reviewed:** 2026-10-24
**HEAD at review:** `5b9013c` (branch `fix/location-privacy-native-lifecycle-compatibility`)
**Automated guard:** `artifacts/weather-app/src/lib/network-boundary.test.ts` (14 checks, all passing)

This page records what Daymark's network boundary is, what the automated guard
does and does not prove about it, and the packet-capture plan that remains
**open** — no capture has been performed. It makes no claim beyond the
evidence: everything below is either source-derived, guard-asserted, or
explicitly listed as unproven.

Scope note: this is evidence about the **installed Android app and its web
sources**, not about provider-side behavior. See
[daymark-security.md](daymark-security.md) for the general security mapping and
[documented-incidents.md](documented-incidents.md) for how evidence labels
should be read.

## Destination inventory (source-derived)

### Runtime destinations of the web layer (non-test `src/` + `public/sw.js`)

| # | Destination | Carrying code | What travels | Guard |
|---|---|---|---|---|
| 1 | `https://api.open-meteo.com/v1/forecast` | `weather.ts` (`FORECAST_URL` → `getJson` → `fetchWeather`, `fetchMicroClimate`) | Coordinates + requested fields (GET; forecast and, inside UKV bounds, one `ukmo_seamless` micro-climate session) | host pinned; fetch call site enumerated |
| 2 | `https://air-quality-api.open-meteo.com/v1/air-quality` | `weather.ts` (`AIR_QUALITY_URL`) | Coordinates + AQI/PM params (GET, parallel with #1) | host pinned |
| 3 | `https://geocoding-api.open-meteo.com/v1/search` | `weather.ts` (`GEOCODING_URL`) | Typed search text, count, language (GET) | host pinned |
| 4 | Same-origin only: `${BASE_URL}locality/localities-v1.json` | `locality.ts` → `locality-load.ts` (single `fetch(url, { credentials: 'same-origin' })`) | A static dataset identical for every user; no user location. On web/PWA this is the Pages origin; on Android it resolves against the Capacitor local origin (`https://localhost` from APK assets) and never leaves the device | same-origin asserted structurally |

The fetch inventory is complete: exactly four `fetch(` call sites exist in
non-test web source plus the service worker (one in `weather.ts`, one in
`locality-load.ts`, two pass-through calls in `sw.js` on requests the worker's
`url.origin !== self.location.origin` gate has already cleared), and the
`fetch` binding is not referenced anywhere else, so it cannot be aliased or
imported into a new module without the guard failing. No `XMLHttpRequest`,
`WebSocket`, `EventSource`, `sendBeacon`, or `RTCPeerConnection` exists in web
code; no cleartext (`http://`), dynamically assembled (`'https://' + host`), or
protocol-relative (`'//host'`) URL exists; the service worker loads no remote
scripts and references no absolute URLs; the app shell (`index.html`)
references only local files.

### Navigation-only links (not fetches)

User-clicked `<a href="https://…" target="_blank" rel="noreferrer">` anchors in
the footer and privacy pages may reference exactly: `open-meteo.com` (site and
terms), `www.cloudflare.com/privacypolicy`, `www.geonames.org` (data credit),
and `huggingface.co` (speech model credit). These are navigation, not data
transfer, and are disclosed in the in-app privacy pages. The guard pins this
set: an anchor to any other host fails.

### Native Android (live Capacitor tree, `artifacts/weather-app/android`)

- **Zero network APIs and zero URL literals in first-party Java** (`app`,
  `daymark-voice`, `parakeet-assets` modules; 13 `.java` files at this HEAD):
  no `HttpURLConnection`/`URLConnection`, no `OkHttpClient`, no
  `java.net.*` import, no `WebSocket`, no `openConnection(`, no `http://` and
  no `https://` literal. Comment-stripped before scanning so Apache license
  headers cannot produce false positives.
- The recognition path is fully on-device (Parakeet via sherpa-onnx; audio in
  an in-memory buffer; no URL literal in the plugin — also pinned by
  `android-voice-model-loading.test.ts` and `android-voice-implementation.test.ts`).
- Narration is Kokoro (bundled model) or the system TTS bridge, which refuses
  any voice with `isNetworkConnectionRequired()` (pinned by
  `system-speech-offline.test.ts`); the shipped wiring can never select the
  WebView Web Speech adapter on Android, whose `speechSynthesis` voices may be
  network-served (pinned by this guard's wiring check; the adapter-selection
  behaviour is covered by `speech-adapters.test.ts`).
- **The Capacitor native HTTP bridge (`plugins.CapacitorHttp`) stays disabled**
  in both `capacitor.config.ts` and the bundled
  `android/app/src/main/assets/capacitor.config.json`; `androidScheme` is
  `https` and `allowMixedContent: false`. If that bridge were enabled, WebView
  fetches would move to native OkHttp, outside the WebView and outside the CSP
  that pins the three-host allowlist — the guard now fails on that too.
- The WebView shell carries the same CSP `connect-src` allowlist as the hosted
  `_headers` and the Vite build (three-way parity pinned), with
  `upgrade-insecure-requests`.
- No `usesCleartextTraffic` and no `network_security_config.xml` exists in the
  repo; cleartext is blocked by the platform default because `targetSdk 36 ≥ 28`.

### Retired root TWA tree (`/android` at repo root) — explicit exclusion

The frozen bubblewrap/TWA rollback tree is **excluded** from the
shipped-boundary scans, by decision recorded in the guard itself:

- It is a rollback shell, not the production app, and it **cannot build**:
  its manifest references `@string/`/`@bool/` resources (`hostName`, `launchUrl`,
  `webManifestUrl`, `enableNotification`, `appName`, `launcherName`,
  `orientation`, `fallbackType`, `generatorApp`, `providerAuthority`) that its
  `res/values/strings.xml` does not define.
- If it were revived, its network path is androidbrowserhelper's Custom Tabs
  delegation to the user's browser at `daymark-weather.pages.dev`; the browser
  process performs the loading. Its own Java carries no network code today.
- Scanning its Gradle files would false-positive on the
  `com.google.androidbrowserhelper:androidbrowserhelper` dependency string —
  a library reference, not first-party network code. Dependency strings are
  never scanned, in either tree.
- `android/kokoro-poc/` scripts download a SHA-256-pinned sherpa-onnx AAR at
  **build time only**; they never ship in the app.

A tripwire still scans the retired tree's first-party Java (comment-stripped)
for the same network tokens, so a revival that adds direct network code fails
the guard. Deleting the tree outright also passes the guard.

### Build-time-only traffic (never shipped)

| Script | Destination | When |
|---|---|---|
| `android/kokoro-poc/scripts/fetch-sherpa-onnx.sh` | `github.com` release download of the pinned sherpa-onnx AAR (SHA-256 checked) | CI/build only |
| `scripts/data/build-localities.mjs` | `download.geonames.org` dataset dump | dataset build only |
| `pnpm install` / CI / CodeQL | package registries and tool services | build only |

## What the guard proves

`network-boundary.test.ts` (14 checks, 14 passing at `5b9013c`) proves, at
whatever commit it runs on, that **the source tree** satisfies all of the
invariants above: the three-host allowlist is identical across the three CSP
copies and equals the hosts used by `weather.ts`; the fetch call-site
inventory is exactly the four enumerated sites with same-origin or
allowed-host destinations; no other web network API, cleartext, dynamic, or
protocol-relative URL exists; the service worker and app shell stay
same-origin; first-party Android Java has no network API or URL literal; the
native HTTP bridge stays disabled; Android narration wiring cannot select
WebView Web Speech; and the retired TWA tree stays network-free or gone.

Two properties of the guard itself are worth recording:

1. **A vacuity bug was found in the original CSP-era check and fixed.** The
   previous comment stripper removed `// …` line comments with a regex, which
   silently ate every `https://` literal at its own `//` — the "no other https
   origin" check could never see any host and passed vacuously. Stripping now
   uses the real TypeScript scanner (mirroring TypeScript's own syntax
   classifier, including regex-literal and template-literal handling), so URLs
   in comments are ignored while URLs in string literals survive.
2. **The guard is negative-tested.** A mutation harness applied 14 controlled
   violations (new remote fetch host in a component, `fetch` aliasing,
   `sendBeacon`, dynamically assembled and protocol-relative and cleartext
   URLs, `java.net` import and https literal in first-party Java, an https
   literal in the retired TWA tree, `CapacitorHttp` enabled, `systemSpeech:
   null` in the hook wiring, the service-worker origin gate removed, the
   locality dataset moved to a CDN, an extra CSP host, and others); every one
   made at least one check fail, and the tree was restored after each. A
   final self-test check inside the guard proves the detectors fire on
   synthetic violations, so a future regression of the stripping logic cannot
   silently re-create a vacuous pass.

## What the guard does not prove

- **Runtime behavior.** The guard reads sources, not the installed APK or the
  deployed site. Build identity (that an installed APK corresponds to a given
  commit) must be established separately (`dumpsys package` / `pm path` /
  APK checksum in a run record).
- **The CSP binds the WebView, not native code.** Native egress is bounded by
  the absence of network APIs in first-party Java and by the disabled
  CapacitorHttp bridge — a convention-plus-guard boundary, not a platform
  control. `INTERNET` remains a broad permission.
- **Third-party binaries are not audited.** capacitor-android, `@capacitor/app`,
  androidx, sherpa-onnx (SHA-256-pinned at fetch), and androidbrowserhelper
  are trusted as supply-chain residual; their byte content is not verified
  here (only the sherpa-onnx AAR hash is pinned).
- **Dynamic loading.** Reflection or runtime class loading could in principle
  reach network APIs without source tokens; no such code exists in first-party
  sources, but a text-level guard cannot exclude the technique.
- **Web/PWA speech is remote-capable by design.** On browsers (not the Android
  app), recognition uses the platform `SpeechRecognition` provider and
  narration uses `speechSynthesis` voices that may be network-served; this is
  disclosed in the privacy pages and is out of the Android boundary this
  guard pins.
- **Provider-side retention, logging, or processing** (Open-Meteo, Cloudflare,
  the OS, Play) is outside any client-side evidence.
- **Data flow inside an allowed request** cannot be seen statically: the guard
  pins destinations, not payloads.

## PCAPdroid capture plan — four isolated windows (plan only; nothing run)

Physical capture is **blocked pending user VPN consent**: starting PCAPdroid
requires the physical `VpnService.prepare()` consent dialog on the device,
which cannot be scripted, and TLS decryption would be a separate, explicit
approval (temporary CA in an isolated profile/device). No pcap exists; no
privacy gate is closed by this document.

Standing rule derived from source: **every cold start issues the forecast +
air-quality pair** (the mount effect calls `fetchWeather`), so a cold start is
never a clean noise floor — read window 0 as post-load idle.

Per-window protocol (all four):

- One pcap per window; `adb shell am force-stop io.github.sami_gor.daymark`
  before each; same device, same network, same build for all four; record UTC
  start/end, app commit and build identity, device fingerprint, network type,
  PCAPdroid version.
- PCAPdroid scoped to the **Daymark UID only**, DNS capture on; export →
  hash → redact → store **outside the repo**; reference hash and date in the
  release record (a pcap contains IPs, DNS and timing).
- Record DNS Q/A (or DoH/DoT resolver evidence), TLS ClientHello SNI,
  destination IP:port, session counts, per-direction bytes, timing relative to
  the user action, UID attribution, and **any destination outside the
  inventory above as an explicit finding**.

| # | Window | Steps | Padding | Expected flows (source-derived, **not observed**) |
|---|---|---|---|---|
| 0 | Idle / launch | Cold start with default place, let first render settle, then **no taps**, screen on, ~90 s | −10 s → +90 s | The two Open-Meteo sessions from the mount load (`api` + `air-quality-api`), then quiet; establishes the post-load floor and OS/Play noise |
| 1 | Weather refresh | Cold start; after first render trigger a second load (place re-selection or the error-retry affordance — no dedicated refresh button exists) | −10 s → +45 s per action | Exactly **2 TLS sessions per load** to :443: `api.open-meteo.com /v1/forecast`, `air-quality-api.open-meteo.com /v1/air-quality`. Optional separate windows: geocoding (one `geocoding-api` session per query), micro-climate (one extra `api` session with `ukmo_seamless`), "Use my location" (must show the **local** `https://localhost` locality fetch inside the WebView, never an external flow) |
| 2 | Recognition | Tap Ask Daymark, speak one short phrase (≤15 s), let it answer; nothing else | −15 s → +90 s | **Zero new TLS sessions**, no new SNI, no outbound growth beyond handshake noise above the window-0 floor |
| 3 | Narration | Tap Hear today on the same screen | −10 s → +60 s | **Zero new sessions**, zero outbound growth; TTS audio must be produced locally, never downloaded |

Dirty-window threshold: any new SNI, or outbound bytes exceeding the idle floor
by more than a handshake-sized envelope, is a finding.

## TLS metadata-vs-payload limits (state with every result)

- **Provable with metadata only:** whether any connection opens during the
  window (and whether one opens *after* the microphone/tap); destination host
  via SNI/DNS, IP, port; session count and per-direction byte bounds; timing
  and duration; UID attribution so Play/OS traffic is excluded; absence of
  external packets in airplane mode.
- **Not provable without TLS decryption:** the actual `latitude`/`longitude`
  values in query strings; the typed `name=` search value; whether a
  transcript or audio chunk was hidden inside an allowed Open-Meteo request;
  exact URLs/headers/bodies; the precision of the OS approximate fix.
- **Neither mode proves:** on-device inference, provider-side
  retention/deletion, traffic outside the window, VPN-bypassing/privileged
  flows, or hosts hidden by DoH/DoT/TLS 1.3 ECH.

**Consequence:** a clean metadata run supports *"no observed speech flow"* —
never *"no speech data was transmitted"*. A window-1 session to
`geocoding-api` or `api` proves those hosts were used, not what was inside
them. Any release claim must stay compound: source guards + build identity +
clean windows + stated residual.

## Approval status

| Evidence item | Status |
|---|---|
| Guard tests passing at this HEAD | 14/14 (this review) |
| Build identity of an installed APK | not established |
| Packet evidence, windows 0–3 | none exists — **blocked pending user VPN consent** |
| TLS-decrypted coordinate proof | not performed; separate explicit approval required |
| Third-party AAR hashes beyond the pinned sherpa-onnx AAR | not recorded |

No privacy gate is closed by this document; see
[version-2-privacy-hardening.md](../release/version-2-privacy-hardening.md)
for the release gate wording that depends on this evidence.
