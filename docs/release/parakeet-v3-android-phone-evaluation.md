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

The following covers the other engines trialled in the local Android evaluation work. It is an evidence summary, **not a single fair leaderboard**: the figures come from two separate corpora, two scoring passes and two repetition counts. Unknown or invalid results are not converted into estimates.

Results are comparable only within a corpus, and the corpus is named for each figure below:

- **Set B (prerecorded):** eight recorded WAV files, 69 reference words per phrase set, 207 reference words over a 24-run (three-pass) evaluation. Every Set B figure in this table comes from these same eight phrases. The four controlled-pilot rows carry per-run SHA-256 values that match the Set B files exactly; the earlier Vosk and Moonshine Tiny runs and both Parakeet prerecorded runs are linked to Set B by filename and reference text, and their audio files hash-match the Set B files when recomputed, but their run records do not carry per-run hashes. Two rows differ in scoring pass: most were scored with the frozen scorer, while the earlier Vosk and Moonshine Tiny reports used raw tokenisation. The raw-tokenisation denominators are 390 words for the earlier Vosk report (48 runs) and 195 words for the Moonshine Tiny report (24 runs); the frozen-scorer denominator is 207 words over 24 runs. Where both renderings exist for the same run, they are stated side by side rather than merged.
- **Live microphone:** eight live recordings, 67 reference words, used only for the paired Parakeet comparison below. Both models in that pair were run on byte-identical audio (SHA-256 verified).

The four controlled-pilot rows are directly comparable with one another as a controlled screening comparison, because corpus, repetitions and scorer are held constant. The other Set B rows share the reference phrases and repetition count but not a per-run hash record. It is not a formal accuracy ranking: the corpus is a single-speaker development set of 207 reference words, below the 500-reference-word threshold that the evaluation test manifest records as the minimum for a fine-grained ranking.

| Model / test build | Recorded outcome | Interpretation and limitation |
|---|---|---|
| **Vosk small English** | An earlier revised eight-phrase report recorded **4.62% WER (18/390 words)**. A later eight-phrase comparison recorded **4.35% WER (9/207 words)**, tying with Nemotron in that run. | Both figures describe the same model on the same eight Set B phrases, producing the same recognised output. The earlier report covers **six passes** (48 runs) scored with **raw tokenisation**; the later one covers **three passes** (24 runs) scored with the **frozen scorer**, whose normalisation expands contractions and splits *o'clock*, giving a 207-word denominator instead of 390. The error count is identical in both — **3 errors per pass** — and all 24 recognised transcripts in the later run match the corresponding transcripts in the earlier run exactly. Re-scoring the earlier 48-run file with the frozen scorer yields **18 errors over 414 words, the same 4.35%** as the later 9/207, so the two values describe one consistent measurement. The difference is therefore a change of denominator and repetition count, **not** a measured change in model behaviour, and the two values must not be read as a before/after improvement. Vosk was notably smaller and faster than Nemotron in the later comparison. The controlled work did not establish dependable live-microphone performance strongly enough to treat it as a proven end-to-end win. |
| **NVIDIA Nemotron Speech Streaming 0.6B int8** | **4.35% WER (9/207 words)** on the Set B prerecorded corpus, tied with Vosk. | Strong result on that short prerecorded set, but the substantially larger model did not beat Vosk there and was slower. A comparable verified live-microphone score is not available in the evidence recorded here. |
| **Moonshine Tiny Streaming** | An earlier report recorded **26.2% WER (51/195 words)** across eight saved WAVs over three rounds. | The recorded figure uses **raw tokenisation**; recomputed on the same recognised output with the **frozen scorer** it is **24.64% (51/207)**, which is the form directly comparable with the Moonshine Small row below. The corpus and repetition count are in fact the same as that row, so the two rows differ by model and by scoring pass, not by test set. The tested build used the Tiny model; this is not a claimed result for Moonshine Small or Medium. |
| **Moonshine Small Streaming** | In the controlled four-candidate pilot: **17.87% WER (37/207 words)**, **13/24 exact utterance runs**, **0 degenerate** and **0 empty** outputs. Eight Set B prerecorded WAVs, three runs per clip (24 runs), frozen scorer. | Same corpus, repetition count and scorer as the Vosk, Nemotron and sherpa Zipformer rows, so it is directly comparable with them. Model: `moonshine-small-streaming` (123M, MIT licence). It **missed** the ≤ 15% WER screening target used in that pilot. |
| **sherpa-onnx streaming Zipformer EN 20M** | **No trusted WER retained.** | The earlier run had unresolved model/harness configuration and endpoint-accumulation concerns. Its old score was excluded rather than used to rank the model. This checkpoint is **not** the variant scored below, and the two entries are not interchangeable. |
| **sherpa-onnx streaming Zipformer `en-2023-06-26` int8** | In the controlled four-candidate pilot: **21.74% WER (45/207 words)**, **3/24 exact utterance runs**, **0 degenerate** and **0 empty** outputs. Eight Set B prerecorded WAVs, three runs per clip (24 runs), frozen scorer. | Same corpus, repetition count and scorer as the Vosk, Nemotron and Moonshine Small rows, so it is directly comparable with them. This is the variant that was actually tested (`sherpa-onnx-streaming-zipformer-en-2023-06-26`, int8, Apache-2.0), distinct from the EN 20M entry above. It **missed** the ≤ 15% WER screening target used in that pilot. Its recorded cold-load figure is an asset-readiness sentinel rather than a full native model initialisation, so its first-decode timing includes model initialisation and is not comparable with a warm decode. |
| **Whisper Base CPU diagnostic** | **No valid WER.** The evaluated phone build stalled and triggered an Android not-responding condition after more than 60 seconds on an approximately eight-second audio clip. | The tested configuration was not usable in that run. This does not prove that every Whisper runtime or quantised build is infeasible on Android; that alternative was not established by this test. |
| **Parakeet TDT-CTC 110M int8** | After fixing a sample-rate argument bug, the prerecorded test on the Set B corpus reported **1.45% WER (3/207 words)**, **21/24 exact runs**, and **no empty outputs**. On the same eight live-microphone recordings later used for the 0.6B v3 comparison, it scored **8.96% WER (6/67 word errors)** and **2/8 exact utterances**. Prerecorded decode times for the 110M model were **1.37–1.64 s** (median about 1.38 s). Its live-microphone decode times were lower, around **1.2 seconds**, and neither figure should be confused with the slower model's live interactive latency. | The initial empty-output result was a harness bug: sample count had been passed where the sample rate was required. The corrected result replaces the invalid empty-output conclusion. The live-microphone score is the appropriate comparison with the 0.6B v3 result below. |
| **Parakeet TDT 0.6B v3 int8** | On those same eight live-microphone recordings: **5.97% WER (4/67 errors)** and **4/8 exact utterances**. On the Set B prerecorded corpus used by the controlled pilot rows: **1.45% WER (3/207 words)** and **21/24 exact runs**. The 110M model scored the same 3/207 and 21/24 on this corpus; because the two models' normalised per-clip hypotheses coincide on these eight short phrases (two of the 24 raw strings differ only by trailing punctuation), the agreement should be read as a shared difficulty with this corpus rather than as two independent confirmations. Median live decode latency was approximately **6.50 seconds** (P95 approximately **7.39 seconds**, nearest-rank over 8 runs, which equals the observed maximum). | It outperformed the 110M variant on the small live set, but decoding was materially slower. The prerecorded result is not interchangeable with the live-microphone result, and the two corpora must not be combined into one score. Within the Set B group it is directly comparable with the controlled pilot rows above, because corpus, repetitions and scorer are the same. |

### Where each figure comes from

Every figure above is re-derivable from a retained file. The scored reports are
the authority; the raw files carry the recognised text.

| Row | Scored report | Raw runs |
|---|---|---|
| Vosk small English (later) · Nemotron · Moonshine Small · sherpa Zipformer `en-2023-06-26` | `phase2-score-vosk.json`, `phase2-score-nemotron.json`, `phase2-score-moonshine.json`, `phase2-score-sherpa.json` | `phase2-raw-vosk-with-hashes.json`, `phase2-raw-nemotron-with-hashes.json`, `phase2-raw-moonshine-selected-with-hashes.json`, `phase2-raw-sherpa-with-hashes.json` |
| Vosk small English (earlier, raw tokenisation) | re-derived from the raw file with the frozen scorer | `stt-eval-results-4.json` (field `vosk_text`) |
| Moonshine Tiny (raw tokenisation) | re-derived from the raw file with the frozen scorer | `moonshine-results-1.json` |
| Parakeet TDT 0.6B v3 (prerecorded) | `parakeet-v3-phase1-score.json` | `parakeet-v3-phase1-results.json` |
| Parakeet TDT-CTC 110M (prerecorded) | `parakeet-phase1-selected-score.json` | `parakeet-phase1-selected.json` |
| Parakeet pair (live microphone) | `parakeet-v3-live-wav-score.json` · `parakeet-live-score.json` | `parakeet-v3-live-wav-results.json` · `parakeet-live-eight-20261019-153914/score-input.json` |

The Moonshine Small row is scored from the selected 24-run subset, not from the
complete device export, which also contains older in-memory runs.

### What the comparison supports

- **Best result on the paired live-microphone test:** Parakeet TDT 0.6B v3 beat Parakeet TDT-CTC 110M on word errors and exact utterances, at the cost of higher latency.
- **Best lightweight result in the controlled prerecorded pilot:** Vosk and Nemotron tied at **4.35% WER (9/207 words)**, each with 3 errors per pass, though on different clips; Vosk was the smaller and faster of the two.
- **Not rankable from the retained evidence:** the earlier sherpa Zipformer **EN 20M** run, which produced no valid score. The later `en-2023-06-26` variant was tested successfully and is scored above. Whisper Base also produced no usable score in the tested CPU configuration.
- **Moonshine's two rows are two models, not one result.** The Tiny figure was recorded with raw tokenisation and the Small figure with the frozen scorer; on the common frozen-scorer basis the pair is 24.64% and 17.87%. Both **miss** the ≤ 15% WER screening target used in that pilot.
- These are small, mostly single-speaker diagnostic sets. They help select a candidate for integration; they do not establish general accuracy, broad accent coverage, or release readiness. The Set B pilot now satisfies the same-audio, same-repetition, same-scorer requirement for a controlled screening comparison, but its 207 reference words remain below the 500-reference-word threshold the evaluation test manifest sets for a fine-grained ranking, and it is still one speaker and eight clips.

## Standalone model results

### Live microphone recordings

The same eight live microphone recordings were evaluated with both models, on byte-identical audio (SHA-256 verified). The reference set contained 67 words.

| Model | Recordings | Word errors | Word error rate (WER) | Exact utterances |
|---|---:|---:|---:|---:|
| Parakeet TDT-CTC 110M int8 | 8 | 6 / 67 | 8.96% | 2 / 8 |
| Parakeet TDT 0.6B v3 int8 | 8 | 4 / 67 | 5.97% | 4 / 8 |

On this small live-capture set, the 0.6B v3 model made fewer word errors and produced twice as many exact utterances as the 110M comparator. This is a small, task-specific evaluation, not a general accuracy guarantee.

For the 0.6B v3 model, median decode latency after recording was approximately **6.50 seconds** (P95 approximately **7.39 seconds**). This latency is material to the interactive experience and should be considered alongside the recognition improvement.

On those same recordings, the named-place subset scored **6 / 10 correct for the 0.6B v3 model** and **5 / 10 for the 110M comparator**. Both fall short of the **≥ 90% correctness on location and number/time tokens** criterion recorded in the evaluation test manifest, so neither model meets that acceptance threshold for location tokens. Individual names and example utterances are withheld for location privacy.

### Separate prerecorded corpus

On the Set B prerecorded corpus — the same eight WAV files used by the controlled pilot rows in the table above — run three times each (24 utterance runs; 207 reference words), Parakeet TDT 0.6B v3 int8 produced:

- **3 / 207 word errors**
- **1.45% WER**
- **21 / 24 exact utterance runs**

This prerecorded result is reported separately. It is not directly interchangeable with the live-microphone result, and the two corpora should not be combined into one score.

## Prerecorded audio identity

The live-microphone pairing above is the strongest audio-identity claim in this record: both models' run files carry the same eight SHA-256 values, and those values match the recordings still on disk. The prerecorded Set B corpus is linked by filename and reference text; its audio files hash-match the Set B files when recomputed, but the earlier Vosk, Moonshine Tiny and both Parakeet prerecorded run records do not carry per-run hashes, so those rows are not hash-proven in the same way as the four controlled-pilot rows.

## Integration status and packaging measurements

The Parakeet TDT 0.6B v3 int8 model is now the **production** Android
speech-to-text engine in Daymark V2, not a separate experiment. The `v2test`
build type and its unprotected test receiver are retired.

The figures above come from the standalone model harness. **They are not a
validation of the integrated application.** Every physical-device gate in
`docs/release/version-2-privacy-hardening.md` remains open, and none of them may
be closed by the standalone results.

### What was reused from the earlier experiment

| Reused | Notes |
|---|---|
| The model files and the evaluated configuration | Parakeet TDT 0.6B v3 int8, 16 kHz, 80-dimensional features, greedy decoding, CPU inference, a fresh stream per utterance. The evaluated configuration was kept unchanged. |
| The sherpa-onnx 1.13.8 runtime | Obtained from the same upstream release; the archive is byte-identical to the copy the experiment used. |
| The model and runtime checksums | Pinned in `android/kokoro-poc/scripts/fetch-parakeet-assets.sh` and `fetch-sherpa-onnx.sh`, and recorded in `THIRD-PARTY-NOTICES.md`. |

### What was changed, and why

| Shortcoming of the experiment | Change |
|---|---|
| Availability was reported unconditionally, so the control claimed to work on a device with no model | Availability now reflects whether the model is present and the recogniser could be built. The reasons are `model-missing`, `model-preparing` and `runtime-unavailable`. |
| A fixed 20-second capture window, so every request took the full window | An energy-based endpoint: the utterance ends after speech followed by a short quiet period, with a 30-second hard cap (`MAX_CAPTURE_MS` in `ParakeetSpeechRecognitionPlugin`). |
| The recogniser logged the recognised transcript | No audio or transcript is logged or written to storage; the plugin emits no recognition-payload log line. |
| A stale transcript could still reach the interface after cancellation | The session is invalidated on cancel and on lifecycle exit, and the result is only delivered for the session that is still active. |
| The recorder was not released on the error path | The recorder, the stream and the audio buffer are released on every path. |
| An exported, unprotected broadcast receiver could trigger a model load from any app | The receiver is gone. The model is loaded by the plugin itself. |
| Debug signing, `debuggable` and four-ABI packaging | The production package, the release signing configuration and the arm64-v8a ABI filter are used. |

### Packaging and delivery measurements

Measured with `bundletool` 1.18.1 on the release bundle of the V2 candidate,
for an `arm64-v8a`, `xxhdpi`, API 36 device.

| Quantity | Bytes | Play limit | Result |
|---|---:|---:|---|
| Base module download | 94,430,809 | 500 MB | **under** |
| Install-time asset pack (`parakeet`) | 478,123,852 | 1.5 GB | **under** |
| Total device download | 583,662,940 | 4 GB cumulative | **under** |

Before the model was moved into an asset pack, the base module measured
**565,211,990 – 583,702,351 bytes**, which exceeded Play's 500 MB base-module
limit by 65–84 MB. The model is therefore delivered as an **install-time** asset
pack: Google Play installs the pack together with the app, so the model is on
the device and available offline once the install has finished. An on-demand or
fast-follow pack was rejected because it would leave the model absent until the
app downloaded it, which needs a network connection and would break offline
voice input.

### Consequences

| Aspect | Effect |
|---|---|
| Installation | The download is about 557 MiB, up from about 92 MiB. Play shows users a non-blocking "large app" notice above 200 MB. |
| Storage | The model is about 640 MiB on disk in the install-time pack, and about 640 MiB again once it is materialised into the app's private storage so ONNX Runtime can memory-map it. Peak device usage is therefore roughly 1.3 GiB. |
| First-run latency | The first recognition on a device that has not yet materialised the model pays for the copy before it can start decoding. The copy is done in the background when the plugin loads, and the control reports the model as preparing until it is ready. |
| Offline availability | Unchanged: once the install has completed, recognition never needs a network connection. |
| Warm latency | Unchanged from the evaluation, because the recogniser is built once and reused. |

**The storage and first-run cost is a product decision that is not settled by
this branch.** The alternatives are to accept it, to keep the model out of the
bundle and fetch it on first use (which breaks offline voice input), or to
explore a smaller quantisation (which would be a different model and needs
re-evaluation). The measurements above are the input to that decision.

## Daymark V2 integration status

The V2 candidate now runs this model as its Android speech-to-text engine. The
plugin is `ParakeetSpeechRecognitionPlugin` in the `daymark-voice` module, and
the web layer calls it through the `ParakeetSpeechRecognition` Capacitor plugin
name.

The V2 branch's Android voice path contains no `android.speech.SpeechRecognizer`
call, no `RecognizerIntent`, and no reference to a remote speech service. That
is enforced by a test that reads the Android sources from disk
(`artifacts/weather-app/src/lib/android-voice-implementation.test.ts`), so a
generic or online recogniser cannot be reintroduced without failing the build.

Checks recorded for the integrated branch:

- TypeScript typecheck passed.
- Automated test suite: **21 files / 262 tests passed** on the integration head
  `2f1572d` (verified in the privacy-audit worktree), including the
  source-level Android voice guard. The Android JVM endpoint-detector test was
  not run in that worktree because the non-committed sherpa-onnx AAR was absent.
- The release bundle builds, is signed with the upload key, and carries the
  native debug-symbol metadata introduced by PR #43. This was recorded on the
  earlier integration build; the audit worktree did not rebuild the bundle.

**Important limitation:** a live microphone test through the integrated Daymark
V2 interface has **not** been completed. The live-microphone scores above come
from the standalone model harness, not from the Daymark screen. The accuracy
figures are a baseline for the engine, not evidence about the application, and
the named-place weakness recorded below still stands.

## Conclusion and next validation

The 0.6B v3 model was the better of the two models on the small live-microphone comparison, with a slower decode time. The prerecorded corpus result was strong but is a separate test.

The selection of the 0.6B v3 model for the V2 integration rests on the paired live-microphone comparison recorded above, in which it made fewer word errors than the 110M comparator on byte-identical recordings. No wider model-selection rationale is recorded in the retained evaluation material.

Before considering production use:

1. Complete live microphone testing through the integrated V2 Daymark UI, while keeping airplane mode on and Wi-Fi off.
2. Check the integrated voice-input path, error/cancellation handling, and network behaviour on-device. Confirm that no audio or transcript is sent off-device or logged.
3. Review the source diff and release/privacy implications. Do not infer production readiness from the standalone benchmark or known-WAV smoke test alone.
4. Re-run the final test suite against the reviewed source and keep the V2 package isolated from the production package.

No production build, production release, or Play Console change is authorised by this evaluation record.
