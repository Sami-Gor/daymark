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

## Broader model evaluation overview

The following covers the other engines trialled in the local Android evaluation work. It is an evidence summary, **not a single fair leaderboard**: some figures come from different phrase sets, repetitions, harness versions and scoring passes. Only the Parakeet live-microphone comparison below used the same eight recordings for both models in that pair. Unknown or invalid results are not converted into estimates.

| Model / test build | Recorded outcome | Interpretation and limitation |
|---|---|---|
| **Vosk small English** | An earlier revised eight-phrase report recorded **4.62% WER (18/390 words)**. A later eight-phrase comparison recorded **4.35% WER**, tying with Nemotron in that run. | The two figures are retained separately because the reports refer to different/revised evaluation passes; they should not be presented as one definitive score. Vosk was notably smaller and faster than Nemotron in the later comparison. The controlled work did not establish dependable live-microphone performance strongly enough to treat it as a proven end-to-end win. |
| **NVIDIA Nemotron Speech Streaming 0.6B int8** | **4.35% WER** on the later eight-phrase prerecorded comparison, tied with Vosk. | Strong result on that short prerecorded set, but the substantially larger model did not beat Vosk there and was slower. A comparable verified live-microphone score is not available in the evidence recorded here. |
| **Moonshine Tiny Streaming** | An earlier report recorded **26.2% WER (51/195 words)** across eight saved WAVs over three rounds. | This was a preliminary result with different repetitions and scoring provenance from the later comparisons. Do not read it as a controlled head-to-head against the models scored on other corpora. The tested build used the Tiny model; this is not a claimed result for Moonshine Small or Medium. |
| **sherpa-onnx streaming Zipformer EN 20M** | **No trusted WER retained.** | The earlier run had unresolved model/harness configuration and endpoint-accumulation concerns. Its old score was excluded rather than used to rank the model. |
| **Whisper Base CPU diagnostic** | **No valid WER.** The evaluated phone build stalled and triggered an Android not-responding condition after more than 60 seconds on an approximately eight-second audio clip. | The tested configuration was not usable in that run. This does not prove that every Whisper runtime or quantised build is infeasible on Android; that alternative was not established by this test. |
| **Parakeet TDT-CTC 110M int8** | After fixing a sample-rate argument bug, the prerecorded test reported **1.45% WER**, **21/24 exact runs**, and **no empty outputs**. On the same eight live-microphone recordings later used for the 0.6B v3 comparison, it scored **8.96% WER (6/67 word errors)** and **2/8 exact utterances**. Diagnostic decode times were reported around **1.3–1.7 seconds**; these should not be confused with the slower model's live interactive latency. | The initial empty-output result was a harness bug: sample count had been passed where the sample rate was required. The corrected result replaces the invalid empty-output conclusion. The live-microphone score is the appropriate comparison with the 0.6B v3 result below. |
| **Parakeet TDT 0.6B v3 int8** | On those same eight live-microphone recordings: **5.97% WER (4/67 errors)** and **4/8 exact utterances**. On a separate prerecorded set: **1.45% WER** and **21/24 exact runs**. Median live decode latency was approximately **6.50 seconds** (P95 approximately **7.39 seconds**). | It outperformed the 110M variant on the small live set, but decoding was materially slower. The separate prerecorded result must not be used as if it were the same experiment as the live test or the earlier models' scores. |

### What the comparison supports

- **Best result on the paired live-microphone test:** Parakeet TDT 0.6B v3 beat Parakeet TDT-CTC 110M on word errors and exact utterances, at the cost of higher latency.
- **Best lightweight result in the later prerecorded comparison:** Vosk matched Nemotron's reported WER while being smaller and faster.
- **Not rankable from the retained evidence:** the earlier sherpa Zipformer run. Whisper Base also produced no usable score in the tested CPU configuration.
- **Moonshine's earlier WER is a warning signal, not a final ranking.** Its repetitions, corpus and scoring pass differ from the later comparisons.
- These are small, mostly single-speaker diagnostic sets. They help select a candidate for integration; they do not establish general accuracy, broad accent coverage, or release readiness. A reproducible same-audio scoring pass with a frozen scorer would be needed for a formal cross-model ranking.

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
