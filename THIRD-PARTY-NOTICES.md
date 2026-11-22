# Third-party notices

Daymark is MIT-licensed (see [LICENSE](LICENSE)). It redistributes the
third-party components listed below, each under its own licence. None of them
is relicensed by the MIT licence.

The table records what is redistributed in which build. The "V2 candidate"
column is the current unreleased V2 candidate branch (`release/v2-candidate` at
the time of writing).

| Component | Version | Licence | Redistributed in | Notes |
|---|---|---|---|---|
| [Parakeet TDT 0.6B v3 (int8)](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) model weights | 0.6B v3, int8 | **CC BY 4.0** | V2 candidate (Android) | `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, `tokens.txt`. Fetched at build time by `android/kokoro-poc/scripts/fetch-parakeet-assets.sh` from the Daymark-controlled immutable release asset `https://github.com/Sami-Gor/daymark/releases/download/parakeet-tdt-0.6b-v3-int8-v1/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` (placeholder URL; see [the model retrieval policy](docs/release/reproducible-build-guide.md#51-parakeet-model-retrieval-policy)), archive SHA-256 `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`. The upstream release asset was replaced on 2026-11-07 with different bytes and is not used. **Int8 form:** the redistributed files are the pre-quantised int8 ONNX export published in the sherpa-onnx release, not a conversion performed by Daymark; Daymark redistributes them unmodified. Attribution and licence link below. |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) runtime (Android AAR) | 1.13.8, locally rebuilt with the CVE-2026-108954 / GHSA-f5q5-vp8g-wh4x joiner-width patch | **Apache-2.0** | V2 candidate (Android) | Modified build (change indicated per Apache-2.0): rebuilt from v1.13.8 source commit `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf` with `android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0001-joiner-width-validation.patch`. Tracked at `artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`, SHA-256 `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8`; `android/kokoro-poc/scripts/fetch-sherpa-onnx.sh` verifies it and refuses the unpatched upstream AAR. Contains the sherpa-onnx JNI libraries and, in turn, the ONNX Runtime libraries below. Provenance: `artifacts/weather-app/android/daymark-voice/SHERPA-ONNX-PROVENANCE.md`. |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) (bundled in the sherpa-onnx AAR) | 1.28.2 (as shipped in the rebuilt AAR) | **MIT** | V2 candidate (Android) | `libonnxruntime.so` (22,249,560 bytes, SHA-256 `33847ad43bffe204699fd4a27f7f3603452a8cdaf2f9a44983a0bc31ffcf2da1`) and the sherpa JNI libraries, arm64-v8a only. Runtime package: `csukuangfj/onnxruntime-libs` v1.28.2. |
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

The build-time fetch and verification scripts pin every redistributed artefact.
The upstream Parakeet model URL is a mutable release channel: it was re-uploaded
on 2026-11-07 to a different archive, so the model fetch uses the preserved
Daymark-controlled mirror (or an approved `PARAKEET_ARCHIVE_URL` override) and
succeeds only when the pinned SHA-256 below matches; otherwise it fails closed.
The pinned digest, not the URL, identifies the redistributed package:

| Artefact | SHA-256 |
|---|---|
| `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` | `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf` |
| `encoder.int8.onnx` | `acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247` |
| `decoder.int8.onnx` | `179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e` |
| `joiner.int8.onnx` | `3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3` |
| `tokens.txt` | `d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d` |
| `sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar` | `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8` |
| `model_quantized.onnx` (Kokoro) | `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` |
| `bm_fable.bin` | `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1` |
