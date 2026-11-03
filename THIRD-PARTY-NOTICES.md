# Third-party notices

Daymark is MIT-licensed (see [LICENSE](LICENSE)). It redistributes the
third-party components listed below, each under its own licence. None of them
is relicensed by the MIT licence.

The table records what is redistributed in which build. "V2 Android builds"
means the Android app produced from this branch (release and debug POC);
"debug POC only" entries are packaged only in the debug variant and are
**never** part of a production release.

## Packaged with the app

This notice is not only a repository document. Every Android APK and AAB built
from `artifacts/weather-app/android` packages a copy of it and a copy of the
full [Apache License 2.0](licenses/Apache-2.0.txt) at:

```text
assets/licenses/THIRD-PARTY-NOTICES.md
assets/licenses/Apache-2.0.txt
```

Debug POC builds additionally package
`assets/licenses/MULTILINGUAL-VOICE-NOTICE.txt`, which carries the French and
Spanish voice attribution. `:app:generateLicenseAssets` copies the tracked
files into the build; `:app:verifyDebugPackagedLicenses`,
`:app:verifyReleasePackagedLicenses` and `:app:verifyReleaseBundleContents`
open the actual APK/AAB and fail the build if the notices are absent. Those
tests inspect the archive, not the source tree.

| Component | Version | Licence | Redistributed in | Notes |
|---|---|---|---|---|
| [Parakeet TDT 0.6B v3 (int8)](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) model weights | 0.6B v3, int8 | **CC BY 4.0** | V2 release App Bundle (install-time asset pack); not present in standalone APK builds | `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, `tokens.txt`. Fetched at build time by `android/kokoro-poc/scripts/fetch-parakeet-assets.sh` from the [sherpa-onnx release](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2), archive SHA-256 `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`. **Int8 form:** the redistributed files are the pre-quantised int8 ONNX export published in the sherpa-onnx release, not a conversion performed by Daymark; Daymark redistributes them unmodified. Attribution and licence link below. |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) runtime (Android AAR, patched by Daymark) | 1.13.8 + CVE-2026-108954 patch | **Apache-2.0** | V2 Android builds (release and debug POC) | **Modified by Daymark.** The redistributed AAR is `artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar`, SHA-256 `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8`, rebuilt from upstream `v1.13.8` commit `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf` with `patches/0001-joiner-width-validation.patch` (SHA-256 `fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99`). This is **not** the upstream release AAR (SHA-256 `633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96`), which `fetch-sherpa-onnx.sh` refuses. The change adds joiner-output validation for CVE-2026-108954 / GHSA-f5q5-vp8g-wh4x. Full provenance and reproducible-build record: [`SHERPA-ONNX-PROVENANCE.md`](artifacts/weather-app/android/daymark-voice/SHERPA-ONNX-PROVENANCE.md). |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) (bundled in the patched sherpa-onnx AAR) | 1.28.2 | **MIT** | V2 Android builds (release and debug POC) | `lib/arm64-v8a/libonnxruntime.so`, arm64-v8a only; built from the `csukuangfj/onnxruntime-libs` v1.28.2 package recorded in `SHERPA-ONNX-PROVENANCE.md`. This is a separate copy from the ONNX Runtime statically linked into `libkokoro_jni.so`. |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) (statically linked into `libkokoro_jni.so`) | 1.28.0 | **MIT** | V2 Android builds (release and debug POC) | Embedded by `ort-sys` 2.0.0-rc.13 (`ort` 2.0.0-rc.13); the shipped library reports `rel-1.28.0` / `1.28.0`. Not the same binary as the sherpa copy above. |
| [pguso/kokoro](https://github.com/pguso/kokoro) runtime | `kokoro-en` 0.1.5, commit `b42bd5cf915163607cb51984cabf273dcf09755e` | Apache-2.0 | v1.0.0 and V2 Android builds (release and debug POC) | **Modified by Daymark.** `build-kokoro-android.sh` applies `scripts/kokoro-synth-phonemes.patch` (SHA-256 `7ef54b89873d3a7047c8f7cfabf09a20d44a80f3e772ac67b6e44810cbbf4de7`), adding a prephonemized synthesis entry point and removing narration/phoneme debug logging. `android/kokoro-poc/README.md` has the full build and licence matrix. |
| Kokoro model weights (`model_quantized.onnx`) | `kokoro-en` 0.1.5 | Apache-2.0 (upstream repository) | v1.0.0 and V2 Android builds (release and debug POC) | SHA-256 `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`. |
| `bm_fable.bin` narration voice | — | Apache-2.0 (per the model repository) | v1.0.0 and V2 Android builds (release and debug POC) | SHA-256 `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1`. Per-voice training-data provenance is not documented upstream; unresolved, low risk. |
| `ff_siwis.bin` French narration voice | — | **CC BY 4.0** via the SIWIS corpus | **debug POC only — never a production release** | SHA-256 `a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861`. Derived from the [SIWIS corpus](https://datashare.ed.ac.uk/handle/10283/2353); attribution is required. Attribution text is included below. Staged by `fetch-kokoro-assets.sh` into the debug source set only; `:app:verifyReleaseNarrationAssets` fails a release that contains it. |
| `em_alex.bin` Spanish narration voice | — | **Apache-2.0 (conditional)** | **debug POC only — never a production release** | SHA-256 `27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95`. Exact `hexgrad/Kokoro-82M` voice style converted by `onnx-community/Kokoro-82M-v1.0-ONNX`; Apache-2.0 notice and change-statement conditions apply. Speaker/training-data provenance remains undocumented and is not cleared. Staged by `fetch-kokoro-assets.sh` into the debug source set only; `:app:verifyReleaseNarrationAssets` fails a release that contains it. See [`docs/release/v2.1-em-alex-license-review.md`](docs/release/v2.1-em-alex-license-review.md). |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) | — | GPL-3.0 | **not included** | Verified absent: the Kokoro build uses the lean configuration without bundled eSpeak. |
| [Rust](https://www.rust-lang.org/) standard library and crates (`tokio`, `jni`, `log`, `android_logger`, `bincode`, `fancy-regex`, `regex`, `futures`, `pin-project`, `ndarray`, `num2words`, `unicode-segmentation`, `miette`, `language-tokenizer`, `quick-xml`, `ort`, `ort-sys`, `misaki-rs`, `cmudict-fast`, `waken_snowball`) | see `android/kokoro-poc/README.md` and `Cargo.lock` | MIT / Apache-2.0; `waken_snowball` BSD-3-Clause; `language-tokenizer` WTFPL-2.0 | V2 Android builds (compiled into the native library; release and debug POC) | Compiled into the Kokoro native library, which both variants load. `waken_snowball` is BSD-3-Clause and its notice is reproduced below; `cmudict-fast` embeds CMUdict data under the CMUdict licence reproduced below; `language-tokenizer` ships its own WTFPL licence file upstream. `jpreprocess` is **not** compiled in. |
| [piper-plus-g2p](https://github.com/ayutaz/piper-plus) | 0.5.3, commit `751e5dfe3fac760ac1993083b93ad34d057ae80d` | **MIT** | V2 Android builds (compiled into the native library; release and debug POC) | French and Latin American Spanish G2P; no eSpeak, no model. The published crate does not contain a standalone `LICENSE` file; the exact upstream MIT text is reproduced below. |
| [quick-xml](https://github.com/tafia/quick-xml) | 0.41.0 | **MIT** | V2 Android builds (compiled into the native library; release and debug POC) | Direct `piper-plus-g2p` dependency; exact MIT text reproduced below. |
| [jpreprocess](https://github.com/jpreprocess/jpreprocess) | 0.9.1 | **BSD-3-Clause** | not enabled | Optional Japanese-only dependency; the previous notice incorrectly said MIT. Exact BSD-3-Clause terms reproduced below. Not compiled in the French/Spanish build. |
| [Fraunces](https://github.com/undercasetype/Fraunces), [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans), [DM Mono](https://github.com/googlefonts/dm-mono) | — | SIL Open Font License 1.1 | v1.0.0 and V2 Android builds | Self-hosted WOFF2 files; copyrights and the full OFL text are reproduced below, and the repository copy is `artifacts/weather-app/src/fonts/LICENSE.md`. |
| [GeoNames](https://www.geonames.org/) locality dataset | — | **CC BY 4.0** | v1.0.0 and V2 Android builds | `localities-v1.json`, shipped as a static asset and looked up on the device. Full attribution and modification statement below; GeoNames is also named in the app's privacy pages. |
| [Open-Meteo](https://open-meteo.com/) weather, air-quality and geocoding APIs | — | CC BY 4.0 | not redistributed; queried at runtime | Attribution requested in the app. |
| [Capacitor](https://capacitorjs.com/) core and Android | 8.5.1 | MIT | v1.0.0 and V2 Android builds | |
| [@capacitor/app](https://github.com/ionic-team/capacitor-plugins/tree/main/packages/app) | 8.1.1 | MIT | V2 Android builds | Confirmed registered in `assets/capacitor.plugins.json` in the built debug APK (`com.capacitorjs.plugins.app.AppPlugin`). |
| Capacitor CLI | 8.5.1 | MIT | not redistributed (build tooling only) | Used only to build/sync the Android project. |
| AndroidX, Google libraries and Kotlin runtime | see `artifacts/weather-app/android/variables.gradle` | Apache-2.0 | v1.0.0 and V2 Android builds | |
| LLVM libc++ (`libc++_shared.so`) | Android NDK 29.0.14206865 | Apache-2.0 WITH LLVM-exception | v1.0.0 and V2 Android builds | NDK C++ runtime packaged as `lib/arm64-v8a/libc++_shared.so`; the LLVM exception is reproduced below. |

The WebView bundle (`assets/public/assets/index-*.js`) is built from the
following direct runtime dependencies of `artifacts/weather-app/package.json`.
They are JavaScript source compiled into the packaged web assets, not native
libraries.

| Component | Version | Licence |
|---|---|---|
| [React](https://react.dev/) / React DOM | 19.1.0 | MIT |
| [wouter](https://github.com/molefrog/wouter) | 3.10.0 | Unlicense |
| [zod](https://zod.dev/) | 4.6.7 | MIT |
| [clsx](https://github.com/lukeed/clsx) | 2.1.1 | MIT |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | 3.6.0 | MIT |
| [class-variance-authority](https://github.com/joe-bell/cva) | 0.7.1 | Apache-2.0 (covered by the packaged Apache-2.0 text) |
| [lucide-react](https://lucide.dev/) | 0.545.0 | ISC (includes MIT-licensed Feather portions) |
| [@radix-ui/react-toast](https://www.radix-ui.com/) | 1.2.23 | MIT |

Their MIT, ISC and Unlicense notices are reproduced below. This list covers the
direct runtime dependencies; the transitive npm tree is not separately
enumerated, so open blocker 3 below still applies.

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

The GeoNames locality dataset (`localities-v1.json`) is redistributed under
CC BY 4.0 and is named in the app's privacy pages. The attribution required by
that licence is:

> **GeoNames** — <https://www.geonames.org/>, licensed under the
> [Creative Commons Attribution 4.0 International Licence](https://creativecommons.org/licenses/by/4.0/).
> Daymark modified the data: the packaged `localities-v1.json` is a filtered
> and indexed subset of populated places derived from the GeoNames locality
> data, not the original dataset.

The full CC BY 4.0 attribution for the Parakeet weights and the SIWIS-derived
voice is in this file, which is packaged with every APK/AAB.

## Voice attribution

### `ff_siwis` (French)

`ff_siwis.bin` is the French voice style derived from the **SIWIS** corpus.

> Voice style: **ff_siwis**. Source corpus: **The SIWIS French Speech
> Synthesis Database** (2016) by Junichi Yamagishi, Pierre-Edouard Honnet,
> Philip Garner and Alexandros Lazaridis, University of Edinburgh, School of
> Informatics, The Centre for Speech Technology Research,
> <https://doi.org/10.7488/ds/1705> (DataShare record
> [10283/2353](https://datashare.ed.ac.uk/handle/10283/2353)), licensed under
> the [Creative Commons Attribution 4.0 International
> licence](https://creativecommons.org/licenses/by/4.0/).
> The voice style is published by **hexgrad** in
> [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) and converted to
> ONNX `.bin` by
> [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).
> Daymark redistributes the exact `.bin` file unmodified; the only known
> transformation is the upstream voice-style conversion. Daymark does not
> claim that the voice or corpus was modified for Daymark.

### `em_alex` (Spanish)

`em_alex.bin` is the Spanish voice style published by **hexgrad** in the
**Kokoro-82M** model repository and converted to ONNX `.bin` format by
**onnx-community/Kokoro-82M-v1.0-ONNX**. The exact redistributed file has
SHA-256 `27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95`;
the base `voices/em_alex.pt` has SHA-256
`5eac53f767c3f31a081918ba531969aea850bed18fe56419b804d642c6973431`.

The asset is distributed under the **Apache License 2.0** declared by both
model repositories, subject to the licence-copy, attribution and
change-statement conditions. Daymark does not modify the voice bytes.

> Kokoro-82M Spanish voice `em_alex` — published by
> [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), converted to
> ONNX `.bin` by
> [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX),
> redistributed unmodified under the
> [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
> Daymark does not claim speaker endorsement or identity.

The publisher does not document the original speaker, recording, training
dataset, consent, or voice-likeness rights for this individual voice. That
provenance remains unresolved and is not cleared by the Apache-2.0 grant. The
voice remains provisional; see
[`docs/release/v2.1-em-alex-license-review.md`](docs/release/v2.1-em-alex-license-review.md).

## Release gate and open blockers

French and Spanish narration is a debug-POC capability. It is not part of a
production release:

- `daymark-voice` compiles `BuildConfig.MULTILINGUAL_NARRATION = false` for the
  release variant and `true` for debug. `NarrationVoicePolicy` therefore
  rejects `fr`/`es` in release before any synthesis, and the release engine
  materialises only the English `bm_fable` voice.
- `fetch-kokoro-assets.sh` stages the English model and `bm_fable` in the main
  source set and stages `ff_siwis`/`em_alex` only in the debug source set.
- `:app:verifyReleaseNarrationSources` and
  `:app:verifyReleaseNarrationAssets` fail a release that would package a
  French or Spanish voice, whether it came from a source set, a generated
  directory or a dependency.
- `:app:verifyReleasePackagedLicenses` and
  `:app:verifyReleaseBundleContents` inspect the actual release APK/AAB.

The following are **open release blockers**, not resolved by this file or by
the packaged Apache-2.0 copy:

1. **`em_alex` speaker and training-data provenance.** The model publisher does
   not document the speaker, recording, dataset, consent or voice-likeness
   rights. Apache-2.0 is a copyright and patent grant; it is not a
   representation about those rights. A production release must not include
   `em_alex` until a per-voice written provenance/consent statement is obtained
   or the voice is removed. The debug POC is not a production release.
2. **`ff_siwis` attribution.** Redistribution is CC BY 4.0 and requires the
   SIWIS attribution in this file. It is debug-only and remains a blocker for
   any release that includes it.
3. **Notice completeness.** The packaged notice reproduces the direct
   third-party notices recorded here. It is not a substitute for a full
   transitive dependency scan; obtain one before a release that changes the
   native dependency set.
4. **Not legal advice.** This is an engineering record of the licences and
   evidence found, not a legal opinion.

## Verifying the redistributed files

The build-time fetch scripts pin and verify every downloaded artefact:

| Artefact | SHA-256 |
|---|---|
| `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` | `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf` |
| `encoder.int8.onnx` | `acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247` |
| `decoder.int8.onnx` | `179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e` |
| `joiner.int8.onnx` | `3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3` |
| `tokens.txt` | `d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d` |
| `sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar` (redistributed) | `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8` |
| `sherpa-onnx-1.13.8.aar` (upstream, refused) | `633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96` |
| `model_quantized.onnx` (Kokoro) | `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` |
| `bm_fable.bin` | `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1` |


## Changes to Apache-2.0 components

Apache-2.0 §4(b) requires modified files to carry prominent notices stating
that Daymark changed them. Two Apache-2.0 components are modified:

1. **sherpa-onnx 1.13.8** — patched for CVE-2026-108954 /
   GHSA-f5q5-vp8g-wh4x. Patch:
   `android/kokoro-poc/sherpa-onnx-cve-2026-108954/patches/0001-joiner-width-validation.patch`,
   SHA-256 `fd58558bdb9a7b82be8c2bfe7890890ca01edfedd95797e285d313b0bacd9f99`.
   Redistributed AAR SHA-256
   `5300c9133428525266470655d21148fce56210b5bb942ec58e4fa6a78af28bf8`.
   Full record: [`SHERPA-ONNX-PROVENANCE.md`](artifacts/weather-app/android/daymark-voice/SHERPA-ONNX-PROVENANCE.md).
2. **pguso/kokoro `kokoro-en` 0.1.5** — adds
   `KokoroTts::synth_phonemes` for prephonemized French/Spanish input and
   removes narration-text/phoneme debug logging. Patch:
   `android/kokoro-poc/scripts/kokoro-synth-phonemes.patch`, SHA-256
   `7ef54b89873d3a7047c8f7cfabf09a20d44a80f3e772ac67b6e44810cbbf4de7`.

Neither upstream repository ships a `NOTICE` file at the pinned revision
(checked at `k2-fsa/sherpa-onnx` `v1.13.8` and `pguso/kokoro`
`b42bd5cf915163607cb51984cabf273dcf09755e`), so no upstream NOTICE text is
omitted. The `em_alex` ONNX conversion is performed by the upstream ONNX
Community repository; Daymark does not modify the voice bytes.

## Exact third-party licence texts

The full Apache License 2.0 text is kept in
[`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt) and is packaged with every
APK/AAB. It covers the sherpa-onnx runtime, the patched sherpa-onnx AAR, the
pguso/kokoro runtime, the `em_alex` debug-POC voice, the AndroidX/Google
libraries and `class-variance-authority`.

### ONNX Runtime — MIT

Both ONNX Runtime copies are redistributed under the MIT licence.

```text
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
```

### Capacitor — MIT

```text
MIT License

Copyright (c) 2017-present Drifty Co.
Copyright 2020-present Ionic

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

### Bundled web dependencies — MIT, ISC and Unlicense

MIT-licensed packages and their copyright notices:

- React and React DOM 19.1.0 — Copyright (c) Meta Platforms, Inc. and affiliates.
- zod 4.6.7 — Copyright (c) 2025 Colin McDonnell.
- clsx 2.1.1 — Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com).
- tailwind-merge 3.6.0 — Copyright (c) 2021 Dany Castillo.
- @radix-ui/react-toast 1.2.23 — Copyright (c) 2022 WorkOS.

```text
MIT License

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

The copyright notices above are reproduced with that MIT permission notice.

lucide-react 0.545.0 is under the ISC licence:

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as part
of Feather (MIT). All other copyright (c) for Lucide are held by Lucide
Contributors 2025.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

wouter 3.10.0 is under the Unlicense:

```text
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or distribute this
software, either in source code form or as a compiled binary, for any purpose,
commercial or non-commercial, and by any means.

In jurisdictions that recognize copyright laws, the author or authors of this
software dedicate any and all copyright interest in the software to the public
domain. We make this dedication for the benefit of the public at large and to
the detriment of our heirs and successors. We intend this dedication to be an
overt act of relinquishment in perpetuity of all present and future rights to
this software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org>.
```

`misaki-rs` 0.3.0 declares the MIT licence but publishes no copyright notice or
licence file in the crate. `ort` 2.0.0-rc.13 and `ort-sys` 2.0.0-rc.13 are
dual-licensed MIT OR Apache-2.0; the packaged Apache-2.0 text covers that
election.

### waken_snowball — BSD-3-Clause

```text
BSD 3-Clause License

Copyright (c) 2001-2024, Dr Martin Porter and Richard Boulton
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

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

### CMUdict (embedded in `cmudict-fast`) — CMUdict licence

```text
Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
   The contents of this file are deemed to be source code.

2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in
   the documentation and/or other materials provided with the
   distribution.

This work was supported in part by funding from the Defense Advanced
Research Projects Agency, the Office of Naval Research and the National
Science Foundation of the United States of America, and by member
companies of the Carnegie Mellon Sphinx Speech Consortium. We acknowledge
the contributions of many volunteers to the expansion and improvement of
this dictionary.

THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY ``AS IS'' AND
ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY
NOR ITS EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### `language-tokenizer` — WTFPL-2.0

```text
        DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                    Version 2, December 2004

Copyright (C) 2026 Pavlov Danil <savannstm@gmail.com>

Everyone is permitted to copy and distribute verbatim or modified
copies of this license document, and changing it is allowed as long
as the name is changed.

            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE

TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

0. You just DO WHAT THE FUCK YOU WANT TO.
```

### Fonts — SIL Open Font License 1.1

The packaged fonts and their copyright notices are:

- Plus Jakarta Sans — Copyright 2020 The Plus Jakarta Sans Project Authors.
- Fraunces — Copyright 2020 The Fraunces Project Authors.
- DM Mono — Copyright 2020 The DM Mono Project Authors.

```text
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

The repository copy at `artifacts/weather-app/src/fonts/LICENSE.md` records the
same font copyrights; the packaged notice above is the copy that travels with
the Android app.

### LLVM libc++ — Apache-2.0 WITH LLVM-exception

The packaged Apache-2.0 text applies, with the following LLVM exception:

```text
--- LLVM Exceptions to the Apache 2.0 License ----

As an exception, if, as a result of your compiling your source code, portions
of this Software are embedded into an Object form of such source code, you
may redistribute such embedded portions in such Object form without complying
with the conditions of Sections 4(a), 4(b) and 4(d) of the License.

In addition, if you combine or link compiled forms of this Software with
software that is licensed under the GPLv2 ("Combined Software") and if a
court of competent jurisdiction determines that the patent provision (Section
3), the indemnity provision (Section 9) or other Section of the License
conflicts with the conditions of the GPLv2, you may retroactively and
prospectively choose to deem waived or otherwise exclude such Section(s) of
the License, but only in their entirety and only with respect to the Combined
Software.
```

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
