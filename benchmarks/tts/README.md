# Daymark TTS benchmark corpus

This directory contains the canonical long-utterance corpus, manifest and
host-side runner/scorer for the multilingual Kokoro POC.

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

Build the host runner once:

```sh
cd android/kokoro-poc/rust
cargo build --release --example tts_bench
```

Run all languages and lengths:

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
reconstruction, expected segment counts, per-segment tokenization, unknown
phonemes/PUA, audio finiteness and final-segment completion. It records cold
and warm runs separately, plus clearly labelled artificial-delay runs.

The benchmark is host-only macOS CPU measurement. It is not Android
performance and does not establish human pronunciation quality.

## Pinned Kokoro chunk limit

The pinned Kokoro source defines `MAX_PHONEME_CHARS = 510` in
`android/kokoro-poc/.build/kokoro-src/src/pipeline.rs`, used by
`chunk_phonemes`. The Rust test `verifies_pinned_kokoro_chunk_boundary`
checks 510 exactly, 511 splitting into two chunks, and the no-loss sum.

The TypeScript segmentation layer has its own conservative character targets;
the benchmark reports the actual segment plan rather than assuming the same
limit.
