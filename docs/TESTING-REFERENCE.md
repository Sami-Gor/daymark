# Testing Daymark

This guide explains how to find, run and assess Daymark's existing automated
checks and where manual testing is still required. It is written for an
independent reviewer or a new contributor who does not have the author's setup.

It is **not** a release approval, a security certification, or a claim that the
current candidate has passed every gate. A passing automated suite establishes
only the behaviour asserted by that suite at the commit you tested. Build
identity, packet-level network behaviour, physical-device behaviour and speech
accuracy must be established separately.

## Reference point

The guide was checked against `release/v2-candidate` at:

`26c933a2917090e9249719680f36178e1448fe53`

The live branch can move. Record the commit you actually test:

```bash
git rev-parse HEAD
git status --short
```

Do not reuse old test counts or results unless the candidate SHA, build identity
and environment are also the same.

## Purpose and scope

The repository contains:

- TypeScript type checks and Vitest unit tests for the web application.
- Playwright browser tests against the production web build.
- Android JVM tests for the app shell and the native voice module.
- Android debug packaging and lint tasks.
- GitHub Actions checks, dependency audit and CodeQL static analysis.
- Manual physical-device checks that are not represented by an automated
  device-test task in this repository.

The guide covers those existing checks. It does not establish that Daymark has
zero speech network egress, complete device compatibility, exhaustive security
coverage or a release-ready signed artifact.

## Prerequisites and setup

### Versions pinned by the repository and CI

| Tool | Version or requirement | Source |
| --- | --- | --- |
| Node.js | Node 24 | `.github/workflows/ci.yml`, `.github/workflows/android-ci.yml`, `.github/workflows/codeql.yml`; the historical build record tested v24.22.1 |
| pnpm | 12.3.4 | `package.json` (`packageManager`) and `pnpm-lock.yaml` (`lockfileVersion: 9.0`) |
| Java | JDK 21 | Both CI workflows use Temurin 21 for Android |
| Gradle | 8.14.3 wrapper | `artifacts/weather-app/android/gradle/wrapper/gradle-wrapper.properties` |
| Android compile/target SDK | 36 | `artifacts/weather-app/android/variables.gradle` |
| Android minimum SDK | 29 | `artifacts/weather-app/android/variables.gradle` |
| Android NDK | 29.0.14206865 | `artifacts/weather-app/android/variables.gradle` and `docs/release/reproducible-build-guide.md` |
| Android build-tools | 36.0.0 in the pinned build record | `docs/release/reproducible-build-guide.md` |
| Rust | 1.98.1 with `aarch64-linux-android` | Only for rebuilding the Kokoro native library; see `docs/release/reproducible-build-guide.md` |

Use the production Gradle wrapper at
`artifacts/weather-app/android/gradlew`. Do not use the repository-root
`android/gradlew`; that is the frozen legacy TWA project and uses a different
Gradle version.

The package manager is enforced by the root `preinstall` script. Use pnpm, not
npm or Yarn.

### Simple web setup

1. Clone the repository and switch to the candidate:

   ```bash
   git clone https://github.com/Sami-Gor/daymark.git
   cd daymark
   git switch release/v2-candidate
   git pull --ff-only
   git rev-parse HEAD
   ```

2. Install the frozen dependencies from the repository root:

   ```bash
   pnpm install --frozen-lockfile
   ```

3. Check that the expected tools are active:

   ```bash
   node --version     # should be Node 24
   pnpm --version     # should be 12.3.4
   java -version      # should report a JDK 21 for Android work
   ```

No model download, Android SDK or physical phone is required for the Vitest
suite or TypeScript checks.

### Android setup

Android work additionally needs:

- JDK 21 available through `JAVA_HOME`.
- Android SDK platform 36, build-tools 36.0.0 and platform-tools.
- NDK 29.0.14206865 for native builds.
- The Android `local.properties` file or `ANDROID_HOME`/`ANDROID_SDK_ROOT`
  configuration so Gradle can find the SDK.
- Network access for the checksum-verified sherpa-onnx runtime and Parakeet
  model downloads.
- For rebuilding Kokoro/native assets only: a host C toolchain (Xcode Command
  Line Tools on macOS or a Linux C toolchain), Git, curl, unzip, Python 3 and a
  SHA-256 utility. The reproducible-build guide lists the tested host pins.

An example SDK installation, matching
`docs/release/reproducible-build-guide.md`, is:

```bash
sdkmanager "platforms;android-36" "build-tools;36.0.0" \
  "platform-tools" "ndk;29.0.14206865"
```

Set the tool locations for the shell:

```bash
export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
```

If Gradle cannot find the SDK, create the gitignored
`artifacts/weather-app/android/local.properties` with:

```properties
sdk.dir=/path/to/android-sdk
```

The Parakeet model is an install-time asset pack and is not committed. The
sherpa-onnx AAR is also fetched rather than committed. The relevant scripts are:

```bash
android/kokoro-poc/scripts/fetch-sherpa-onnx.sh
android/kokoro-poc/scripts/fetch-parakeet-assets.sh
```

The first is needed to compile the voice module. The second is needed before
packaging an APK or AAB that includes the model. Both scripts verify pinned
checksums.

Kokoro narration assets and the native JNI library are separate from the JVM
tests. Rebuilding them requires the Rust toolchain and NDK described in
`docs/release/reproducible-build-guide.md`; do not treat a debug JVM test run as
proof that narration assets were produced.

### What needs extra resources

| Check | Extra requirements |
| --- | --- |
| Vitest unit tests | Node and pnpm only |
| Playwright browser tests | Chromium binary; the configuration uses Chromium only |
| Android JVM tests | JDK 21, Android SDK, and the fetched sherpa-onnx AAR |
| Android debug APK/AAB packaging | Fetched Parakeet model and asset-pack verification |
| Narration/native build | Kokoro assets plus Rust, NDK and the native build script |
| Physical-device checks | An approved installable APK, a supported Android device, and manual microphone/location/audio testing |
| CodeQL and dependency audit | GitHub Actions or equivalent local tooling; not a substitute for dynamic testing |

## Web unit tests and type checks

Run these commands from the repository root unless stated otherwise.

### TypeScript checks

```bash
pnpm run typecheck
```

This runs the root script, which applies `typecheck` to the workspace packages
under `artifacts/**` and `scripts`. A successful command exits 0. The web-app
`tsconfig.json` excludes `**/*.test.ts`, so this is a production-source check;
it does not compile the test files themselves.

To check only the web application:

```bash
pnpm --filter @workspace/weather-app run typecheck
```

The command prints TypeScript diagnostics with file paths and line numbers.
A non-zero exit or any diagnostic is a failure. Do not re-label a TypeScript
diagnostic as a test-environment problem without recording the exact error.

### Vitest unit tests

```bash
pnpm --filter @workspace/weather-app run test
```

The script runs `vitest run` from
`artifacts/weather-app`. The checked-in `vitest.config.ts` includes
`src/**/*.test.ts`, uses the Node environment and resolves `@` to `src`.
A successful run exits 0 and prints a Vitest summary. Failure details identify
the failing file, test name and assertion.

The repository does not declare an expected pass count. Record the count printed
by the current run rather than copying a count from an older report.

## Browser end-to-end tests

The Playwright configuration in
`artifacts/weather-app/playwright.config.ts`:

- Runs tests from `artifacts/weather-app/tests/e2e`.
- Uses Chromium only.
- Uses `http://localhost:5177`.
- Starts `pnpm run serve` itself, which is `vite preview` against the built web
  output.
- Sets a 30-second test timeout and a 5-second assertion timeout.

Build the production web output first, because the suite and the
`dist/public/_headers` checks expect it:

```bash
pnpm --filter @workspace/weather-app run build
```

Install the browser binary if it is not already present:

```bash
pnpm --filter @workspace/weather-app exec playwright install chromium
```

On Linux CI the workflow adds system dependencies:

```bash
pnpm --filter @workspace/weather-app exec playwright install chromium --with-deps
```

Run the suite:

```bash
pnpm --filter @workspace/weather-app run test:e2e
```

Playwright starts the preview server on port 5177 and stops it when the run
finishes. Do not start a second server on the same port unless you understand
the configuration's `reuseExistingServer` behaviour.

The checked-in configuration does not define a reporter, trace or screenshot
setting. Do not assume that a `playwright-report/` directory exists. Inspect the
terminal failure output; Playwright's default output directory is
`test-results/` when artifacts are produced. An HTML report is not a checked-in
default.

The E2E suite uses deterministic Open-Meteo fixtures and intercepts network
requests. It checks browser behaviour and built assets, not a live provider,
the deployed site or an Android WebView.

## Android and native tests

Run the following from the repository root first:

```bash
pnpm --filter @workspace/weather-app run build
pnpm --filter @workspace/weather-app exec cap sync android
pnpm --filter @workspace/weather-app run verify:android-web-assets
android/kokoro-poc/scripts/fetch-sherpa-onnx.sh
```

Then change to the Android project:

```bash
cd artifacts/weather-app/android
```

### Pure JVM tests

These are local JVM tests. They do not install an app and do not exercise a
physical microphone:

```bash
./gradlew --no-daemon :app:testDebugUnitTest :daymark-voice:testDebugUnitTest
```

The app tests include `WebViewCompatibilityTest`. The voice module tests include
the endpoint detector, model-integrity logic, model installer/assets tests and
lifecycle/race tests under
`artifacts/weather-app/android/daymark-voice/src/test/java/`.

A successful run exits 0. A failure names the module, test class, test method
and assertion. Record the exact Gradle command and the complete failing
test name.

### Debug APK and AAB

Fetch the model before packaging, then run the packaging tasks. Confirm that
the first command runs from the repository root; if you are still in
`artifacts/weather-app/android`, return with `cd ../../..` first:

```bash
# From the repository root
android/kokoro-poc/scripts/fetch-parakeet-assets.sh
cd artifacts/weather-app/android
./gradlew --no-daemon :app:assembleDebug :app:bundleDebug
```

`assembleDebug` produces a debug APK. `bundleDebug` exercises the asset-pack
packaging path. The asset-pack build verifies the staged Parakeet files against
the pinned SHA-256 values. A missing model is a prerequisite/tooling failure,
not a passing test.

This repository does not build or sign a production release bundle in the
documented CI test path. Do not describe a debug APK/AAB as a production
artifact.

### Lint

```bash
./gradlew --no-daemon :app:lintDebug
```

The CI workflow runs this task with `warningsAsErrors` off. A successful task
means lint completed without errors; warnings may remain. Do not report a lint
warning as a pass, and do not claim zero warnings unless you inspected the
actual lint output for the same commit.

### Combined CI Android command

The main CI workflow uses one Gradle invocation for build, JVM tests and lint:

```bash
./gradlew --no-daemon :app:assembleDebug :app:bundleDebug \
  :app:testDebugUnitTest :daymark-voice:testDebugUnitTest :app:lintDebug
```

### Native and device tests

The repository has no checked-in `androidTest`/instrumented test directory and
no CI job that runs a physical device. The JVM test named
`AudioSpeechCaptureDeviceTest` tests the capture abstraction on the JVM; it is
not a real AudioRecord test on a phone.

Physical microphone, AudioRecord/OEM lifecycle, actual GNSS delivery, audible
narration and WebView/device compatibility must be tested manually on an
approved build. Record the APK SHA-256, package ID, version, signing certificate
and candidate commit before starting. A package that launches is not thereby a
verified release candidate.

The V2 Android build declares minimum API 29, target/compile SDK 36 and
`arm64-v8a`; the release documentation also states a WebView 90 feature floor.
Those are documented requirements, not proof of compatibility on an untested
device.

## Security and privacy test coverage

The table below describes what the checked-in tests assert. A green result is
source/regression evidence at the tested SHA; it is not packet capture,
deployment evidence or a security certification.

| Test or file | Behaviour checked | What a passing result establishes | What it does not establish |
| --- | --- | --- | --- |
| `artifacts/weather-app/src/lib/location-privacy.test.ts` | Latitude-aware grid rounding, minimum 0.025° step, longitude widening for at least 3 km², invalid-coordinate rejection and idempotence | The source resolver applies the tested privacy-grid rules in unit tests | That a device delivered a fix, that the OS supplied the expected precision, or that a server received the rounded value |
| `artifacts/weather-app/src/lib/network-boundary.test.ts` | Fetch inventory, approved Open-Meteo hosts, CSP parity across sources, same-origin locality data, disabled native HTTP bridge and absence of network APIs in first-party Java | The checked-in source and built web assets satisfy the tested allowlist and structural invariants | Runtime traffic from the installed APK, requests made by third-party binaries, provider-side handling, or payload contents |
| `artifacts/weather-app/src/lib/speech-privacy.test.ts` | No network/analytics/telemetry client, transcript/audio persistence, or transcript/audio logging in the speech path; no web speech fallback | The speech source path has the tested source-level boundaries | Packet-level absence of speech egress, native runtime behaviour, or absence of logging in every dependency |
| `artifacts/weather-app/src/lib/storage-surface.test.ts` | Web localStorage is limited to the locale preference; no sessionStorage, IndexedDB or cookies in production source; the Android permission flag is the documented private preference | The tested source uses only the enumerated storage surfaces | What the native OS, WebView or third-party code stores outside the scanned source |
| `artifacts/weather-app/src/lib/security-headers.test.ts` and the security-header E2E tests | Production/preview Permissions-Policy parity, built `_headers` parity, CSP and related headers, and no CSP console errors | The tested files and preview serve the checked headers consistently | That the live host or every deployed version serves them, or that headers alone make the app secure |
| `artifacts/weather-app/src/lib/xss-regression.test.ts` and E2E negative-input tests | Dangerous DOM primitives are absent; malicious geocoding strings stay inert text; URL-like input has no navigation sink | The tested rendering path treats the supplied malicious strings as data | Exhaustive XSS coverage across all browsers and future components, or server-side compromise |
| `artifacts/weather-app/src/lib/voice-input-native.test.ts` and `voice-input-native-watchdog.test.ts` | Native Parakeet controller selection, missing/corrupt-model handling, cancellation, stale-result rejection, watchdogs and session supersession | The tested web/native controller state machine behaves as asserted with fakes | Real microphone capture, real decoder latency on a phone, or recognition accuracy |
| `artifacts/weather-app/android/daymark-voice/src/test/java/.../SpeechEndpointDetectorTest.java` | Synthetic energy chunks start/stop an utterance, including natural pauses and a 30-second maximum | The endpoint detector logic has the tested behaviour on synthetic samples | Real speech recognition, microphone quality, accent coverage or device performance |
| `.../ParakeetLifecycleRaceTest.java` | Cancellation before start, pause during a blocked read, in-flight decode cancellation, destroy and session ordering | The tested plugin lifecycle/race logic holds with fake devices and recognisers | A physical AudioRecord implementation on a particular OEM or Android version |
| `.../ParakeetModelIntegrityTest.java` and `.../KokoroAssetIntegrityTest.java` | Size/hash checks, marker invalidation, tampering, truncation and missing-file handling using synthetic files | The integrity code rejects the tested tampered/synthetic inputs | That the real downloaded model or Play asset pack is the expected artifact; packaging guards must also be checked |
| `artifacts/weather-app/android/app/src/test/java/.../WebViewCompatibilityTest.java` | WebView major-version parsing and the minimum-version gate | The pure version-gate logic is tested | That a particular device has a working WebView, renders the UI or has no compatibility bug |
| `artifacts/weather-app/tests/e2e/app.spec.ts` | Browser rendering, geolocation mocks, security headers, accessibility, storage, privacy pages, XSS and location UI | Browser automation against the built web app with deterministic fixtures | Android WebView behaviour, physical sensors, real network endpoints or production deployment |
| `pnpm audit --audit-level critical` | Advisory database scan of installed JavaScript dependencies | No critical advisory was reported by the configured audit at that moment | Source-code correctness, native library safety or runtime security |
| `.github/workflows/codeql.yml` | CodeQL analysis of JavaScript/TypeScript, Actions and Java/Kotlin (Java uses `build-mode: none`) | Static findings were analysed by the configured queries | Dynamic testing, native runtime behaviour or a complete security audit |

### Running dependency and static-analysis checks

From the repository root, the dependency audit used by CI is:

```bash
pnpm audit --audit-level critical
```

It scans the installed JavaScript dependency graph against the advisory
database. It is not a source-code review or a native-library scan.

CodeQL is configured in `.github/workflows/codeql.yml` to analyse
JavaScript/TypeScript and Actions, plus Java/Kotlin with `build-mode: none` on
pull requests, pushes to `main`, and a weekly schedule. There is no checked-in
local CodeQL command; use the workflow result and record the analysed commit.

### Important distinctions

- **Source tests are not packet capture.** `network-boundary.test.ts` and
  `speech-privacy.test.ts` read source and configuration. Neither proves that an
  installed binary made no network request. The repository's
  [network evidence](security/network-evidence.md) records the packet-capture
  plan and states that no pcap has been produced.
- **Endpoint detector tests are not recognition accuracy.** The detector test
  uses synthetic energy chunks. The repository's speech evaluation report is
  evidence from a separate model harness, not an integrated-application accuracy
  result. Do not present either as a general WER or accuracy score for the app.
- **Browser automation is not Android device testing.** Playwright uses
  Chromium and mocked providers. It does not exercise Android AudioRecord,
  Parakeet native inference, Kokoro playback, GNSS or OEM lifecycle behaviour.
- **Dependency scans are not source review or dynamic testing.** `pnpm audit`
  checks advisories; CodeQL performs configured static analysis. Neither
  replaces manual security review, packet evidence or a physical-device pass.

## Reporting failures and findings

Use a report that another reviewer can reproduce without asking you for context.

```markdown
### Finding

- Candidate branch:
- Commit SHA:
- Installed/build artifact SHA-256 (if applicable):
- Package ID and version:
- Device, OS/API level and WebView version (if applicable):
- Environment and tool versions:

### Check

- Exact command or manual action:
- Preconditions:
- Reproduction steps:
- Expected result:
- Actual result:

- Status: PASS / FAIL / PARTIAL / BLOCKED / NOT RUN
- Evidence: logs, screenshots, test output, hashes (redact secrets and personal data)
- Limitations:
- Reproducible: yes / no / unknown
```

Status meanings:

- **PASS:** the stated check was executed on the recorded artifact/SHA and met
  its expected result.
- **FAIL:** the check ran and the application or test assertion failed.
- **PARTIAL:** some scenarios passed and others were not completed or did not
  meet the full criterion.
- **BLOCKED:** the check could not run because a required prerequisite was
  unavailable (for example a missing model, Android SDK, browser binary,
  approved APK or physical device).
- **NOT RUN:** the check was intentionally not attempted; do not use this as a
  substitute for a result.

A missing SDK, absent browser, unavailable model, absent signing key or
unapproved APK is an environment/prerequisite problem. Record it as BLOCKED and
name the missing item; do not convert it into a product failure or a pass.

For device findings, distinguish permission success from a delivered location
fix, and listening state from a successful transcript/answer. For network
findings, state whether evidence is source-derived, metadata-only packet
capture or TLS-decrypted payload evidence.

## Coverage gaps and limitations

These gaps are supported by the checked-in source, workflows and repository
reports:

- **No packet evidence has been produced.** The network evidence document
  describes a four-window PCAPdroid plan and states that it is blocked pending
  VPN consent. Source guards do not prove zero speech egress.
- **No automated physical-device job is checked in.** Android CI runs JVM tests,
  debug packaging and lint only. Microphone lifecycle, AudioRecord/OEM
  behaviour, actual GNSS delivery, audible narration and device WebView
  compatibility remain manual checks.
- **No integrated speech-accuracy suite is present in this repository.** The
  Parakeet evaluation report describes a separate model harness and its
  limitations. Do not infer app-level accuracy from the endpoint detector or
  controller tests.
- **CI does not build the production-signed release bundle.** The workflows
  build the debug APK/AAB and do not exercise release signing, release R8 or a
  production upload artifact.
- **CI does not retain the built APK/AAB as an Actions artifact.** A successful
  packaging log is not by itself a retrievable test binary with recorded
  identity.
- **Playwright covers Chromium only.** The configuration has one Chromium
  project. Browser engine coverage and Android WebView behaviour are separate.
- **Android lint warnings are allowed.** The lint task is configured to catch
  errors; warnings can remain and are not a clean bill of health.
- **Dependency audit threshold is critical only.** High and moderate advisories
  do not fail the documented `pnpm audit --audit-level critical` step.
- **CodeQL is static analysis.** It does not replace dynamic testing,
  third-party binary review or an independent security assessment.
- **The hosted site and live Play declarations are not tested here.** A local
  preview, a source file or a green unit test does not prove what is deployed or
  what is saved in Google Play.
- **Some release/security documents are historical snapshots.** They explicitly
  say that their results are not current-tree evidence. Use this guide to run
  the checks and record a fresh result rather than treating an old document as a
  current pass.

Independent security review, packet-level evidence and outstanding
physical-device validation remain necessary before any release claim that
depends on them.

## Related documents

- [Security research starting point](security/README.md)
- [Applying the research to Daymark](security/daymark-security.md)
- [Network boundary evidence and capture plan](security/network-evidence.md)
- [V2 privacy hardening and release gates](release/version-2-privacy-hardening.md)
- [Android production-readiness audit](release/android-production-readiness.md)
- [Parakeet Android phone evaluation](release/parakeet-v3-android-phone-evaluation.md)
- [Reproducible Android release build guide](release/reproducible-build-guide.md)
- [Repository security policy](../SECURITY.md)
