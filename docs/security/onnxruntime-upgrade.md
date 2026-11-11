# ONNX Runtime upgrade: 1.28.2 to 1.31.0

**Status:** proposal and build study. Not merged, not shipped, and not a
production-approved upgrade. **TESTING REQUIRED** for every on-device and
runtime claim below.

## Why

Daymark's Android voice runtime links ONNX Runtime 1.28.2, the version pinned
by sherpa-onnx v1.13.8. The upstream 1.28.3 release notes (2 October 2026)
describe memory-safety and model-validation fixes. This document assesses
moving the pinned runtime to 1.31.0: whether that release contains the 1.28.3
fixes, whether it stays compatible with Daymark's Android build and packaging,
and what verification remains before any change is made.

The recommendation is ONNX Runtime 1.28.3, or a later release that contains
these fixes, such as 1.31.0. This document checks that statement against the
release notes and the commit history rather than assuming it, records the
trade-offs, and records the local build and packaging study that was run.

Upstream sources:

- ONNX Runtime releases: <https://github.com/microsoft/onnxruntime/releases>
- sherpa-onnx v1.13.8: <https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.8>
- Prebuilt ONNX Runtime Android packages used by the sherpa-onnx build script:
  <https://github.com/csukuangfj/onnxruntime-libs/releases>
- Microsoft Maven artifact:
  <https://repo1.maven.org/maven2/com/microsoft/onnxruntime/onnxruntime-android/>

## Recommendation

Pin ONNX Runtime **1.31.0** at the next rebuild of the AAR, and build ONNX
Runtime from source with **`--no_telemetry`** for that artifact. If a source
build is not available, use the published 1.31.0 Android package and verify
with an on-device network capture that no telemetry egress occurs (see
Telemetry below).

Do not use 1.29.x or 1.30.0: their release branches were cut before the 1.28.3
fixes and contain none of them (ancestry evidence below). 1.28.3 and 1.30.1
do contain the fixes but have no published Android package; 1.31.1 has no
memory-safety delta over 1.31.0 (only an OpenVINO/Python build fix and WASM
test fixes) and no prebuilt Android package.

## Public source verification (checked 2026-11-11)

These statements were checked against official, publicly accessible sources
only.

| Claim | Source | Status |
|---|---|---|
| 1.28.3 released 2026-10-02 as a patch release with memory-safety and model-validation fixes | [v1.28.3 release notes](https://github.com/microsoft/onnxruntime/releases/tag/v1.28.3) | **public fact** (notes) |
| 1.28.3 fixes include OOB reads (#32609, #32610, #32679, #32681) and a heap buffer overflow (#32611) | same release notes | **public fact** (notes) |
| 1.31.0 released 2026-10-09 with broader model, graph and tensor validation, workspace-memory accounting (#31962, #32189) and a ConvTranspose shape-arithmetic overflow fix (#32661) | [v1.31.0 release notes](https://github.com/microsoft/onnxruntime/releases/tag/v1.31.0) | **public fact** (notes) |
| Native builds default to 1DS telemetry in 1.31.0; it can be disabled with `--no_telemetry` (#32384) | same release notes | **public fact** (notes) |
| Each 1.28.3 fix is present in the 1.31.0 tag | Reproducible method: `git log v1.31.0 --grep=<PR>` and `git merge-base --is-ancestor` in a clone of [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) | **author-verified**; not stated by the 1.31.0 notes |
| 1.31.0 builds and packages for Android arm64 with the same NDK but a newer CMake (4.4.5, LTO enabled); the release AAR must still be rebuilt with the pinned CMake 3.22.1 | Local development build (commands below); logs not committed | **local observation**, not upstream-tested |

Where the release notes and the commit history disagree (two 1.28.3 items are
not repeated in the 1.31.0 notes), the table above treats the notes as the
public claim and the ancestry check as the author's verification method.

## Release matrix

All dates are release publication dates from the GitHub Releases API. "Fixes"
refers to the nine 1.28.3 items below. "Prebuilt Android package" means the
`onnxruntime-android-<version>.zip` package published by
[csukuangfj/onnxruntime-libs](https://github.com/csukuangfj/onnxruntime-libs/releases),
which is the package the sherpa-onnx Android build script downloads; it is a
third-party build of ONNX Runtime, not a Microsoft build. Microsoft's Maven
`onnxruntime-android` artifacts are listed in the footnote.

| Version | Released | 1.28.3 fixes present | Prebuilt Android package | Notes |
|---|---|---|---|---|
| 1.28.2 | 2026-09-03 | no (baseline) | yes | currently bundled |
| 1.28.3 | 2026-10-02 | **all 9** (cherry-pick `53e783a1`; tag tip `0d68ff6b` adds infrastructure fixes) | **no** | no prebuilt package in csukuangfj/onnxruntime-libs |
| 1.29.0 | 2026-08-12 | no | yes | has its own [security-fix section](https://github.com/microsoft/onnxruntime/releases/tag/v1.29.0) |
| 1.29.1 | 2026-09-10 | no | yes | predates the fixes |
| 1.30.0 | 2026-09-10 | no | yes | predates the fixes |
| 1.30.1 | 2026-10-29 | **all 9** (cherry-pick `77e55fc6`) | **no** | notes list the full set |
| **1.31.0** | 2026-10-09 | **all 9** (fix commits are on `main` and reachable from the tag) | **yes** | recommended; notes omit two entries |
| 1.31.1 | 2026-10-26 | all 9 (inherits 1.31.0) | no (Microsoft Maven AAR exists) | build/test fixes only |

Release notes: [1.28.3](https://github.com/microsoft/onnxruntime/releases/tag/v1.28.3),
[1.30.1](https://github.com/microsoft/onnxruntime/releases/tag/v1.30.1),
[1.31.0](https://github.com/microsoft/onnxruntime/releases/tag/v1.31.0),
[1.31.1](https://github.com/microsoft/onnxruntime/releases/tag/v1.31.1).

**Maven footnote.** Microsoft publishes `com.microsoft.onnxruntime:onnxruntime-android`
on Maven Central for 1.28.0, 1.29.0, 1.30.0, 1.31.0 and 1.31.1, but not for
1.28.2, 1.28.3 or 1.30.1
(<https://repo1.maven.org/maven2/com/microsoft/onnxruntime/onnxruntime-android/maven-metadata.xml>).
The Maven artifact and the csukuangfj prebuilt package are different builds;
both were inspected for the telemetry check below.

### The nine 1.28.3 items and where they are

| PR | Fix | 1.31.0 contains it |
|---|---|---|
| #32610 | OOB read, `EmbedLayerNormalization` shape inference with scalar beta | yes (`70546574`), not in 1.31.0 notes |
| #32611 | heap buffer overflow reusing a packed sub-byte buffer | yes (`061eecbd`) |
| #32609 | OOB read when a Loop/Scan body input is also an initializer | yes (`09dfa6ad`) |
| #32607 | hardened shape inference for GQA/SparseAttention/CausalConvWithState | yes (`bca9d15b`) |
| #32679 | OOB read in `ConvTransposeWithDynamicPads` | yes (`2ecddca3`), not in 1.31.0 notes |
| #32681 | OOB read in `InferenceContextImpl::getInputData` | yes (`e5f272c9`) |
| #32633 | reject inputs to a zero-input operator schema | yes (`613bc03d`) |
| #32641 | reject subgraphs on non-control-flow nodes | yes (`b95cf781`) |
| #32666 | plugin EP: preserve streams in single-tensor transfers | yes (`5899c7c9`) |

The 1.31.0 release notes list seven of the nine; #32610 and #32679 are in the
1.31.0 tag but missing from its notes. That is a notes gap, not a code gap:
`git log v1.31.0 --grep="#32610"` resolves to the fixing commit
`70546574` and `git merge-base --is-ancestor 70546574 v1.31.0` exits 0.
1.31.0 also includes the 1.29.0 and 1.30.0 feature releases and their security
fixes, which the 1.28.3 patch release does not.

## Commit-ancestry verification

The nine fix commits were resolved from the v1.31.0 tag and checked with
`git merge-base --is-ancestor <commit> <tag>` (exit code 0 means the fix is
reachable from that tag). Commands, from a public clone:

```sh
git clone --filter=tree:0 https://github.com/microsoft/onnxruntime.git
cd onnxruntime
for pr in 32610 32611 32609 32607 32679 32681 32633 32641 32666; do
  git log v1.31.0 --grep="#$pr" --format='%H %s' -n1
done
git merge-base --is-ancestor <fix-commit> <tag>; echo $?   # 0 = present
```

Result (original fix commits, as merged on `main`):

| Tag | Nine fixes present | Evidence |
|---|---|---|
| v1.28.3 | yes | via cherry-pick `53e783a1`; the original fix commits are not ancestors (patch release branch) |
| v1.29.0 | no | none of the original fix commits is an ancestor; no cherry-pick lists the PRs |
| v1.29.1 | no | same |
| v1.30.0 | no | same |
| v1.30.1 | yes | via cherry-pick `77e55fc6` |
| v1.31.0 | yes | all nine original fix commits are ancestors of the tag |
| v1.31.1 | yes | all nine are ancestors; v1.31.0 is an ancestor of v1.31.1 |

All nine original fix commits are on `main`. The v1.31.0 tag commit itself is a
release-branch tip (it is not an ancestor of the current `main`), so the
precise statement is that the **fix commits** are on `main` and reachable from
the tag, not that the tag tip is on `main`.

The 1.28.3 and 1.30.1 cherry-pick commits list all nine source PRs in their
commit messages: `53e783a1b2af3a6818abe826353a5738d7282c83` ("ORT 1.28.3 Cherry
Picks") and `77e55fc6b899c623e8e3c3546532a1dcfe231056` ("ORT 1.30.1 Cherry
Picks"). The 1.28.3 tag tip `0d68ff6b3b72b04aac578decd6c4c45d322bb962` is a
separate infrastructure cherry-pick and is not the fix cherry-pick.

## Compatibility matrix

| Area | Assessment | Evidence |
|---|---|---|
| sherpa-onnx v1.13.8 source | builds unchanged against ORT 1.31.0 headers; no source patch needed | local Android arm64 JNI build succeeded (not committed) |
| ORT selection | the build script accepts an explicit ONNX Runtime version through `SHERPA_ONNX_ONNXRUNTIME_VERSION` (default 1.28.2) and external directories through `SHERPA_ONNXRUNTIME_LIB_DIR`/`SHERPA_ONNXRUNTIME_INCLUDE_DIR` or `SHERPA_ONNX_ONNXRUNTIME_ROOT` | [build-android-arm64-v8a.sh:93](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/build-android-arm64-v8a.sh#L93) and surrounding external-directory handling |
| ORT cmake pin | [cmake/onnxruntime-android-aarch64.cmake](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/cmake/onnxruntime-android-aarch64.cmake) hardcodes the 1.28.2 URL and SHA-256; it only matters for direct-cmake builds, because the script path sets the external library/include directories itself | file contents; script handling above |
| C ABI | build headers define ORT_API_VERSION 26 in the csukuangfj 1.28.2 package used by the build script (the upstream v1.28.2 source tag defines 28); the 1.31.0 headers define 31, so the rebuild delta is 26 -> 31 | unzipped header; upstream tags; package lib matches the shipped AAR |
| JNI packaging | rebuilt JNI links `libonnxruntime.so` exactly as before; AAR has the same 9 entries | local development build (commands below; logs not committed); the AAR is produced by the upstream [SherpaOnnxAar project](https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.8/android/SherpaOnnxAar), which packages the `jniLibs` directory |
| Android ABI | arm64-v8a only, unchanged; the prebuilt libraries' `.note.android.ident` reports Android API 27 (app minSdk 29) | `llvm-readelf -n` on the 1.28.2 and 1.31.0 libraries |
| 16 KB pages | both new libraries have `LOAD` alignment `0x4000`, like the shipped ones | `llvm-readelf -l` |
| app integration | debug APK builds with the rebuilt AAR and packages both native libraries | local development build (logs not committed) |
| model assets | the Parakeet TDT int8 files are untouched by ONNX Runtime; runtime model loading is expected to remain backward compatible | reasoned; **inference not run here** (model not present, see Residual risk) |
| binary size | JNI 5,035,144 -> 4,780,184 bytes; ORT 22,249,560 -> 25,378,544 bytes; AAR +1,361,223 bytes (≈1.30 MiB / 1.36 MB) | "before" values from the tracked AAR at `artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`; 1.31.0 library from the published package; "after" values from the local development build |

The JNI size change is a build-profile difference, not an ONNX Runtime effect:
this study used CMake 4.4.5, where sherpa-onnx enables LTO; the shipped AAR was
built with CMake 3.22.1, where `check_ipo_supported` fails and LTO is off
(see the LTO gate in [sherpa-onnx CMakeLists.txt](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/CMakeLists.txt#L261)).
A controlled rebuild of the same sources and patch against 1.28.2 with the
same CMake was started to isolate the effect and then cancelled under a
disk/resource constraint, so the LTO explanation is a reasoned assessment
rather than a measured A/B comparison. The release AAR must be rebuilt with
the pinned CMake 3.22.1 profile before its digest is pinned.

## Telemetry: a trade-off to decide explicitly

ONNX Runtime 1.31.0 changed a default: "Supported native builds now default to
1DS telemetry ... telemetry can be disabled with `--no_telemetry`" (#32384), per
the [v1.31.0 release notes](https://github.com/microsoft/onnxruntime/releases/tag/v1.31.0).

Daymark inspected the published 1.31.0 artifacts (downloaded from the public
URLs above, then `unzip`/`strings`/`readelf`):

1. The prebuilt package used by the sherpa-onnx build script
   (`onnxruntime-android-1.31.0.zip` from
   [csukuangfj/onnxruntime-libs v1.31.0](https://github.com/csukuangfj/onnxruntime-libs/releases/tag/v1.31.0),
   SHA-256 `be178835b05a8e9439e8fa1729072e4f0437166fdaf3390ea76156ff1df6f56c`):
   its `jni/arm64-v8a/libonnxruntime.so` (SHA-256
   `ba05514c0d25cdb07ad46ada8cfa615fe6ffe385c881458378cd1bf4cfe98dda`,
   25,378,544 bytes) contains `OneCollector` (2 occurrences), the endpoint
   `https://mobile.events.data.microsoft.com/OneCollector/1.0`, and eight
   `Java_ai_onnxruntime_telemetry_HttpClient_*` JNI hooks.
2. Microsoft's official Maven AAR
   `com.microsoft.onnxruntime:onnxruntime-android:1.31.0`
   (SHA-1 `09e434725ac3aea8a313f74d942c1b6e0ad5091e`, which matches Maven's
   published checksum): its `libonnxruntime.so` contains the same telemetry
   strings, and its `classes.jar` contains `ai/onnxruntime/telemetry/HttpClient`.
   Its manifest declares an `ai.onnxruntime.TelemetryInitializer` provider and
   the `INTERNET` permission.
3. The 1.28.2 library (SHA-256
   `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1`, the
   same bytes as the ONNX Runtime library inside the currently shipped AAR)
   contains none of these strings.

The prebuilt csukuangfj package is a **third-party build** of ONNX Runtime, not
a Microsoft build: the library embeds GitHub Actions build paths for the
`onnxruntime-libs` repository. The Maven AAR is Microsoft's official artifact.
They are different builds and should not be conflated.

Daymark is a privacy-first weather app, so this must be a deliberate decision:

- telemetry needs the ONNX Runtime Java `HttpClient` to be initialised through
  JNI; without it the runtime reports "Android telemetry is unavailable because
  the 1DS Java HttpClient was not initialized" (this exact string is present in
  the 1.31.0 binary) and has no transport (the 1.31.0 `libonnxruntime.so` links
  only libc/liblog/libm/libdl, no curl);
- Daymark ships no ONNX Runtime Java classes. The AAR packaging step copies only
  `libsherpa-onnx-jni.so` and `libonnxruntime.so` into `jniLibs`, and the tracked
  AAR's `classes.jar` contains only `com.k2fsa.sherpa.onnx` (verified in
  `artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`);
  the app and voice-module Gradle files declare no `onnxruntime-android`
  dependency. Copying the prebuilt package's `classes.jar`
  or `AndroidManifest.xml` would add its `TelemetryInitializer` provider and
  should not be done;
- therefore the prebuilt 1.31.0 build should be inert for telemetry in this
  integration, but that is a code-reading argument and has not been verified
  with a network capture on a device here;
- the clean fix is to build ONNX Runtime 1.31.0 from source with
  `--no_telemetry` and verify with `strings libonnxruntime.so | grep -c
  OneCollector` that the result is `0` before packaging;
- a runtime alternative is `ORT_DISABLE_TELEMETRY=1` in the process
  environment. ONNX Runtime reads that variable in
  [onnxruntime/core/platform/telemetry_environment.h](https://github.com/microsoft/onnxruntime/blob/v1.31.0/onnxruntime/core/platform/telemetry_environment.h)
  (truthy values: 1/true/yes/on/y), and the string is present in the 1.31.0
  library.

Telemetry remains **TESTING REQUIRED** until a device network capture is run.

## Upgrade procedure

1. Build the JNI against ONNX Runtime 1.31.0:

```sh
export ANDROID_NDK=<ndk 29.0.14206865>
export SHERPA_ONNX_ONNXRUNTIME_VERSION=1.31.0
export BUILD_SHARED_LIBS=ON
# the script downloads onnxruntime-android-1.31.0.zip; or supply an extracted copy:
export SHERPA_ONNX_ONNXRUNTIME_ROOT=<extracted onnxruntime-android-1.31.0>
cd <sherpa-onnx v1.13.8 + 0001-joiner-width-validation.patch>
bash ./build-android-arm64-v8a.sh
```

   Expected inputs: `onnxruntime-android-1.31.0.zip` SHA-256
   `be178835b05a8e9439e8fa1729072e4f0437166fdaf3390ea76156ff1df6f56c`;
   `libonnxruntime.so` SHA-256
   `ba05514c0d25cdb07ad46ada8cfa615fe6ffe385c881458378cd1bf4cfe98dda`.

2. Package the AAR with the upstream `android/SherpaOnnxAar` project:

```sh
cp build-android-arm64-v8a/install/lib/libsherpa-onnx-jni.so \
   build-android-arm64-v8a/install/lib/libonnxruntime.so \
   android/SherpaOnnxAar/sherpa_onnx/src/main/jniLibs/arm64-v8a/
cd android/SherpaOnnxAar && ./gradlew :sherpa_onnx:assembleRelease
```

3. Re-run the tests that need the model and a device (not run here): the
   Daymark native suite (normal and ASan), the on-device native runner, and a
   real Parakeet TDT transcription on the shipped AAR; then compare the JSON
   output against the 1.28.2 build.

4. Update the pins in one change, so the integrity gate and CI cannot disagree:
   - `AAR_SHA256` in `android/kokoro-poc/scripts/fetch-sherpa-onnx.sh` (the pin
     that exists today);
   - the `AAR SHA-256` and ONNX Runtime rows in
     `artifacts/weather-app/android/daymark-voice/SHERPA-ONNX-PROVENANCE.md`;
   - the separate AAR-digest pin file and `verifySherpaAar` Gradle task, and the
     AAR rebuild workflow, once the corresponding AAR-integrity and
     rebuild-automation changes land.

5. If ONNX Runtime is built from source instead of using the published package,
   add `--no_telemetry` to the build, then check
   `strings libonnxruntime.so | grep -c OneCollector` is `0` before packaging.

## Integration proposal for the CI AAR pipeline

The following are proposals, not descriptions of existing automation:

1. Add an ONNX Runtime version parameter next to the existing sherpa-onnx
   version selection and pass it as `SHERPA_ONNX_ONNXRUNTIME_VERSION`; export
   `SHERPA_ONNX_ONNXRUNTIME_ROOT` to a cached, checksum-verified extraction of
   `onnxruntime-android-1.31.0.zip` so the build never depends on `wget`.
2. Decide the telemetry posture in the pipeline: either build ONNX Runtime with
   `--no_telemetry` and assert `strings ... | grep -c OneCollector == 0`, or
   record the decision to ship the published package and add an on-device
   network assertion to the release checklist.
3. Emit the AAR digest from the pipeline and fail if it differs from the
   AAR-integrity pin file. If the pipeline computes the pin, update that file in
   the same commit as the artifact. This depends on the separate AAR-integrity
   change that introduces the pin file and the `verifySherpaAar` task.
4. Keep the integrity gate in the release path: the release job should run the
   `verifySherpaAar` task after staging the AAR, before packaging. This also
   depends on the AAR-integrity change.

## Verification status

The "development build record" in this document means the local build used for
the study: its logs are not committed to the repository. The commands in this
document are reproducible from the pinned sources, and the published-artifact
hashes above can be re-derived from the public URLs; the local build numbers
are observations, not CI-reproduced results.

| Step | Status |
|---|---|
| Build Android arm64 JNI and link it against ONNX Runtime 1.31.0 | done in the local development build |
| Package the rebuilt JNI and ONNX Runtime into an AAR | done in the local development build, 11,575,300 bytes |
| Host native suite: joiner-validation tests, macOS arm64, ONNX Runtime 1.31.0, committed fixtures | 24/24 passed in the local development run; log not committed |
| Host native suite under AddressSanitizer | not run |
| On-device native runner | not run: no connected device |
| Real Parakeet TDT int8 transcription (greedy and modified beam) | not run: model assets absent |
| Telemetry network capture on device | not run |

## Residual risk

- No device and no Parakeet model were available here, so inference and the
  on-device runner were not re-run with ONNX Runtime 1.31.0. The local host
  suite passed 24/24, so the change is build- and host-test verified, but not
  behaviour-verified on Android. Treat it as **TESTING REQUIRED** until those
  runs happen.
- Telemetry is compiled into the published 1.31.0 Android binaries; the
  "inert without the Java client" argument is a code-reading argument, not a
  network capture on a device.
- Shipping 1.31.0 adds 3,128,984 bytes of ONNX Runtime (≈2.98 MiB / 3.13 MB)
  and, with the LTO-enabled profile used here, changes the JNI size; the
  release AAR should be built with the pinned CMake/NDK profile so its digest
  is reproducible.
- No advisory for the 1.28.3 fixes was found in [OSV](https://osv.dev/) or the
  [GitHub Advisory Database](https://github.com/advisories) (checked 2026-11-11);
  this is not an exhaustive search. The change is hardening rather than a
  response to a published advisory.
