# Third-party notices

Daymark is MIT-licensed (see [LICENSE](LICENSE)). It redistributes the
third-party components listed below, each under its own licence. None of them
is relicensed by the MIT licence.

The table records what is redistributed in which build. The "V2 candidate"
column is the `v2/privacy-hardened-voice` branch, which is **not released**.

| Component | Version | Licence | Redistributed in | Notes |
|---|---|---|---|---|
| [Parakeet TDT 0.6B v3 (int8)](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) model weights | 0.6B v3, int8 | **CC BY 4.0** | V2 candidate (Android) | `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, `tokens.txt`. Fetched at build time by `android/kokoro-poc/scripts/fetch-parakeet-assets.sh` from the [sherpa-onnx release](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2), archive SHA-256 `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`. **Int8 form:** the redistributed files are the pre-quantised int8 ONNX export published in the sherpa-onnx release, not a conversion performed by Daymark; Daymark redistributes them unmodified. Attribution and licence link below. |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) runtime (Android AAR) | 1.13.8 | **Apache-2.0** | V2 candidate (Android) | Fetched at build time by `android/kokoro-poc/scripts/fetch-sherpa-onnx.sh` from the [v1.13.8 release](https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar), SHA-256 `633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96`. Contains the sherpa-onnx JNI libraries and, in turn, the ONNX Runtime libraries below. |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) (bundled in the sherpa-onnx AAR) | 1.18.1 (as shipped in the AAR) | **MIT** | V2 candidate (Android) | `libonnxruntime.so` and the sherpa JNI libraries, arm64-v8a only. |
| [pguso/kokoro](https://github.com/pguso/kokoro) runtime | `kokoro-en` 0.1.5, commit `b42bd5cf915163607cb51984cabf273dcf09755e` | Apache-2.0 | v1.0.0 and V2 candidate | `android/kokoro-poc/README.md` has the full build and licence matrix. |
| Kokoro model weights (`model_quantized.onnx`) | `kokoro-en` 0.1.5 | Apache-2.0 (upstream repository) | v1.0.0 and V2 candidate | SHA-256 `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`. |
| `bm_fable.bin` narration voice | — | Apache-2.0 (per the model repository) | v1.0.0 and V2 candidate | SHA-256 `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1`. Per-voice training-data provenance is not documented upstream; unresolved, low risk. |
| `ff_siwis.bin` French narration voice | — | **CC BY 4.0** via the SIWIS corpus | multilingual Android POC | SHA-256 `a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861`. Derived from the [SIWIS corpus](https://datashare.ed.ac.uk/handle/10283/2353); attribution is required. Attribution text is included below. |
| `em_alex.bin` Spanish narration voice | — | **Unresolved** | multilingual Android POC | SHA-256 `27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95`. Upstream documents the voice but not a clear training-data provenance/redistribution basis. **Distribution blocker; not cleared.** |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) | — | GPL-3.0 | **not included** | Verified absent: the Kokoro build uses the lean configuration without bundled eSpeak. |
| [Rust](https://www.rust-lang.org/) standard library and crates (`tokio`, `jni`, `log`, `android_logger`, `bincode`, `fancy-regex`, `regex`, `futures`, `pin-project`, `ndarray`, `num2words`, `unicode-segmentation`, `miette`, `language-tokenizer`, `quick-xml`) | see `android/kokoro-poc/README.md` | MIT / Apache-2.0 | multilingual Android POC | Compiled into the Kokoro native library. `language-tokenizer` is WTFPL-2.0 and ships its own licence file. |
| [piper-plus-g2p](https://github.com/ayutaz/piper-plus) | 0.5.3, commit `751e5dfe3fac760ac1993083b93ad34d057ae80d` | **MIT** | multilingual Android POC | French and Latin American Spanish G2P; no eSpeak, no model. The published crate does not contain a standalone `LICENSE` file; the exact upstream MIT text is reproduced below. |
| [quick-xml](https://github.com/tafia/quick-xml) | 0.41.0 | **MIT** | multilingual Android POC | Direct `piper-plus-g2p` dependency; exact MIT text reproduced below. |
| [jpreprocess](https://github.com/jpreprocess/jpreprocess) | 0.9.1 | **BSD-3-Clause** | not enabled | Optional Japanese-only dependency; the previous notice incorrectly said MIT. Exact BSD-3-Clause terms reproduced below. Not compiled in the French/Spanish build. |
| [Fraunces](https://github.com/undercasetype/Fraunces), [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans), [DM Mono](https://github.com/googlefonts/dm-mono) | — | SIL Open Font License 1.1 | v1.0.0 and V2 candidate | Self-hosted; licence files in `artifacts/weather-app/src/fonts/LICENSE.md`. |
| [GeoNames](https://www.geonames.org/) locality dataset | — | **CC BY 4.0** | v1.0.0 and V2 candidate | `localities-v1.json`, shipped as a static asset and looked up on the device. Attribution is shown in the app's privacy pages. |
| [Open-Meteo](https://open-meteo.com/) weather, air-quality and geocoding APIs | — | CC BY 4.0 | not redistributed; queried at runtime | Attribution requested in the app. |
| [Capacitor](https://capacitorjs.com/) core, CLI and Android | 8.5.1 / 8.1.1 | MIT | v1.0.0 and V2 candidate | |
| AndroidX and Google libraries | see `artifacts/weather-app/android/variables.gradle` | Apache-2.0 | v1.0.0 and V2 candidate | |

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

## Voice attribution

### `ff_siwis` (French)

`ff_siwis.bin` is the French voice style derived from the **SIWIS** corpus.

> Voice style: **ff_siwis**. Source corpus: **SIWIS**, [University of Edinburgh
> DataShare record 10283/2353](https://datashare.ed.ac.uk/handle/10283/2353),
> licensed under the [Creative Commons Attribution 4.0 International
> licence](https://creativecommons.org/licenses/by/4.0/). Daymark redistributes
> the voice style file published in the Kokoro model repository; no claim is
> made that the upstream voice or corpus has been modified.

### `em_alex` (Spanish)

`em_alex.bin` is the Spanish voice style published in the Kokoro model
repository. Its upstream training-data provenance and redistribution basis are
**not clearly documented**. It remains a **distribution blocker** for the
multilingual Android build and is not cleared by this POC.

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


## Exact third-party licence texts

### piper-plus-g2p — MIT

```text
MIT License

Copyright (c) 2022 Michael Hansen
Copyright (c) 2025 ayutaz

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
```

### quick-xml — MIT

```text
The MIT License (MIT)

Copyright (c) 2016 Johann Tuffe

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:


The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.


THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### jpreprocess — BSD-3-Clause

```text
BSD 3-Clause License

Copyright (c) 2008-2016 Nagoya Institute of Technology Department of Computer Science
Copyright (c) 2019 by the project authors

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
