#!/usr/bin/env bash
#
# Builds the Daymark Kokoro POC native library for Android arm64-v8a.
#
# Steps:
#   1. clones pguso/kokoro at the pinned commit into .build/kokoro-src (gitignored)
#   2. cross-compiles daymark-kokoro-jni for aarch64-linux-android with the NDK
#      (kokoro is built with --no-default-features, i.e. without bundled eSpeak;
#      ort's download-binaries support provides ONNX Runtime 1.23.2 for Android)
#   3. copies libkokoro_jni.so and libonnxruntime.so into the Android app
#
# Requirements: rustup with the aarch64-linux-android target, Android NDK 29.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
POC_DIR="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$POC_DIR/.." && pwd)"
RUST_DIR="$POC_DIR/rust"
BUILD_DIR="$POC_DIR/.build"
KOKORO_SRC="$BUILD_DIR/kokoro-src"
KOKORO_COMMIT="b42bd5cf915163607cb51984cabf273dcf09755e"
NDK="${ANDROID_NDK_HOME:-$HOME/.bubblewrap/android_sdk/ndk/29.0.14206865}"
TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/darwin-x86_64"

mkdir -p "$BUILD_DIR"
if [ ! -d "$KOKORO_SRC/.git" ]; then
  git clone https://github.com/pguso/kokoro.git "$KOKORO_SRC"
fi
git -C "$KOKORO_SRC" fetch --depth 1 origin "$KOKORO_COMMIT"
git -C "$KOKORO_SRC" checkout --detach "$KOKORO_COMMIT"

# Kokoro's dependency declaration keeps ort's default features, including
# download-binaries (which supports aarch64-linux-android) and copy-dylibs.
# No Cargo.toml patch is required for the Android build.

export ANDROID_NDK_HOME="$NDK"
export CC_aarch64_linux_android="$TOOLCHAIN/bin/aarch64-linux-android26-clang"
export AR_aarch64_linux_android="$TOOLCHAIN/bin/llvm-ar"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$TOOLCHAIN/bin/aarch64-linux-android26-clang"

mkdir -p "$ROOT/.cargo"
if ! grep -q "aarch64-linux-android" "$ROOT/.cargo/config.toml" 2>/dev/null; then
  cat >> "$ROOT/.cargo/config.toml" <<EOF
[target.aarch64-linux-android]
linker = "$TOOLCHAIN/bin/aarch64-linux-android26-clang"
ar = "$TOOLCHAIN/bin/llvm-ar"
EOF
fi

cd "$RUST_DIR"
env "CC_aarch64-linux-android=$TOOLCHAIN/bin/aarch64-linux-android26-clang" \
    "AR_aarch64-linux-android=$TOOLCHAIN/bin/llvm-ar" \
    cargo build --release --target aarch64-linux-android --no-default-features

RELEASE_DIR="$RUST_DIR/target/aarch64-linux-android/release"
CXX_SHARED="$TOOLCHAIN/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so"
if [ ! -f "$CXX_SHARED" ]; then
  echo "error: libc++_shared.so not found in the NDK sysroot" >&2
  exit 1
fi

copy_libs() {
  local target="$1"
  mkdir -p "$target"
  cp "$RELEASE_DIR/libdaymark_kokoro_jni.so" "$target/libkokoro_jni.so"
  # ONNX Runtime is statically linked into the cdylib; only the C++ runtime is shared.
  cp "$CXX_SHARED" "$target/libc++_shared.so"
  ls -la "$target"
}

# TWA shell (rollback point).
copy_libs "$ROOT/app/src/main/jniLibs/arm64-v8a"

# Capacitor shell: the local DaymarkVoice plugin module packages the libraries.
CAPACITOR_MODULE="$ROOT/../artifacts/weather-app/android/daymark-voice"
CAPACITOR_JNI_LIBS="$CAPACITOR_MODULE/src/main/jniLibs/arm64-v8a"
if [ ! -d "$CAPACITOR_MODULE" ]; then
  echo "error: Capacitor DaymarkVoice plugin module not found at $CAPACITOR_MODULE" >&2
  exit 1
fi
copy_libs "$CAPACITOR_JNI_LIBS"
