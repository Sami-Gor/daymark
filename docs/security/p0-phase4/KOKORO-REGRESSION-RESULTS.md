# Kokoro Regression Results

Installed APK: e683f0da9a0ab403cbcbe3c80bfca89e7f2f38a8021dfe4b99b60f5bdce0fde9
Kokoro JNI: a6e3daa73b12b8030153827368e51f4b1369481eb381d10c125a7b4f7aa48574
Hosted source build: 45475872471 - success.

| Test | Result |
|---|---|
| Five consecutive English narration cycles | PASS 5/5 |
| Audio buffer written / playback | PASS every cycle |
| SIGABRT | PASS - zero |
| JNI DETECTED ERROR | PASS - zero |
| Process alive after narration | PASS |
| Lifecycle start/cancel/restart | PASS 3/3 |
| Narration after lifecycle cycles | PASS |
| Sherpa JNI preserved | PASS - 3611bbe1... |
| ORT preserved | PASS - 33847ad4... |

The previous ABI mismatch (P4-DEV-02) is CLOSED. Raw device logs remain in the
T5 workstream evidence directory and are not published.
