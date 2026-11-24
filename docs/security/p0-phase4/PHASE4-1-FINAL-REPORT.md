# Phase 4.1 - Final Kokoro and Speech Integration

Status: **PASS** for evaluated scope.
Date: 2026-11-24. Device: Xiaomi physical device, Android 16/API 36, arm64-v8a.

## Installed artifact

| Item | Value |
|---|---|
| APK SHA-256 | e683f0da9a0ab403cbcbe3c80bfca89e7f2f38a8021dfe4b99b60f5bdce0fde9 |
| Package / version | io.github.sami_gor.daymark.phase4validate 2.0.0 (2) |
| Sherpa JNI | 3611bbe18d282afc95bd5e4b8edf8f9f49f09d2148bf084c4878f6c390457cfb |
| ORT | 33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1 |
| Kokoro JNI | a6e3daa73b12b8030153827368e51f4b1369481eb381d10c125a7b4f7aa48574 |
| libc++ | c4c2fe5cbcb1fba0003a31fc7ab29a9bb12df6cc187ec45a806462540e83d93b |
| Kokoro source build | Hosted CI run 45475872471 |

Installed without uninstalling or clearing application data.

## Root cause and correction

The earlier APK used a Kokoro library built for a later three-argument JNI contract,
while the Phase 4 engine called the older one-argument contract. The missing voice
argument became invalid JNI local reference 0x1 and aborted in nativeStreamStart.
The correction builds libkokoro_jni.so from the exact Phase 4 Rust source and packages
it with the existing accepted sherpa JNI and ORT.

## Results

| Test | Result |
|---|---|
| Kokoro five consecutive English narrations | PASS 5/5 |
| Actual audio buffer playback | PASS |
| SIGABRT / JNI errors | PASS - zero |
| Three lifecycle narration/cancel/restart cycles | PASS 3/3 |
| Live AudioRecord frames | PASS - non-zero |
| Parakeet short utterance | PASS |
| Parakeet long utterance | PASS |
| Compound rain/wind/temperature question | PASS |
| Repeated sessions | PASS |
| Cancellation while listening | PASS 3/3 |

No formal speech accuracy certification is claimed.

## Safety

No production AAR, signing, Play, main or release changes; no merge.
