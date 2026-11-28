# Parakeet TDT 0.6B v3 int8 inference on ORT 1.32.0

Status: **PARAKEET INFERENCE PASS — OUTPUT DIFFERENCE REQUIRES REVIEW**

## Candidate and baseline

| Item | SHA-256 | Size |
|---|---|---:
| Corrected candidate AAR | `b1e64a78cdfa822b8456474623553509c10b9c72b6c9a4c4d8a7aa333d1b2707` | 10,781,772 B |
| Candidate JNI | `5ba3137de4d12eb6d8f6c49c518d2750905c033b86b8d7314ede5ff0a6b32edd` | 4,655,408 B |
| Candidate ORT | `58dbd7588b599cf5a683a1fc18095bf791c5873c001887928ed65892bf932bb5` | 23,294,944 B |
| Baseline AAR | `8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398` | 10,213,824 B |

The corrected AAR applies Sherpa patches `0001` then `0002`; patch `0003` is test-only. No production pin, branch, version, signing or baseline AAR was changed.

Patch hashes: `0001` `fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99`; `0002` `cc75b893552d628f7209874254f5515c1a80f8edd2309e926a60158064de0c73`; `0003` `22d1ea02ed05b508e4513540c5a3f9c948ba283d528f15918ce277aae733f0c6`.

## Actual inference

- Emulator: arm64-v8a, Android API 35.
- Model: Parakeet TDT 0.6B v3 int8; all four pinned SHA-256 values verified on device.
- Audio: eight prerecorded Set B WAVs, 16 kHz mono 16-bit PCM, all hashes verified.
- Configuration: production `nemo_transducer`, CPU, 16 kHz, 80 features, 2 threads, `cjkchar`, `greedy_search`, 4 active paths, empty homophones/hotwords, zero hotword score, zero blank penalty.
- Baseline 8e1: 8/8 non-empty; result-file SHA-256 `3686cad0fe955ece9fbd5d5658dd2318f30b792346fca116ae0e0c3c25a4a91c`.
- Candidate: 8/8 non-empty; result-file SHA-256 `738c5bda62234bc3dc39cb2294e80b0187a39c7b7f2079ef4f04605b6d918f75`.
- 7/8 transcript lines are identical. One proper-noun token differs; the candidate token matches the retained reference for that clip, while the baseline token does not. No normalization was applied; exact transcript text remains in local private evidence only.
- Both runs repeated with stable result-file hashes.

## Tests

- Candidate JNI contains both required NeMo diagnostics: no-value encoder refusal and invalid decoder dimensions.
- Patch 0002 native tests: 20/20 PASS.
- Patch 0003 decoder-boundary tests: 23/23 PASS (fixtures staged; earlier fixture-missing failures were setup failures, not code failures).
- Previous 24-test joiner suite and ASan: 24/24 and 24/24 PASS for the earlier 1.32 candidate.

## Deferred

- Physical Xiaomi validation.
- Canonical 200-utterance benchmark.
- Any performance comparison (not authorised in this task).

No performance metrics are reported.