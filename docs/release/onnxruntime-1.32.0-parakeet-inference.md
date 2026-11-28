# Parakeet TDT 0.6B v3 int8 inference on ORT 1.32.0

Status: **PARAKEET INFERENCE PASS — ONE OUTPUT DIFFERENCE; REFERENCE AMBIGUOUS**

## Candidate and baseline

| Item | SHA-256 | Size |
|---|---|---:|
| Corrected candidate AAR | `b1e64a78cdfa822b8456474623553509c10b9c72b6c9a4c4d8a7aa333d1b2707` | 10,781,772 B |
| Candidate JNI | `5ba3137de4d12eb6d8f6c49c518d2750905c033b86b8d7314ede5ff0a6b32edd` | 4,655,408 B |
| Candidate ORT | `58dbd7588b599cf5a683a1fc18095bf791c5873c001887928ed65892bf932bb5` | 23,294,944 B |
| Baseline AAR | `8e1edb57a5ac1e779dd6b00a6267a2305e44e1ef1620095626e9c93e9497a398` | 10,213,824 B |

The corrected AAR applies Sherpa patches `0001` then `0002`; patch `0003` is test-only. No production pin, branch, version, signing or baseline AAR was changed.

Patch hashes: `0001` `fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99`; `0002` `cc75b893552d628f7209874254f5515c1a80f8edd2309e926a60158064de0c73`; `0003` `22d1ea02ed05b508e4513540c5a3f9c948ba283d528f15918ce277aae733f0c6`.

## Model and audio hashes

Model files (all verified on emulator): `encoder` `acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247`; `decoder` `179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e`; `joiner` `3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3`; `tokens` `d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d`.

Set B WAVs (16 kHz mono 16-bit PCM): `039732985963ef6be353d846c9c9b4501ba508d0f8a9b7132ef2cde766e312e6`, `4ae84023d9ca62e41fc199c09d539efb3ed3e6fa14f3aeb8f97361d1d5069bb2`, `5613ddbc1f39cf3ec1f99151eb9c808aa734fc58966b157eacad851c494e8dfb`, `faa8948076a51d82ad6c1685ae041d0c93db073412890b6b0289aeff6602f446`, `ef58019dd1cf517b0e99fdd816f0f7d6b031cfa76a33ef1b667ea42841e649bf`, `1223a48f2d912d2f60dd7126ab30a528cfab0784f72fb66af91f1a4458fda769`, `98dac8d724c1f79ed75772e2c87da8258ce1207b2fc9b286d0806484ee57c9e4`, `9a7978d5f8e9274ac9a2561d3b4bea21d5ccc42a2ed138823e6e62d7f81d4eab`.

## Actual inference

- Emulator: arm64-v8a, Android API 35.
- Model: Parakeet TDT 0.6B v3 int8; all four pinned SHA-256 values verified on emulator.
- Audio: eight prerecorded Set B WAVs, 16 kHz mono 16-bit PCM, all hashes verified.
- Configuration: production `nemo_transducer`, CPU, 16 kHz, 80 features, 2 threads, `cjkchar`, `greedy_search`, 4 active paths, empty homophones/hotwords, zero hotword score, zero blank penalty.
- Baseline 8e1: 8/8 non-empty; result-file SHA-256 `3686cad0fe955ece9fbd5d5658dd2318f30b792346fca116ae0e0c3c25a4a91c`.
- Candidate: 8/8 non-empty; result-file SHA-256 `738c5bda62234bc3dc39cb2294e80b0187a39c7b7f2079ef4f04605b6d918f75`.
- Seven of eight transcript lines are identical. One proper-noun token differs.
- Both runs repeated with stable result-file hashes.

## Disputed transcript reference

- Clip: `parakeet-sentence-03-attempt-03.wav`.
- WAV SHA-256: `5613ddbc1f39cf3ec1f99151eb9c808aa734fc58966b157eacad851c494e8dfb`.
- The retained gold reference and prior raw hypothesis disagree for the disputed word.
- The candidate matches the prior raw hypothesis, not the retained gold reference.
- The baseline matches neither.
- No external authority or attestation for the retained gold reference was found.

**Conclusion: REFERENCE AMBIGUOUS.** The available evidence does not establish which disputed word is correct. No normalisation or transcript correction was applied. Exact transcript text remains in local private evidence only.

## Native validation

### Combined production patches 0001 + 0002

Runner: `android/kokoro-poc/sherpa-onnx-cve-2026-108954/tests/run-f1-f5-native-tests.sh`.

- PR source head tested: `b1a7b4030a086a401499b9414ff39bb227a55968`.
- Sherpa source commit: `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf`.
- Patch 0001 SHA-256: `fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99`.
- Patch 0002 SHA-256: `cc75b893552d628f7209874254f5515c1a80f8edd2309e926a60158064de0c73`.
- Build jobs: 2.
- Normal build: joiner-width 24/24; NeMo encoder-output 20/20.
- AddressSanitizer build: joiner-width 24/24; NeMo encoder-output 20/20.
- All four test-suite exit codes: 0.
- Total: 88/88 expected passes; no AddressSanitizer report.

Logs: `/Volumes/DaymarkRuntimeBuild/nondevice-evidence/onnxruntime-1.32.0-nondevice-20261128/f1-f5/`.

Consolidated local report: `/Volumes/DaymarkRuntimeBuild/nondevice-evidence/onnxruntime-1.32.0-nondevice-20261128/FINAL-REPORT.md`.

Report SHA-256: `77b3a3d23c82651a614309c068e232c580e305d12b5c29ae02660e8d594aa326`.

### Separate decoder-boundary tests

Patch `0003` NeMo decoder-boundary tests: 23/23 PASS after staging the pinned fixtures. This is a separate test suite and is not included in the 88/88 combined normal/ASan count above.

Candidate JNI contains both required NeMo diagnostics: no-value encoder refusal and invalid NeMo decoder dimensions.

## Outstanding validation

- Physical Xiaomi installation and microphone validation: outstanding.
- Device-level privacy/network egress capture: outstanding.
- Canonical 200-utterance benchmark: **BLOCKED — CANONICAL INPUTS INCOMPLETE**. The recovered 200-ID proposal has no audio files or reference transcripts; there is no approved canonical manifest/threshold or signed-off result. Scorer code alone is insufficient. The eight Set B WAVs were not substituted.
- Performance comparisons: not performed; no performance metrics are reported.

No production AAR, integrity pin, version, signing configuration, release branch/tag or Google Play setting was changed.
