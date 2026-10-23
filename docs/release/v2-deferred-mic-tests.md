# DEFERRED — live microphone test procedure

Status: **not executed**. Live microphone/audio testing was unavailable for the V2 release-readiness session. Do not mark these as passed until they are run on a suitable device.

Build under test: the final Play-signed V2 AAB installed through Play internal testing (preferred), or a locally built build that includes the install-time `parakeet` pack. A standalone base APK does **not** contain the model and cannot validate voice.

Record before starting: device model, Android/API level, build `versionCode`/`versionName`, signer certificate, installed track, network state, and a cleared logcat. Do not clear production app data.

| # | Scenario | Steps | Expected | Evidence |
|---|---|---|---|---|
| 1 | Granted, real speech | Grant microphone; tap **Ask Daymark**; say "will it rain today" | Transcript appears; relevant weather answer; no crash | before/after screenshots; logcat excerpt; `dumpsys audio` recording client |
| 2 | Long utterance | Say a 15–20 s weather question | Capture continues to the 30 s maximum; transcript or clear timeout copy; retry works | logcat timings; screenshots |
| 3 | Slow decode | Use a long phrase; measure native `started` → `result` | No ANR; result or "I didn't catch that" within the decode watchdog | timestamps |
| 4 | Deny once | Fresh data on a **test package**; tap Ask; choose **Don't allow** | Android denial copy; retry behaves per the permission state machine | screenshot; package permission state |
| 5 | Permanently denied | Deny twice (or set `USER_FIXED`) | Blocked copy; no system prompt storm; no automatic Settings jump | screenshot; `dumpsys package` flags |
| 6 | Revoked while installed | Grant, revoke in Settings, reopen, tap Ask | Immediate actionable guidance; no no-op capture | screenshot; logcat |
| 7 | Missing model | Test build without the `parakeet` pack | "Offline voice input is not available"; no crash | screenshot; logcat `model-missing` |
| 8 | Corrupt model | On a test build, replace one model file with a same-size corrupt file; relaunch | `model-corrupt` / unavailable; file is not loaded; next launch repairs from assets | logcat reason; file hashes before/after |
| 9 | Offline ASR | Airplane mode; repeat scenario 1 | Recognition still works on-device | screenshot; network state |
| 10 | FR narration | Locale FR; installed offline FR voice; tap **Hear today** | French narration; explicit unavailable message if no offline voice; no silent network voice | screenshot; TTS voice id; logcat |
| 11 | ES narration | Same for ES | Same | same |

Evidence rules:
- A successful transcript proves recognition; it does **not** prove zero network egress. Packet-level claims require an approved, redacted capture method.
- Record exact phrases and timings.
- Any failure must include the full crash/ANR logcat excerpt.
