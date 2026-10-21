# Reproducible Android release build (Daymark V2)

This guide describes how to build the Daymark V2 Android App Bundle from a clean
checkout, with pinned tools and verifiable inputs. It is written against commit
`baf83e9cacbba440e609943fdeeed22b942cfa13` (V2 head at the time of writing)
and the production Capacitor project at `artifacts/weather-app/android/`.

It deliberately uses a **temporary test keystore**. Do not use production
signing material for a reproducibility check, and never commit a keystore or
`keystore.properties`.

## What is and is not reproducible

With the checked-in scripts, two builds from two different absolute clone paths
produced **different** AABs in this test. The difference was confined to the
Rust-built `libkokoro_jni.so`, its debug-symbol file, and the JAR signature over
them. The Rust library embeds the absolute path of the Kokoro checkout, and a
same-path rebuild reproduces the library byte-for-byte. In this test, everything
else — the DEX, web assets, Kokoro model/voice, Parakeet model, and the other
native libraries — was identical.

Therefore:

- A **working, verifiable release AAB** is reproducible from any clean path.
- A **byte-identical AAB** requires building from the same absolute path both
  times (or adding a tested path-normalization step). The checked-in build
  scripts do not normalize paths.
- Do not claim byte-identical output unless you have compared the files and
  accounted for this path dependency.

## 1. Clean-machine prerequisites

Tested host: macOS 26.5.2 on Apple Silicon. The checked-in Kokoro build script
currently hardcodes the NDK host directory `darwin-x86_64`; on Linux you must
adjust that script to `linux-x86_64` (or provide an equivalent wrapper) before
the native step.

Install:

- Xcode Command Line Tools (host C toolchain for Rust):
  `xcode-select --install`
- Git, curl, unzip, Python 3, `shasum` (macOS) or `sha256sum` (Linux).
- JDK 21. Tested: Homebrew `openjdk@21`, OpenJDK `21.0.12.1`.
- Node.js 24. Tested: `v24.22.1` from the official `darwin-arm64` tarball.
- pnpm `12.3.4` (the repo's `packageManager` pin).
- Android SDK: platform 36, build-tools 36.0.0, platform-tools, NDK
  `29.0.14206865`, and `cmdline-tools`.
- Rust `1.98.1` with the `aarch64-linux-android` target.
- Gradle is **not** installed globally: use the checked-in wrapper
  `artifacts/weather-app/android/gradlew` (Gradle 8.14.3). Do not use the
  repository-root `android/gradlew`; that is the frozen legacy TWA project and
  points at Gradle 8.11.1.
- bundletool `1.18.1` (jar).

Allow at least 15 GB of free space on the build volume. A release build creates
roughly 3–4 GB of Gradle intermediates, a ~675 MB AAB, a ~300 MB debug APK, a
~945 MB Rust target, and ~650 MB of Parakeet weights per checkout.

### Install Node 24 without touching the system Node

```bash
NODE_VERSION=24.22.1
NODE_TARBALL=node-v${NODE_VERSION}-darwin-arm64.tar.gz
curl -fLO "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
# Expected SHA-256:
# 89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7
shasum -a 256 "$NODE_TARBALL"
tar -xzf "$NODE_TARBALL"
export PATH="$PWD/node-v${NODE_VERSION}-darwin-arm64/bin:$PATH"
node --version   # v24.22.1
npm install -g pnpm@12.3.4
pnpm --version   # 12.3.4
```

### Rust

If `rustup` is absent:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
  sh -s -- -y --default-toolchain 1.98.1
source "$HOME/.cargo/env"
rustup target add aarch64-linux-android
rustc -V   # rustc 1.98.1
```

The tested host already had rustc/cargo `1.98.1` and the target installed.

### Android SDK

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools   # or your SDK
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
sdkmanager "platforms;android-36" "build-tools;36.0.0" \
  "platform-tools" "ndk;29.0.14206865"
```

### bundletool

```bash
curl -fL -o bundletool-all-1.18.1.jar \
  https://github.com/google/bundletool/releases/download/1.18.1/bundletool-all-1.18.1.jar
shasum -a 256 bundletool-all-1.18.1.jar
# 675786493983787ffa11550bdb7c0715679a44e1643f3ff980a529e9c822595c
```

## 2. Pin the environment

Put these in a shell file and source it for every build. The order of `PATH` is
important: Node 24 must come before any system Node.

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
export PATH="/path/to/node-v24.22.1-darwin-arm64/bin:$JAVA_HOME/bin:$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

test "$(node --version)" = "v24.22.1"
test "$(pnpm --version)" = "12.3.4"
"$JAVA_HOME/bin/java" -version
test -d "$ANDROID_NDK_HOME"
```

Create the gitignored SDK pointer:

```bash
cat > artifacts/weather-app/android/local.properties <<EOF
sdk.dir=$ANDROID_HOME
EOF
```

## 3. Source checkout

For a byte-identical comparison, use the **same absolute path** for both
checkouts. A simple scheme is one checkout rebuilt twice after deleting
generated outputs, or two directories that are both bind-mounted at the same
path. The observed native-library path dependency is documented below.

```bash
git clone https://github.com/Sami-Gor/daymark.git /tmp/daymark-build
cd /tmp/daymark-build
git checkout baf83e9cacbba440e609943fdeeed22b942cfa13
git status --porcelain    # must be empty
git rev-parse HEAD        # baf83e9cacbba440e609943fdeeed22b942cfa13
```

## 4. Test signing (never production)

Create a temporary keystore outside the repository. The certificate is
self-signed; that is expected and is not suitable for Play upload.

```bash
mkdir -p /tmp/daymark-test-keystore
keytool -genkeypair -v \
  -keystore /tmp/daymark-test-keystore/daymark-test.jks \
  -storetype PKCS12 \
  -storepass daymark-test-pass -keypass daymark-test-pass \
  -alias daymark-test -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Daymark Test Build Only, OU=Reproducibility Test, O=Not For Release, L=Test, ST=Test, C=GB"
```

`artifacts/weather-app/android/keystore.properties` is gitignored and may
contain an absolute `storeFile`:

```properties
storeFile=/tmp/daymark-test-keystore/daymark-test.jks
storePassword=daymark-test-pass
keyAlias=daymark-test
keyPassword=daymark-test-pass
```

Do **not** substitute a production keystore, upload key, or Play signing key
for this workflow.

## 5. Asset/toolchain manifest

Record these before building. The fetch scripts verify most of them themselves;
the table is for the release record.

| Input | Pin | SHA-256 |
|---|---|---|
| Source commit | `baf83e9cacbba440e609943fdeeed22b942cfa13` | — |
| `pnpm-lock.yaml` | committed | `ca02d43e33030c19e74964d02f29692cae863ac5143d1843392c0d664085680f` |
| `android/kokoro-poc/rust/Cargo.lock` | committed | `d9108bd41b277bbf3c39bf1753fc8fadec0f20bdde46ca28a7b8d9c09a77813d` |
| Node | v24.22.1 | tarball `89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7` |
| pnpm | 12.3.4 | — |
| JDK | 21.0.12.1 | — |
| Gradle | 8.14.3 (wrapper) | distribution `ed1a8d686605fd7c23bdf62c7fc7add1c5b23b2bbc3721e661934ef4a4911d7c` |
| AGP | 8.13.0 | — |
| compile/target SDK | 36 | — |
| build-tools | 36.0.0 | — |
| NDK | 29.0.14206865 | — |
| Rust | 1.98.1 | target `aarch64-linux-android` |
| bundletool | 1.18.1 | `675786493983787ffa11550bdb7c0715679a44e1643f3ff980a529e9c822595c` |
| pguso/kokoro | `b42bd5cf915163607cb51984cabf273dcf09755e` | crate `kokoro-en` 0.1.5 |
| Kokoro model | `onnx/model_quantized.onnx` | `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` |
| Kokoro voice | `bm_fable.bin` | `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1` |
| sherpa-onnx | 1.13.8 AAR | `633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96` |
| Parakeet encoder | `encoder.int8.onnx` | `acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247` |
| Parakeet decoder | `decoder.int8.onnx` | `179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e` |
| Parakeet joiner | `joiner.int8.onnx` | `3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3` |
| Parakeet tokens | `tokens.txt` | `d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d` |
| Parakeet archive | `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` | `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf` |

The NDK's `libc++_shared.so` used by the Kokoro build was
`0c52cfab2df0d957d8b346a2bdc5ae8d71feca2591924d77e1cd724d5bf74352`
(9,290,184 bytes).

## 6. Build sequence

Run from the repository root. Capture a log and check every exit code; do not
continue after a failure.

```bash
set -euo pipefail

android/kokoro-poc/scripts/fetch-kokoro-assets.sh
ANDROID_NDK_HOME="$ANDROID_NDK_HOME" \
  android/kokoro-poc/scripts/build-kokoro-android.sh
android/kokoro-poc/scripts/fetch-sherpa-onnx.sh
android/kokoro-poc/scripts/fetch-parakeet-assets.sh

pnpm install --frozen-lockfile
pnpm run build
pnpm --filter @workspace/weather-app exec cap sync android

cd artifacts/weather-app/android
./gradlew --no-daemon --stacktrace :app:assembleDebug :app:bundleRelease
```

Notes:

- `fetch-kokoro-assets.sh` populates both the production `daymark-voice`
  module and the retained TWA rollback project. That is expected.
- `build-kokoro-android.sh` clones `pguso/kokoro` at the pinned commit into
  `android/kokoro-poc/.build/kokoro-src` (gitignored) and cross-compiles with
  the NDK. It requires `ANDROID_NDK_HOME`.
- The web build must run **before** `cap sync`; otherwise the copied web
  assets are stale or absent.
- `:app:assembleDebug` and `:app:bundleRelease` are deliberately in one Gradle
  invocation. Both use the same resolved classpath.
- The release build is R8-minified. `mapping.txt` is under
  `app/build/outputs/mapping/release/`.

Outputs:

```
artifacts/weather-app/android/app/build/outputs/bundle/release/app-release.aab
artifacts/weather-app/android/app/build/outputs/apk/debug/app-debug.apk
```

## 7. Verification

Use bundletool 1.18.1 and JDK 21.

### 7.1 Structure, signature, and manifest

```bash
BUNDLETOOL=/path/to/bundletool-all-1.18.1.jar
AAB=artifacts/weather-app/android/app/build/outputs/bundle/release/app-release.aab

java -jar "$BUNDLETOOL" validate --bundle="$AAB"
jarsigner -verify -verbose -certs "$AAB"
keytool -printcert -jarfile "$AAB"

java -jar "$BUNDLETOOL" dump manifest --bundle="$AAB" --module=base
java -jar "$BUNDLETOOL" dump manifest --bundle="$AAB" --module=parakeet
```

Expected for this release:

- `validate` exits 0.
- `jarsigner` exits 0 and prints `jar verified.`; a self-signed test
  certificate will produce an untrusted PKIX-chain warning, which is expected.
- Package `io.github.sami_gor.daymark`.
- `versionCode 2`, `versionName 2.0.0`.
- `minSdkVersion 24`, `targetSdkVersion 36`.
- The `parakeet` module is `dist:type="asset-pack"` with
  `<dist:install-time/>` and `dist:fusing include="true"`.
- No `android:debuggable` or `android:testOnly`.

### 7.2 Asset pack payload

```bash
for f in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
  printf '%s  ' "$f"
  unzip -p "$AAB" "parakeet/assets/parakeet/$f" | shasum -a 256
done
```

Expected hashes are the four Parakeet values in the manifest table above.
Confirm all four are present:

```bash
unzip -Z1 "$AAB" | grep '^parakeet/assets/parakeet/'
```

### 7.3 Native libraries, ABI, and native symbols

```bash
unzip -Z1 "$AAB" | grep '^base/lib/'
unzip -Z1 "$AAB" | grep 'debugsymbols'
```

At this commit the base module carries four ABIs: `arm64-v8a`,
`armeabi-v7a`, `x86`, `x86_64`. Kokoro is `arm64-v8a` only. The extra ABIs
come from the prebuilt sherpa-onnx AAR; the `daymark-voice` `abiFilters`
does not remove them at app merge time. If the release is intended to be
arm64-only, this must be fixed before relying on ABI-specific behavior.

Debug symbols are present for `libkokoro_jni.so`, `libc++_shared.so`, and
`libonnxruntime.so` (all packaged ABIs). The prebuilt `libsherpa-onnx-*`
libraries ship stripped and have no `.sym` entries.

### 7.4 No debug-only configuration

```bash
unzip -Z1 "$AAB" | grep -Ei '(^|/)(debug|v2test)(/|$)|\.map$' || true
```

`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` is the
expected release R8 mapping, not a source map. There should be no `v2test`
entries, no web source maps, and no debug APK inside the release AAB.
`base/root/DebugProbesKt.bin` is a normal kotlinx-coroutines resource.

### 7.5 Device download sizes

Create `device-spec.json`:

```json
{
  "supportedAbis": ["arm64-v8a"],
  "supportedLocales": ["en-US", "en-GB", "fr-FR", "es-ES"],
  "screenDensity": 420,
  "sdkVersion": 36,
  "deviceFeatures": []
}
```

Then:

```bash
java -jar "$BUNDLETOOL" build-apks \
  --bundle="$AAB" --output=device.apks --mode=default \
  --device-spec=device-spec.json --overwrite

java -jar "$BUNDLETOOL" get-size total \
  --apks=device.apks --device-spec=device-spec.json --human-readable-sizes
java -jar "$BUNDLETOOL" get-size total \
  --apks=device.apks --device-spec=device-spec.json --modules=base --human-readable-sizes
```

Observed for this build/profile:

- Total first-device download: `583,739,545` bytes (583.74 MB).
- Base module: `105,605,784` bytes (105.61 MB).
- Parakeet pack (total minus base): `478,133,761` bytes (478.13 MB).

`--modules=parakeet` reports the full total because the base module is always
installed with the pack. The AAB file itself is larger (~675 MB) because it
contains all ABIs and metadata; it is not the device download size.

### 7.6 Byte comparison

```bash
cmp build1.aab build2.aab && echo byte-identical || echo different
shasum -a 256 build1.aab build2.aab
```

For a path-level comparison, list each ZIP entry's SHA-256 and metadata
(size, compressed size, CRC, timestamp). A small Python `zipfile` script is
enough; do not rely on `unzip -l` alone, because it does not show content
hashes.

## 8. Observed nondeterminism and environment dependencies

1. **Absolute Rust build path.** `libkokoro_jni.so` embeds absolute paths such
   as `/private/tmp/dy-b1/android/kokoro-poc/.build/kokoro-src/src/lib.rs`.
   Two different clone paths produce different native libraries, different
   `.sym` files, and therefore different JAR signatures. A same-path rebuild
   produced the identical library hash, so the compiler/linker are otherwise
   deterministic.
2. **ZIP timestamps are not the cause.** The AAB entries are normalized to
   `1981-01-01 01:01:02`; the two AABs had zero metadata-only entry
   differences.
3. **Signing key is not the cause.** Both builds used the same test
   certificate. Signature files differ only because they sign different
   content.
4. **Gradle caches.** The tested builds shared the default `~/.gradle`
   dependency cache and the pnpm content-addressable store. For a stricter
   isolation test, set a separate `GRADLE_USER_HOME` and pnpm store per build.
   Sharing dependency caches did not introduce output differences beyond the
   native path.
5. **exFAT is unsuitable for live Gradle caches.** On the exFAT T5 volume,
   macOS created AppleDouble `._*` files and Gradle failed with:
   `File does not exist: .../.gradle/buildOutputCleanup/._buildOutputCleanup.lock`.
   Keep Gradle project caches and build directories on APFS; copy only final
   artifacts to exFAT.
6. **Network is required.** The build fetches the Kokoro source and model,
   Rust crates/ONNX Runtime, the sherpa AAR and Parakeet weights. An offline
   build must pre-seed all of them with the hashes above.
7. **Legacy wrapper mismatch.** The repository-root `android/` project is
   frozen TWA rollback material and uses Gradle 8.11.1. The production app is
   `artifacts/weather-app/android/` with Gradle 8.14.3. Use the production
   path only.
8. **ABI scope.** Four ABIs are packaged at this commit, not one. This is an
   input to size and device-support decisions, not a build failure.

## 9. Making a byte-identical build

The simplest reliable method is to build from the **same absolute path** both
times. For example, keep `/tmp/daymark-build` fixed, clean generated outputs,
and rebuild; or bind-mount two source snapshots at the same path. Verify with
`cmp` and per-entry hashes.

A path-normalization approach (for example exporting
`RUSTFLAGS="--remap-path-prefix=$PWD=/build"` before
`build-kokoro-android.sh`) may reduce the difference, but Cargo's path-based
package metadata can still affect symbol hashes and layout. Test it with two
clones and a full per-entry comparison before claiming byte identity. The
checked-in scripts do not implement or test this.

## 10. Play release notes

This workflow uses a test key and does not upload anything. A real release
still requires:

- the production upload keystore, kept outside the repository;
- the production `keystore.properties`, never committed;
- a `versionCode` increment for every upload;
- manual Play Console verification of the upload key, app-signing key,
  device targeting, and install-time asset-pack delivery;
- confirmation of the ABI scope and the Parakeet pack's actual Play download
  behavior on a physical device.
