# ONNX Runtime upgrade assessment

Status: **Candidate 1.32.0 built; validation incomplete (2026-11-28)**.

The candidate `libonnxruntime.so` SHA-256 is `58dbd7588b599cf5a683a1fc18095bf791c5873c001887928ed65892bf932bb5`; the candidate Sherpa AAR SHA-256 is `b7ba157ff51267045a48293e63ce72c04a6f00e254db9e23e6d57dd5af0d2b0e`. The GitHub Actions run completed successfully, including 24/24 normal and 24/24 ASan native tests and a no-telemetry binary scan.

The 1.32.0 archive is a recovered SourceForge mirror of commit `fab30a46…`; its content matches an independent commit copy, but canonical `microsoft/onnxruntime` remains unavailable. The owner approved this mirror for the isolated experimental build.

Physical Xiaomi testing, actual Parakeet inference in this CI candidate, the canonical 200-utterance benchmark, performance comparison and device network capture remain **deferred**. The baseline production AARs were not modified and no integrity pins were changed.

See `docs/release/onnxruntime-1.32.0-android-arm64-20261128.md`.