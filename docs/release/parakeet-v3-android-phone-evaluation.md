# Parakeet TDT 0.6B v3 — Android phone evaluation

**Status:** Evaluation evidence only. This document does not approve a production release.

This record summarises the phone-side speech-recognition evaluation and the current local V2 integration smoke test. The standalone-model benchmarks and the Daymark V2 integration test are separate test stages; their results must not be combined.

## Privacy handling of test material

Specific place names, verbatim spoken prompts, recognised transcripts, audio recordings, screenshots containing transcripts, and device serial numbers are deliberately excluded from this public report. A named-place subset score is shown only as an aggregate.

## Test environment

- Device: Nothing A059P
- Android: 16 (API 36), arm64-v8a
- Network condition during the offline phone checks: Airplane mode on; Wi-Fi off
- Selected model: Parakeet TDT 0.6B v3, int8
- Runtime/configuration: sherpa-onnx offline transducer on CPU; 16 kHz audio, 80-dimensional features, greedy decoding, and a fresh recognition stream per utterance
- Upstream model package: [sherpa-onnx Parakeet TDT 0.6B v3 int8 release archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2)

## Standalone model results

### Live microphone recordings

The same eight live microphone recordings were evaluated with both models. The reference set contained 67 words.

| Model | Recordings | Word errors | Word error rate (WER) | Exact utterances |
|---|---:|---:|---:|---:|
| Parakeet TDT-CTC 110M int8 | 8 | 6 / 67 | 8.96% | 2 / 8 |
| Parakeet TDT 0.6B v3 int8 | 8 | 4 / 67 | 5.97% | 4 / 8 |

On this small live-capture set, the 0.6B v3 model made fewer word errors and produced twice as many exact utterances as the 110M comparator. This is a small, task-specific evaluation, not a general accuracy guarantee.

For the 0.6B v3 model, median decode latency after recording was approximately **6.50 seconds** (P95 approximately **7.39 seconds**). This latency is material to the interactive experience and should be considered alongside the recognition improvement.

The named-place subset of the live recordings scored **5 / 10 correct**. Individual names and example utterances are withheld for location privacy.

### Separate prerecorded corpus

On a separate prerecorded set of eight WAV files, run three times each (24 utterance runs; 207 reference words), Parakeet TDT 0.6B v3 int8 produced:

- **3 / 207 word errors**
- **1.45% WER**
- **21 / 24 exact utterance runs**

This prerecorded result is reported separately. It is not directly interchangeable with the live-microphone result, and the two corpora should not be combined into one score.

## Daymark V2 integration status

A local V2-only test build was created with package ID `io.github.sami_gor.daymark.v2test`. The Parakeet model/runtime integration is isolated to the V2 test source set; the production package was not modified or replaced by this test installation.

Reported local checks:

- TypeScript typecheck passed.
- Automated test suite: **249 / 249 passed**.
- A known-WAV smoke test returned the expected transcript.
- A local test APK was built (approximately 934 MB); the APK and model binaries are not included in this documentation commit.

**Important limitation:** a live microphone test through the integrated Daymark V2 interface has not yet been completed. The live-microphone scores above come from the standalone model evaluation, not from the integrated Daymark V2 screen.

The active V2 voice-input path uses the local Parakeet plugin and has no cloud-ASR fallback configured. However, the shared voice dependency still contains an unused legacy Android `SpeechRecognizer` class visible to static APK scans, and the app retains its general `INTERNET` permission for existing weather/WebView features. These facts mean that the test does **not** establish that the entire app has no network access. Keep voice-path runtime/network verification as a separate privacy gate.

## Conclusion and next validation

The 0.6B v3 model was the better of the two models on the small live-microphone comparison, with a slower decode time. The prerecorded corpus result was strong but is a separate test.

Before considering production use:

1. Complete live microphone testing through the integrated V2 Daymark UI, while keeping airplane mode on and Wi-Fi off.
2. Check the integrated voice-input path, error/cancellation handling, and network behaviour on-device. Confirm that no audio or transcript is sent off-device or logged.
3. Review the source diff and release/privacy implications. Do not infer production readiness from the standalone benchmark or known-WAV smoke test alone.
4. Re-run the final test suite against the reviewed source and keep the V2 package isolated from the production package.

No production build, production release, or Play Console change is authorised by this evaluation record.
