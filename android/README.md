# Legacy TWA rollback project (frozen)

This directory is the **frozen Bubblewrap/Trusted Web Activity implementation**
kept only as a rollback point for the Capacitor migration. It is not the
production Android app and must not be used for current Android work.

- Production Capacitor Android: `artifacts/weather-app/android/`
  (application module + local `daymark-voice` plugin)
- Shared Kokoro Rust/JNI source and fetch/build scripts currently live in
  `android/kokoro-poc/` for historical reasons; the scripts populate both the
  production plugin module and this rollback project.
- The TTS engine copy under `android/app/src/main/java/.../tts/` has
  intentionally diverged from production (no segmentation/streaming updates).
  **Do not edit it casually**; the production implementation lives in
  `artifacts/weather-app/android/daymark-voice/`.
- `KokoroTtsTestActivity` exists only here, as a diagnostic for the legacy
  shell; the production launch path is the Capacitor app.

The core physical-device pass for the Capacitor release is already recorded in
`docs/release/android-production-readiness.md` §18. Keep this legacy project as
rollback material until the production rollout is stable; broader device-matrix
checks are optional additional QA, not a reason to repeat the core pass. See
`docs/architecture/capacitor-migration.md` for migration and rollback details.
