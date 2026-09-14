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

Rollback material is intentionally retained until the Capacitor release has
completed device validation and a stable Play rollout. See
`docs/architecture/capacitor-migration.md` for the migration and rollback
details.
