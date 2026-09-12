# Kokoro Local TTS POC (native Android only)

Status: **proof of concept**. This is a separate native test screen for
[pguso/kokoro](https://github.com/pguso/kokoro). It does not touch the Daymark
TWA, the React app, the production Web Speech narration, or the Sherpa POC
(which lives on `poc/local-tts`).

Launch it manually:

```bash
adb shell am start -n io.github.sami_gor.daymark/.KokoroTtsTestActivity
adb logcat -s DaymarkKokoroTts
```

## Pinned versions

| Component | Version |
|---|---|
| pguso/kokoro (`kokoro-en`) | commit `b42bd5cf915163607cb51984cabf273dcf09755e`, crate 0.1.5 (Rust edition 2024) |
| `ort` crate | 2.0.0-rc.13 (resolved from the crate's `2.0.0-rc.11` caret) |
| ONNX Runtime | 1.28.2 for `aarch64-linux-android`, statically linked by `ort-sys` |
| Rust | 1.98.1 (`aarch64-linux-android` target) |
| Android NDK | 29.0.14206865 (clang `aarch64-linux-android26`) |
| Model | `onnx/model_quantized.onnx`, sha256 `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` (92,361,116 B) |
| Voice | `bm_fable.bin`, sha256 `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1` (522,240 B) |

British male voices available in the official collection (all 522,240 B):
`bm_daniel`, `bm_fable`, `bm_george`, `bm_lewis`. **bm_fable** is the selected
narration voice; `bm_george` was the initial pick and is no longer bundled.

## Build

```bash
# 1. assets (build-time download only; the app never downloads)
android/kokoro-poc/scripts/fetch-kokoro-assets.sh

# 2. native library (clones the pinned crate into .build/, cross-compiles with the NDK)
ANDROID_NDK_HOME=$HOME/.bubblewrap/android_sdk/ndk/29.0.14206865 \
  android/kokoro-poc/scripts/build-kokoro-android.sh

# 3. Android app
cd android && ./gradlew :app:assembleDebug   # or :app:assembleRelease
```

`android/kokoro-poc/.build/`, `android/.cargo/`, the fetched assets and the
generated `jniLibs/` are gitignored; the scripts reproduce them.

## G2P path (no eSpeak)

Kokoro is built with `--no-default-features --features misaki-lean`, so the
`g2p-espeak` feature is off. `misaki-rs 0.3.0` is built with
`default-features = false` (its `espeak` feature is not enabled) and embeds the
US/GB gold+silver lexicons, the POS tagger data and the OOV table via
`include_str!`; `cmudict-fast` (MIT/Apache-2.0) is compiled in. Verified:
**zero `espeak` entries** in `Cargo.lock` and in the `cargo tree` for
`aarch64-linux-android`. No eSpeak binaries or data are bundled.

## JNI / FFI architecture

```
KokoroTtsTestActivity (native UI)
  -> KokoroLocalTtsEngine  (implements LocalTtsEngine: initialize/speak/stop/isSpeaking/shutdown)
       -> System.loadLibrary("kokoro_jni")
       -> nativeInit(modelPath, voicePath, "bm_fable") -> error string | null
       -> nativeSynth(text) -> float[24000 Hz mono PCM]  (fallback path)
       -> nativeStreamStart(text) -> error string | null  (sentence streaming)
       -> nativeStreamNext() -> next sentence float[] | null when finished
       -> nativeStreamClear()
       -> nativeRelease()
            Rust cdylib (android/kokoro-poc/rust, jni + tokio)
              -> pguso/kokoro KokoroTts::new / synth
              -> ONNX Runtime (static)
       -> AudioTrack (PCM16, 24 kHz, mono)
```

On first initialization the model and voice are copied from APK assets into
`filesDir/kokoro/` (Kokoro loads from files); later launches skip the copy.

## Emulator results (Android 16 / API 36, Pixel 7 AVD, arm64-v8a)

*Emulator-only numbers; they are not a substitute for real-device testing.*

| Measurement | Value |
|---|---|
| Initialization | **READY**, 3874 ms model load (+2087 ms first-run asset copy) |
| First synthesis | generation 3466 ms, 102,600 samples, 4,275 ms audio, first buffer 5,271 ms after tap |
| Second synthesis | audio 4,275 ms, first buffer 4,758 ms after tap |
| Stop during playback | state `STOPPED`, playback finished `stopped=true` |
| Offline (airplane mode, force-stop, relaunch) | READY + synthesis succeeded, 4,386 ms first buffer |
| Memory before init | heapUsedKb 2,988 / PSS 37,711 kB |
| Memory after init | heapUsedKb 4,036 / PSS 218,417 kB |
| Memory during synthesis | heapUsedKb ~3,000–4,300 / PSS ~455–559 MB (see streaming pass below) |
| Memory after playback | heapUsedKb ~3,100–4,400 / PSS ~456–559 MB |

The activity never crashed; the AudioTrack playback path completed. Subjective
voice quality cannot be judged from logs and needs a physical device.

## Streaming performance pass

Synthesis now streams sentence-by-sentence through `KokoroTts::stream()` and
each chunk is written to a single AudioTrack as it arrives; `nativeSynth`
remains as a fallback when streaming cannot start. The release profile adds
`panic = "abort"` and `codegen-units = 1` on top of the existing `lto`/`strip`.

*Emulator-only numbers (API 36 arm64, warm engine); they are not device
performance. The latency/PSS table was measured with `bm_george`; the bundled
voice was later switched to `bm_fable` (same 522,240 B, no architecture
change).*

| Measurement | Monolithic (before) | Streaming (after) |
|---|---|---|
| First audio after tap | 3,377–4,839 ms | 1,524–1,728 ms release; 1,364–1,534 ms debug |
| Steady-state PSS | ~559 MB | ~502 MB debug; ~474 MB release |
| `libkokoro_jni.so` | 61,188,576 B | 60,881,072 B |
| Release APK | 164,402,301 B | 164,094,790 B |
| Release AAB | 84,137,751 B | 84,013,485 B |

Memory growth is an ONNX Runtime arena warm-up: +265 MB on the first
synthesis, +77 MB on the second, then flat (±0.1 MB) across later runs; there
is no per-synthesis leak. Session and voice are reused for every synthesis.

Sentence-level streaming adds a short pause per sentence (total audio for the
two-sentence test text grew 4,275 ms to 5,250 ms). Chunk 2 is generated while
chunk 1 plays, but with a very short first sentence ("Good morning.") a
~0.9–1.2 s inter-sentence pause remains audible. Sentence merging is future
work, not part of this pass.

## Sizes

| Artifact | Size |
|---|---|
| Model | 92,361,116 B |
| Voice | 522,240 B |
| `libkokoro_jni.so` (Rust + static ONNX Runtime) | 60,881,072 B |
| `libc++_shared.so` (NDK runtime) | 9,290,184 B |
| Debug APK | 168,119,774 B |
| Release APK | 164,094,790 B |
| Release AAB | 84,013,485 B |
| Daymark baseline AAB (main, TWA only) | 1,180,563 B |
| AAB increase | **+82,832,922 B (~79.0 MiB)** |

## Licensing matrix

| Component | License | Redistributed | Notes |
|---|---|---|---|
| pguso/kokoro (`kokoro-en` 0.1.5) | Apache-2.0 | Yes (compiled) | Attribution required |
| Kokoro model weights (`model_quantized.onnx`) | Apache-2.0 | Yes (asset) | hexgrad/onnx-community release; verify upstream card |
| `bm_fable.bin` voice | Apache-2.0 (per model repo) | Yes (asset) | Per-voice training-data provenance is not documented upstream — review |
| ONNX Runtime 1.28.2 (static) | MIT | Yes (linked) | Downloaded by `ort-sys` at build time |
| `ort` / `ort-sys` | MIT OR Apache-2.0 | Yes (compiled) | |
| tokio, log, android_logger, jni, bincode, fancy-regex, regex, futures, pin-project, ndarray, num2words, unicode-segmentation | MIT / Apache-2.0 | Yes (compiled) | Permissive |
| misaki-rs 0.3.0 | MIT | Yes (compiled) | Lexicons/tagger embedded; no eSpeak |
| cmudict-fast 0.8.0 | MIT/Apache-2.0 | Yes (compiled) | CMUdict-derived data |
| waken_snowball 0.1.0 | BSD-3-Clause | Yes (compiled) | |
| `language-tokenizer` 0.1.0 | **no license field in its manifest** | Yes (compiled) | **Requires legal review** |
| espeak-ng | GPL-3.0 | **No** | Excluded by `--no-default-features`; verified absent |

No claim of commercial safety is made; the unpinned `language-tokenizer`
license and the per-voice provenance question need review.

## Comparison with the Sherpa POC (`poc/local-tts`)

| | Sherpa POC | Kokoro POC |
|---|---|---|
| Voice | Piper `en_GB-northern_english_male-medium` | Kokoro `bm_fable` |
| Runtime | sherpa-onnx (Apache-2.0) | pguso/kokoro (Apache-2.0) + ONNX Runtime (MIT) |
| G2P | Piper/espeak-ng data | Misaki + embedded GB lexicons, **no eSpeak** |
| Initialization on this emulator | **Aborted** (`FORTIFY: pthread_mutex_lock called on a destroyed mutex`) on API 35 and 36, both AAR variants | **READY**, repeats cleanly |
| AAB increase | ~+101 MB (static-link build) | ~+79.1 MB |
| Licensing concerns | GPL-3.0 `espeak-ng-data`, CC-BY-SA voice dataset | `language-tokenizer` lacks a license; per-voice provenance |
| Model quality expectation | Piper medium, robust G2P for OOV words | Kokoro-82M int8; natural prosody, but no eSpeak fallback for unusual words |

## Limitations

- Measurements are emulator-only; latency on real phones is expected to be
  substantially lower.
- PSS warms up over the first two syntheses (ONNX Runtime arena growth) and
  then plateaus; see the streaming pass section.
- The non-eSpeak G2P path depends on the embedded Misaki/CMUdict lexicons;
  pronunciation of unusual names/abbreviations should be reviewed on a device.
- Subjective voice quality was not evaluated (no audible inspection).
