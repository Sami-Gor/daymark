# CI release gates (Daymark V2.1)

This document describes the release-variant jobs added in
[`release-gates.yml`](../../.github/workflows/release-gates.yml), what each one
proves, and — just as important — what stays unproven. It is written against
branch `ci/v21-release-coverage` (base `3426bb4`, `release/v21-integration`).

Read it before treating a green check as evidence that Daymark V2.1 is
releasable. None of these jobs produces a release artifact.

## 1. Why these jobs exist

The repository already had two Android-capable workflows:

| Workflow | Android coverage today |
|---|---|
| [`ci.yml`](../../.github/workflows/ci.yml) (`CI` → `verify`) | `:app:assembleDebug`, `:app:bundleDebug`, `:app:testDebugUnitTest`, `:daymark-voice:testDebugUnitTest`, `:app:lintDebug` |
| [`android-ci.yml`](../../.github/workflows/android-ci.yml) (`Android CI` → `android`) | `:app:testDebugUnitTest`, `:daymark-voice:testDebugUnitTest`, `:app:assembleDebug`, `:app:bundleDebug`, `:app:lintDebug` |

Both cover debug variants only. A regression that only affects release — a
release-only `BuildConfig` field, a release-only manifest/resource merge
problem, a lint check that fires only on release, R8/resource shrinking — had
no CI signal. The `release-gates` workflow adds that signal without touching
the existing jobs or the required `CI` status check on `main`.

The workflow is intentionally **not** wired into branch protection. A separate
required-check decision is an owner action (section 7).

## 2. Jobs and the exact tasks they run

| Job id | Display name | Gradle tasks |
|---|---|---|
| `release-lint` | release lint (app + voice, debug and release) | `:daymark-voice:lintDebug`, `:daymark-voice:lintRelease`, `:app:lintDebug`, `:app:lintRelease` |
| `native-jvm-tests` | native JVM unit tests (debug and release) | `:daymark-voice:testDebugUnitTest`, `:daymark-voice:testReleaseUnitTest` |
| `release-config` | release configuration validation (not a release build) | `:app:assembleDebug`, `:app:lintRelease` |

Each job is independent: it checks out the repository, installs with a frozen
lockfile, builds the web assets, runs `pnpm --filter @workspace/weather-app exec
cap sync android` (and, where the job packages web assets, `pnpm --filter
@workspace/weather-app run sync:android-web`), verifies the committed
sherpa-onnx AAR, and then invokes Gradle once. Java 21 (Temurin) is used in
every job, matching `CI` and `Android CI` — Capacitor 8's Android modules
compile with Java 21.

They are separate jobs rather than one job with extra steps so that each can be
required, re-run or removed on its own, and so one failing gate does not hide
the others. The cost is repeated setup per job; that is accepted for release
gating and matches the existing workflows' style.

### 2.1 `release-lint`

Proves:

- lint runs against the **release** variant of the app and of the
  `daymark-voice` library, not just debug;
- the release variant's merged manifest/resources and generated
  `BuildConfig` are valid;
- the Android web assets that Gradle would package are hash-identical to
  `dist` (the `sync:android-web` step runs the asset verifier after the final
  `cap copy`);
- the committed patched sherpa-onnx AAR is the hash-pinned one
  (`android/kokoro-poc/scripts/fetch-sherpa-onnx.sh`).

Does not prove: that release code compiles or shrinks under R8, that a release
archive contains the right entries, or that release signing works.

`warningsAsErrors` stays off, as in the existing lint steps: the project has
lint warnings today and the gate is for new **errors**.

### 2.2 `native-jvm-tests`

Proves:

- the `daymark-voice` JVM tests compile and pass against the **release**
  variant as well as debug. Compiling the release variant regenerates the
  release `BuildConfig` (`MULTILINGUAL_NARRATION = true`,
  `PACKAGED_MULTILINGUAL_VOICES = false`), so the module's
  `verifyReleaseMultilingualGate` finalizer also runs and fails the build if the
  compiled gate drifts;
- policy, model-integrity and endpoint-detection tests run on release
  bytecode.

Does not prove: anything about the packaged app, the model files, signing or
Play delivery. The tests read digests and policies compiled into the module,
not the Parakeet model, which is why this job does not fetch the model.

### 2.3 `release-config`

Proves:

- `:app:assembleDebug` still produces a real debug APK, including the
  Capacitor web assets and the archive-level checks (`verifyWebAssets`,
  `verifyDebugPackagedLicenses`) that open the APK and verify the packaged
  licence notices and Capacitor plugin registration;
- `:app:lintRelease` succeeds on a clean runner that has **no** release signing
  material and **no** Parakeet model, i.e. the release variant configures,
  resolves its dependencies and passes release lint;
- the job explicitly asserts that no Parakeet model is staged, so this claim
  cannot quietly become untested.

The debug APK is model-free because APK packaging never reads the asset pack;
section 4 explains the build wiring that guarantees this.

Does not prove, and its name and run summary say so: a release build. In
particular it does **not** run `:app:bundleRelease`, `:app:assembleRelease`,
R8 shrinking, `verifyReleasePackagedLicenses`, `verifyReleaseBundleContents`,
asset-pack manifest generation, or any signing step.

## 3. What remains unproven

| Area | Why it is not covered here | Where it is covered (or must be) |
|---|---|---|
| Release AAB (`:app:bundleRelease`) | needs the Parakeet model (the asset pack fails packaging without it) and a release signing config | [`reproducible-build-guide.md`](reproducible-build-guide.md) with a temporary test keystore; `play-console-checklist.md` |
| Release signing with the production upload key | the key and `keystore.properties` are deliberately outside the repository; credentials must never be added to CI or git | owner machine only; `android-production-readiness.md` |
| Packaged-archive checks on a release artifact | `verifyReleaseBundleContents` / `verifyReleasePackagedLicenses` open a built APK/AAB, which these jobs do not build | local release build, then run the tasks |
| Play Asset Delivery of the `parakeet` pack | requires the model plus a signed AAB and Play/bundletool processing | `bundletool` + Play Console closed testing |
| Device install and runtime of split APKs | no device or emulator in these jobs | physical-device acceptance, `parakeet-v3-android-phone-evaluation.md` |
| Byte-identical AAB reproducibility | path-dependent `libkokoro_jni.so` | `reproducible-build-guide.md` |

The unproven items are not "probably fine". They are verified by other,
owner-run processes, and a green `release-gates` run must not be cited as
evidence for any of them.

## 4. Parakeet model handling

The speech model is part of the release artifact. It is **not** committed, and
the release jobs do not fetch it — but the rules for obtaining it are fixed:

- **Pinned source**: Parakeet TDT 0.6B v3 (int8) from the k2-fsa sherpa-onnx
  release archive `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`,
  archive SHA-256
  `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`.
  The model files are approximately 640 MB uncompressed
  (`v2.1-release-scope.md`), which is why they are delivered as an install-time
  Play asset pack rather than in the base module.
- **Checksum verification**: `android/kokoro-poc/scripts/fetch-parakeet-assets.sh`
  verifies the archive digest and then each extracted file
  (`encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`,
  `tokens.txt`) against pinned SHA-256 values before staging them under
  `artifacts/weather-app/android/parakeet-assets/src/main/assets/parakeet`.
- **Second and third checks**: `parakeet-assets/build.gradle` re-verifies the
  staged files in `verifyParakeetAssets`, which runs before release packaging,
  and the app re-checks the same digests before loading the model.

Rules that apply to CI and to local release builds:

- Do **not** commit the model, dummy files, truncated files or "placeholder"
  assets to make a build pass. A build without the real, verified model is not
  a release build.
- Do **not** disable, weaken or bypass `verifyParakeetAssets`, the app-level
  integrity check, or the fetch script's checksum checks.
- Do **not** replace the pinned archive with an unpinned download or a
  different model without updating the pins, the notices, and this document.
- Do **not** add the model to these CI jobs just to enable a release build.
  If a truly signed/AAB gate is wanted later, it needs the model, a signing
  path that is safe for CI (or an owner-run job), and an explicit review.

### 4.1 APK packaging does not need the model; bundle packaging does

An install-time asset pack exists only in an app bundle. `packageDebug` /
`packageRelease` build an APK, which never contains the pack, so those tasks
must not depend on the model. `parakeet-assets/build.gradle` wires
`verifyParakeetAssets` only to the tasks that do read the pack —
`bundleDebug`, `bundleRelease`, `packageDebugBundle`, `packageReleaseBundle`
and `generateAssetPackManifest`. That is why `:app:assembleDebug` and
`:app:lintRelease` can run from a clean checkout without downloading ~640 MB,
while every bundle still verifies the staged model first.

Before this change the wiring also matched `packageDebug`/`packageRelease`,
which made a plain `:app:assembleDebug` download the model. That contradicted
the guard's own "debug build is unaffected" comment and would have made the
model-free release-config job impossible. The verification itself was not
weakened for bundles: it is still a hard failure, not a warning.

The native runtime, by contrast, **is** committed:
`artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`
(~10 MB, patched for CVE-2026-108954). The jobs verify it with
`android/kokoro-poc/scripts/fetch-sherpa-onnx.sh`, which refuses to substitute
the unpatched upstream AAR. See
`artifacts/weather-app/android/daymark-voice/SHERPA-ONNX-PROVENANCE.md`.

## 5. Running the same gates locally

```bash
# Prerequisites: Node 24 + pnpm 12.3.4, JDK 21, Android SDK platform/build-tools
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME="$HOME/Library/Android/sdk"   # adjust to your SDK

pnpm install --frozen-lockfile
pnpm --filter @workspace/weather-app run build
pnpm --filter @workspace/weather-app exec cap sync android
pnpm --filter @workspace/weather-app run sync:android-web
android/kokoro-poc/scripts/fetch-sherpa-onnx.sh

cd artifacts/weather-app/android
./gradlew --no-daemon \
  :daymark-voice:lintDebug :daymark-voice:lintRelease \
  :app:lintDebug :app:lintRelease
./gradlew --no-daemon \
  :daymark-voice:testDebugUnitTest :daymark-voice:testReleaseUnitTest
./gradlew --no-daemon :app:assembleDebug :app:lintRelease
```

For a real release AAB, follow `reproducible-build-guide.md`: fetch the model
with `android/kokoro-poc/scripts/fetch-parakeet-assets.sh`, use a **temporary
test keystore**, and run `:app:bundleRelease` plus
`verifyReleaseBundleContents`. Never use production signing material for a
reproducibility check, and never commit a keystore or `keystore.properties`.

## 6. Validation status of this change

- `release-gates.yml` was parsed locally with PyYAML `yaml.safe_load`, and
  every `run:` block was checked with `bash -n`. `on` appears as a boolean key
  under YAML 1.1 parsing, which is expected; GitHub Actions reads workflows as
  YAML 1.2, where `on` is a string.
- The task names and task graphs were checked locally with Gradle 8.14.3
  `--dry-run` against the Android SDK. This confirmed that
  `:daymark-voice:lintDebug`, `:daymark-voice:lintRelease`,
  `:daymark-voice:testDebugUnitTest`, `:daymark-voice:testReleaseUnitTest`,
  `:app:lintDebug` and `:app:lintRelease` exist; that `:app:lintRelease`
  reaches no `:parakeet-assets:` task; and that `:app:assembleDebug` no longer
  pulls `:parakeet-assets:verifyParakeetAssets` while `:app:bundleDebug` still
  does. `:app:lintRelease` does run the app's model-tolerant ownership guard
  (`verifyParakeetAssetOwnership`), which only fails if the model is duplicated
  into the base APK assets.
- The Gradle tasks were **not executed** end to end, and GitHub Actions was
  **not** run from this branch. The first real signal is the first workflow
  run. Remaining risk: a clean-runner difference (SDK/NDK versions, network
  for the web build) that a local dry run cannot reproduce.
- The 640 MB model was present in the authoring checkout but was never read
  by these tasks; the release-config job asserts its absence on CI.

## 7. Open items for the owner

1. Decide whether `release-lint`, `native-jvm-tests` and `release-config`
   become required checks on `release/**` (they are not today).
2. Decide how a real release build gate should run, given that it needs the
   model and production signing. Options: an owner-run local gate documented
   here, or a protected CI path with signing material held outside the repo.
3. Keep this document in sync when tasks, model pins or delivery architecture
   change (`v2.1-release-scope.md` records that the final pack delivery design
   is still open).
