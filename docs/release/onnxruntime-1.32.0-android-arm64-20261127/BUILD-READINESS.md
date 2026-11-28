# Build readiness — ONNX Runtime 1.32.0 Android

Verdict: **ENVIRONMENT NOT READY**.

## Free space (measured 2026-11-27)

| Volume | Free |
|---|---|
| `/Volumes/DaymarkRuntimeBuild` (APFS sparsebundle on T5) | 3.40 GiB |
| `/System/Volumes/Data` (internal) | 3.1 GiB |
| `/Volumes/T5Backup` (exFAT host) | 3.40 GiB |
| `/Volumes/DaymarkWorkspace` | 0.95 GiB |

Both sparsebundle volumes are capped by the same nearly-full T5 host; no writable volume has adequate headroom.

## Footprint

A full CPU shared-lib-only arm64-v8a ORT build (no tests/Java/Training) is estimated at 6–10 GB, with a 15 GB planning budget. A following Sherpa JNI rebuild needs ~1.5–2 GB. **Shortfall is ~11.6 GiB against the 15 GB plan.**

## Toolchain

- Ninja: **absent**; recommended `brew install ninja` (1.13.2, ~1 MB).
- Android SDK: `/opt/homebrew/share/android-commandlinetools` and `/Users/m1/.bubblewrap/android_sdk`; platforms only 34/36. **API 29 missing**; install `platforms;android-29` (78,293,913 B).
- NDK 29.0.14206865: **present** at both SDK roots; clang 21.0.0; API29 clang driver/sysroot present.
- CMake 4.4.5 installed; ORT requires ≥3.26; CMake 4.x third-party policy risk remains.
- Python 3.9.6; ORT `build.sh` may require ≥3.10; direct CMake path would avoid the wrapper.

## Preparation gate (not executed)

1. Provide ≥16 GiB free on a safe build volume (not by deleting archives/backups).
2. Resolve source provenance approval (`fab30a46…`, SourceForge mirror).
3. Install Ninja and Android API 29; verify `clang`/sysroot and Python.
4. Configure with NDK toolchain, API29, arm64-v8a, Release, shared lib, telemetry OFF.
5. Verify ELF/SONAME/API/16 KB alignment; then rebuild Sherpa JNI against matching headers and runtime.

No build was started.