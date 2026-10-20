# Third-party notices

Daymark is MIT-licensed (see [LICENSE](LICENSE)). It redistributes the
third-party components listed below, each under its own licence. None of them
is relicensed by the MIT licence.

The table records what is redistributed in which build. The "V2 candidate"
column is the `v2/privacy-hardened-voice` branch, which is **not released**.

| Component | Version | Licence | Redistributed in | Notes |
|---|---|---|---|---|
| [Parakeet TDT 0.6B v3 (int8)](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) model weights | 0.6B v3, int8 | **CC BY 4.0** | V2 candidate (Android) | `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, `tokens.txt`. Fetched at build time by `android/kokoro-poc/scripts/fetch-parakeet-assets.sh` from the [sherpa-onnx release](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2), archive SHA-256 `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`. **Modified:** the published weights are quantised to int8 for on-device inference; the quantisation is Daymark's change. Attribution and licence link below. |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) runtime (Android AAR) | 1.13.8 | **Apache-2.0** | V2 candidate (Android) | Fetched at build time by `android/kokoro-poc/scripts/fetch-sherpa-onnx.sh` from the [v1.13.8 release](https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar), SHA-256 `633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96`. Contains the sherpa-onnx JNI libraries and, in turn, the ONNX Runtime libraries below. |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) (bundled in the sherpa-onnx AAR) | 1.18.1 (as shipped in the AAR) | **MIT** | V2 candidate (Android) | `libonnxruntime.so` and the sherpa JNI libraries, arm64-v8a only. |
| [pguso/kokoro](https://github.com/pguso/kokoro) runtime | `kokoro-en` 0.1.5, commit `b42bd5cf915163607cb51984cabf273dcf09755e` | Apache-2.0 | v1.0.0 and V2 candidate | `android/kokoro-poc/README.md` has the full build and licence matrix. |
| Kokoro model weights (`model_quantized.onnx`) | `kokoro-en` 0.1.5 | Apache-2.0 (upstream repository) | v1.0.0 and V2 candidate | SHA-256 `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`. |
| `bm_fable.bin` narration voice | — | Apache-2.0 (per the model repository) | v1.0.0 and V2 candidate | SHA-256 `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1`. Per-voice training-data provenance is not documented upstream; unresolved, low risk. |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) | — | GPL-3.0 | **not included** | Verified absent: the Kokoro build uses the lean configuration without bundled eSpeak. |
| [Rust](https://www.rust-lang.org/) standard library and crates (`tokio`, `jni`, `log`, `android_logger`, `bincode`, `fancy-regex`, `regex`, `futures`, `pin-project`, `ndarray`, `num2words`, `unicode-segmentation`, `miette`, `language-tokenizer`) | see `android/kokoro-poc/README.md` | MIT / Apache-2.0 | v1.0.0 and V2 candidate | Compiled into the Kokoro native library. `language-tokenizer` is WTFPL-2.0 and ships its own licence file. |
| [Fraunces](https://github.com/undercasetype/Fraunces), [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans), [DM Mono](https://github.com/googlefonts/dm-mono) | — | SIL Open Font License 1.1 | v1.0.0 and V2 candidate | Self-hosted; licence files in `artifacts/weather-app/src/fonts/LICENSE.md`. |
| [GeoNames](https://www.geonames.org/) locality dataset | — | **CC BY 4.0** | v1.0.0 and V2 candidate | `localities-v1.json`, shipped as a static asset and looked up on the device. Attribution is shown in the app's privacy pages. |
| [Open-Meteo](https://open-meteo.com/) weather, air-quality and geocoding APIs | — | CC BY 4.0 | not redistributed; queried at runtime | Attribution requested in the app. |
| [Capacitor](https://capacitorjs.com/) core, CLI and Android | 8.5.1 / 8.1.1 | MIT | v1.0.0 and V2 candidate | |
| AndroidX and Google libraries | see `artifacts/weather-app/android/variables.gradle` | Apache-2.0 | v1.0.0 and V2 candidate | |

## Attribution required by CC BY 4.0

The Parakeet model weights are redistributed under CC BY 4.0, which requires
attribution, a licence link, and an indication of changes.

> **Parakeet TDT 0.6B v3** — model weights by NVIDIA Corporation, licensed under
> the [Creative Commons Attribution 4.0 International Licence](https://creativecommons.org/licenses/by/4.0/).
> Source: <https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3>.
> **Changes:** the published weights are quantised to int8 for on-device
> inference, and are redistributed unmodified otherwise.
> Used in Daymark for on-device speech-to-text through
> [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache-2.0).

The GeoNames locality dataset is redistributed under CC BY 4.0 and is
attributed in the app's privacy pages.

## Verifying the redistributed files

The build-time fetch scripts pin and verify every downloaded artefact:

| Artefact | SHA-256 |
|---|---|
| `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` | `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf` |
| `encoder.int8.onnx` | `acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247` |
| `decoder.int8.onnx` | `179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e` |
| `joiner.int8.onnx` | `3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3` |
| `tokens.txt` | `d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d` |
| `sherpa-onnx-1.13.8.aar` | `633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96` |
| `model_quantized.onnx` (Kokoro) | `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` |
| `bm_fable.bin` | `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1` |
