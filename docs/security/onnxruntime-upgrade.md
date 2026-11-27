# ONNX Runtime upgrade assessment — 1.32.0

Status: **BLOCKED (2026-11-27)**

The planned source build of ONNX Runtime v1.32.0 could not be performed. The canonical `microsoft/onnxruntime` GitHub repository and release pages return 404; the repository disappeared on 2026-11-17. A reported release commit `fab30a46491a40f5e4c968b80e8a59acbbb91b53` is available only through downstream forks and cannot be treated as a verified official tag.

The published Maven Central 1.32.0 Android AAR is **telemetry-enabled**: 8 `Java_ai_onnxruntime_telemetry_*` exports, `OneCollector`/`mobile.events.data.microsoft.com` strings, telemetry Java classes and a telemetry provider/permission in its manifest. It must not be adopted as a privacy-preserving Daymark dependency.

Daymark's `release/v2-candidate` baseline at `8a28892…` contains ONNX Runtime 1.28.2 in Sherpa AAR `8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398`. A separate live `public/pr54…` checkout contains the newer AAR `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8`; that divergence is unresolved and no pin was changed. The prior 1.31.0 host study passed 24/24 native tests, but it is not a 1.32.0 candidate and is not physical-device validated.

1.32 requires rebuilding/relinking the Sherpa JNI against `VERS_1.32.0`; a `.so` swap from 1.28.2 will fail. No source build, candidate AAR, telemetry-clean binary, physical test or canonical 200-utterance run exists.

See `docs/release/onnxruntime-1.32.0-android-arm64-20261127/README.md`. Do not mark 1.32.0 tested or production-ready.