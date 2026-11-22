# Third-party notices

Daymark is MIT-licensed (see [LICENSE](LICENSE)). It redistributes the
third-party components listed below, each under its own licence. None of them
is relicensed by the MIT licence.

The table records what is redistributed in which build. The "V2 candidate"
column is the `v2/privacy-hardened-voice` branch, which is **not released**.

| Component | Version | Licence | Redistributed in | Notes |
|---|---|---|---|---|
| [Parakeet TDT 0.6B v3 (int8)](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) model weights | 0.6B v3, int8 | **CC BY 4.0** | V2 candidate (Android) | `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, `tokens.txt`. Fetched at build time by `android/kokoro-poc/scripts/fetch-parakeet-assets.sh` from the [sherpa-onnx release](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2), archive SHA-256 `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`. **Int8 form:** the redistributed files are the pre-quantised int8 ONNX export published in the sherpa-onnx release, not a conversion performed by Daymark; Daymark redistributes them unmodified. Attribution and licence link below. |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) runtime (Android AAR) | 1.13.8, locally rebuilt with the CVE-2026-108954 fix | **Apache-2.0** | V2 candidate (Android) | V2 candidate redistributes the locally rebuilt `sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`, **not** the upstream release AAR. Source: upstream `v1.13.8` commit `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf` plus `android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0001-joiner-width-validation.patch` (SHA-256 `fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99`). Redistributed AAR SHA-256 `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8` (10,214,077 B); `android/kokoro-poc/scripts/fetch-sherpa-onnx.sh` pins and verifies this local AAR. The upstream [v1.13.8 release AAR](https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar) (SHA-256 `633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96`) is **not redistributed**. Contains the sherpa-onnx JNI libraries and, in turn, the ONNX Runtime libraries below; see `artifacts/weather-app/android/daymark-voice/SHERPA-ONNX-PROVENANCE.md`. |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) (bundled in the sherpa-onnx AAR) | 1.28.2 (as shipped in the AAR) | **MIT** | V2 candidate (Android) | `libonnxruntime.so` and the sherpa JNI libraries, arm64-v8a only. Shipped libonnxruntime.so SHA-256 33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1 (AAR) / 7a2fb92eb67037837c3f0e428bd732fd0d05ced0546d9e740090c07573d8249a (APK after AGP strip); see artifacts/weather-app/android/daymark-voice/SHERPA-ONNX-PROVENANCE.md. |
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


## ONNX Runtime (MIT)

The ONNX Runtime libraries bundled in the sherpa-onnx Android AAR are
redistributed under the MIT licence. The required copyright and permission
notice is reproduced below in full.

~~~
MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
~~~

Source: https://github.com/microsoft/onnxruntime, file LICENSE at tag v1.28.2.
The shipped AAR does not embed a separate licence file; this repository notice
is the redistribution notice for the bundled libraries.

## Attribution required by CC BY 4.0

The Parakeet model weights are redistributed under CC BY 4.0, which requires
attribution and a licence link; an indication of changes is also required if
the redistributed weights are modified.

> **Parakeet TDT 0.6B v3** — model weights by NVIDIA Corporation, licensed under
> the [Creative Commons Attribution 4.0 International Licence](https://creativecommons.org/licenses/by/4.0/).
> Source: <https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3>.
> **Form:** the redistributed files are the pre-quantised int8 ONNX export
> published by the sherpa-onnx project; Daymark does not modify the weights.
> Used in Daymark for on-device speech-to-text through
> [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache-2.0).

The GeoNames locality dataset is redistributed under CC BY 4.0 and is
attributed in the app's privacy pages.

## Verifying the redistributed files

The build-time fetch scripts pin and verify every provisioned or downloaded artefact:

| Artefact | SHA-256 |
|---|---|
| `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` | `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf` |
| `encoder.int8.onnx` | `acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247` |
| `decoder.int8.onnx` | `179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e` |
| `joiner.int8.onnx` | `3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3` |
| `tokens.txt` | `d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d` |
| `sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar` (redistributed) | `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8` |
| `sherpa-onnx-1.13.8.aar` (upstream release; **not redistributed**) | `633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96` |
| `model_quantized.onnx` (Kokoro) | `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` |
| `bm_fable.bin` | `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1` |
