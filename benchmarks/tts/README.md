# Daymark TTS benchmark corpus

This directory contains the canonical long-utterance corpus, manifest and
host-side runner and validator for the multilingual Kokoro POC.

## Corpus

- `corpus/en/{25,100,250,500}.txt`
- `corpus/fr/{25,100,250,500}.txt`
- `corpus/es/{25,100,250,500}.txt`

The three `500.txt` fixtures are exactly 500 words under the convention below.
The shorter fixtures are complete-sentence excerpts and are approximately
25, 100 and 250 words; the manifest records their exact counts.

### Word-count convention

Unicode NFC, split on whitespace, and count tokens containing at least one
Unicode letter or digit. Punctuation-only tokens are excluded. Hyphenated forms
and contractions count as one token. Numeric and unit tokens such as `70%`
count as one raw token. The manifest records both raw and normalized counts.

## Manifest

`manifest.json` records fixture IDs, language profile, voice, word and
character counts, raw/normalized SHA-256, normalization version, G2P/PUA
versions, expected sentence count, expected segment count and date-format
context.

Regenerate it after changing corpus text or the normalizer:

```sh
node --experimental-strip-types benchmarks/tts/build-manifest.ts
```

## Benchmark run

From the repository root, stage the Kokoro model and voices once with
`android/kokoro-poc/scripts/fetch-kokoro-assets.sh`, then build the host runner:

```sh
(cd android/kokoro-poc/rust && cargo build --release --example tts_bench)
```

The example depends on the pinned `kokoro-en` checkout at
`android/kokoro-poc/.build/kokoro-src`, which is gitignored.
`android/kokoro-poc/scripts/build-kokoro-android.sh` clones that checkout at the
pinned commit before cross-compiling; the checkout must exist even for a
host-only build. The runner reads the staged app assets unless
`DAYMARK_KOKORO_MODEL` or `DAYMARK_KOKORO_VOICES` points elsewhere.

Run all languages and lengths from the repository root:

```sh
node --experimental-strip-types benchmarks/tts/run.ts
```

Results and WAV samples are written outside tracked source by default:

```text
$TMPDIR/daymark-v2.1-tts-benchmark/results/<run-id>/
```

Use `DAYMARK_TTS_RESULTS_DIR` or `DAYMARK_TTS_BENCH_BIN` to override the output
directory or binary path.

The runner validates fixture hashes/counts, normalization, segment
reconstruction, expected segment counts, unknown phonemes/PUA, audio finiteness
and final-segment completion. It records per-segment token counts, cold and
warm runs separately, time to the first generated segment, and clearly labelled
artificial-delay runs.

### What each language actually measures

The manifest selects a different synthesis path per language, so the rows are
not all the same measurement:

- English (`en-stream`) uses `KokoroTts::stream` and calls `stream.next()` per
  segment. This uses the stream API the Android engine uses for English, though
  the harness interleaves pushes and reads while the app pushes the segment plan
  before its playback loop starts reading.
- French and Spanish (`monolithic`) are still processed **segment by segment**
  inside the harness: each segment is phonemized with `piper-plus-g2p` and
  synthesized with `synth_phonemes`, then the audio is concatenated. The mode
  name means the harness does not use the stream API; it does **not** mean the
  harness makes one whole-text synthesis call. The Android app does make one
  whole-text `nativeSynth` call for these languages (see
  `docs/release/v2.1-speech-performance.md` §5), so this benchmark is not a
  timing model of the app's French/Spanish path.

### `firstAudioMs` scope

`RUN.firstAudioMs` is host generation time measured from the start of a
repetition, after the model has already initialized. The separate `INIT`
line records initialization, and the timestamp does not include model loading
or asset copying. For English it is time to the first streamed segment. For
French and Spanish it is time to the first per-segment synthesis in the
harness, not the app's whole-text first audio.

The timestamp stops when samples exist in host memory. It excludes JNI
marshalling, Android asset materialization, `AudioTrack` creation and start,
audio focus, buffer filling and device scheduling. It is therefore not a
time-to-first-audio measurement for the Android app. The French/Spanish value
is not comparable with the app's first audio even in principle, because the
benchmark synthesizes a short first segment while the app must finish the
entire utterance before it can play anything.

`summary.md` reports RTF computed from the `synthMs` and `durationSeconds`
values in `results.json`: acoustic synthesis time divided by the duration of
the generated audio. It excludes G2P, tokenization, JNI and playback. RTF below
1.0 means synthesis outpaces real time; it says nothing about when playback
starts.

The recorded benchmark is a host-only macOS CPU measurement. It is not Android
performance and does not establish human pronunciation quality.

## Pinned Kokoro chunk limit

The pinned Kokoro source defines `MAX_PHONEME_CHARS = 510` in
`android/kokoro-poc/.build/kokoro-src/src/pipeline.rs`, used by
`chunk_phonemes`. The Rust test `verifies_pinned_kokoro_chunk_boundary`
checks 510 exactly, 511 splitting into two chunks, and the no-loss sum.

The TypeScript segmentation layer has its own conservative character targets;
the benchmark reports the actual segment plan rather than assuming the same
limit.
