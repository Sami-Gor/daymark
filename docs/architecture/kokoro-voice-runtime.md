# Kokoro runtime voice registration (Agent B ↔ Agent C contract)

Status: implemented on `feat/kokoro-voice-registration` (based on `3b3d591`).

## Interface

Native plugin methods on `DaymarkVoice`:

| Method | Input | Success | Errors |
|---|---|---|---|
| `getInstalledVoices()` | — | `{ voices: string[] }` | `native-unavailable` |
| `registerVoice({ voiceId })` | `bm_fable`, `ff_siwis`, `em_alex` | `{ voices: string[] }` | `invalid-voice`, `unsupported-voice`, `voice-not-installed`, `voice-corrupt`, `voice-unreadable`, `operation-conflict`, `reload-failed`, `reload-failed-unrecovered`, `engine-not-ready`, `native-unavailable` |
| `activateVoice({ voiceId })` | same | same | same |

`registerVoice` and `activateVoice` are the same guarded operation: the voice
file must already exist in `filesDir/kokoro/<voiceId>.bin`. The engine reloads
its native voice set so a newly installed file becomes usable without an app
restart.

## Contract with the pack manager (Agent C)

1. Agent C downloads, verifies (signed manifest + SHA-256) and atomically
   installs the pack payload, leaving the voice at
   `filesDir/kokoro/<voiceId>.bin`.
2. Agent C then calls `registerVoice({ voiceId })`.
3. Only after success may the app switch its selected language/voice.
4. On failure the previously working voice remains available; the UI must show
   the returned error and offer retry/removal. English is never substituted.

The runtime never downloads, never accepts URLs or arbitrary paths, and does
not trust filenames: it requires a supported voice id, a canonical path inside
`filesDir/kokoro`, a non-empty file, and a successful native reinitialisation.

## Lifecycle guarantees

- Single-flight: concurrent registrations return `operation-conflict`.
- Registration during synthesis/loading returns `operation-conflict`.
- Generation tokens: a stale callback cannot complete into a newer engine.
- On reload failure the engine re-initialises the previous default voice;
  if even that fails it reports `reload-failed-unrecovered` and enters ERROR.
- Removal: delete the file through the pack manager, then call
  `getInstalledVoices()`; an absent voice cannot be selected because
  `NarrationVoicePolicy` requires the file to exist.

## Validation added

- `VoiceRegistryTest` (7 tests): supported ids, deterministic install scan,
  traversal rejection, distinct unavailable reasons, newly-installed diff.
- `ReloadGuardTest` (4 tests): single flight, stale generation, invalidate,
  8-thread race yields one winner.

Total voice JVM suite: 155 tests (debug), release variant passing.
