# Daymark V2.1 — voice rights, licensing and distribution audit

**Document:** `docs/release/v21-voice-rights-audit.md`
**Audit date:** 2026-11-08
**Repository:** `/Users/m1/Desktop/DayMark Research /.research-clone`
**Revision audited:** `3426bb4` (`release/v21-integration`; the same commit is also the tip of the local `feat/tts-pack-manager` branch)
**Scope:** `ff_siwis`, `em_alex`, the Kokoro model/runtime, and the release distribution gate for voice packs
**Method:** read-only review of the repository plus spot checks of public primary sources on 2026-11-08. No builds, no device runs, no legal advice.

> **Worktree note.** The shared worktree was being edited by other agents during this audit. Uncommitted/untracked files appeared while it ran, including `PackManifest.java`, `PackLicences.java`, `Json.java`, `Ed25519.java`, `.github/workflows/release-gates.yml`, and edits to `.github/workflows/android-ci.yml` and `README.md`. They are **not part of `3426bb4`**, were not relied on as evidence, and are not audited here. If they are the Agent C distribution-gate work, they need their own review and commit. Every finding below describes the committed revision; the gate gaps in §4 are gaps at `3426bb4`, not necessarily in that uncommitted work.

## 0. Verdict

**The V2.1 multilingual voice distribution is not cleared.** `ff_siwis` is licensed under CC BY 4.0 and may be distributed only with the attribution described below. `em_alex` has a documented Apache-2.0 *copyright* licence but no written evidence of speaker/likeness rights, so its distribution is **blocked** pending owner evidence. The current build no longer has an effective release boundary for `em_alex`: the static APK check remains, but a downloaded voice pack can make `em_alex` selectable in a release build, and no rights check exists on that path.

| Item | Status at `3426bb4` | Basis |
|---|---|---|
| `ff_siwis` (French) | **Licensed — attribution mandatory** | CC BY 4.0 via the SIWIS corpus; upstream `VOICES.md` maps `ff_siwis` to SIWIS. See §1. |
| `em_alex` (Spanish) | **BLOCKED — written speaker-rights evidence outstanding** | Apache-2.0 copyright grant recorded, but no speaker identity, consent, or per-voice provenance evidence. See §2. |
| Kokoro runtime (`pguso/kokoro`) | **Licensed — Apache-2.0; change notice required and present** | Notices and full licence text packaged. Copyright/NOTICE retention to verify. See §3. |
| Kokoro model weights | **Declared Apache-2.0 — record under-specified** | Model card declares `apache-2.0`; the Daymark notice row does not pin the model repository or revision. See §3. |
| Distribution gate for runtime packs | **ABSENT** | Only static APK/AAB asset checks exist; no manifest rights field, build flag, or installer check. See §4. |
| App legal screen for third-party notices | **ABSENT** | No notices route/screen was found; only the privacy pages exist. See §1.4. |

This document distinguishes three different things that are often conflated:

1. **Copyright licence** over the voice file (Apache-2.0 or CC BY 4.0).
2. **Speaker/likeness/consent rights** in the human voice the file was derived from.
3. **Packaging controls** that decide what can actually be published.

A clean answer on (1) does not answer (2), and neither is enforced by (3) today.

---

## 1. `ff_siwis` (French)

### 1.1 Provenance

| Property | Value | Evidence |
|---|---|---|
| Daymark asset | `ff_siwis.bin`, 522,240 bytes | `THIRD-PARTY-NOTICES.md:40`; `android/kokoro-poc/README.md:48`; `android/kokoro-poc/scripts/fetch-kokoro-assets.sh:24-30` |
| SHA-256 | `a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861` | `THIRD-PARTY-NOTICES.md:40`; `fetch-kokoro-assets.sh:26-30` |
| Upstream voice style | `ff_siwis`, published by hexgrad in `Kokoro-82M` | `THIRD-PARTY-NOTICES.md:117-120`; <https://huggingface.co/hexgrad/Kokoro-82M> |
| Upstream ONNX conversion | `onnx-community/Kokoro-82M-v1.0-ONNX`, `voices/ff_siwis.bin` | `THIRD-PARTY-NOTICES.md:118-120`; `fetch-kokoro-assets.sh:19,24` |
| Source corpus | **The SIWIS French Speech Synthesis Database** (2016) by Junichi Yamagishi, Pierre-Edouard Honnet, Philip Garner and Alexandros Lazaridis; University of Edinburgh, School of Informatics, CSTR | `THIRD-PARTY-NOTICES.md:109-116`; <https://datashare.ed.ac.uk/handle/10283/2353> |
| DOI | `10.7488/ds/1705` | `THIRD-PARTY-NOTICES.md:113`; <https://doi.org/10.7488/ds/1705> |
| Corpus licence | **CC BY 4.0** | DataShare record `dc.rights`: “Creative Commons Attribution 4.0 International Public License”, observed 2026-11-08 at <https://datashare.ed.ac.uk/items/1de74991-eede-4b48-8fbe-6c2abaed88d8/full>; Kokoro model card CC BY table, <https://huggingface.co/hexgrad/Kokoro-82M/raw/main/README.md> |
| Upstream per-voice mapping | The Kokoro `VOICES.md` French table lists `ff_siwis` with a `CC BY` column pointing to the SIWIS DataShare record | <https://huggingface.co/hexgrad/Kokoro-82M/raw/main/VOICES.md> (French table), observed 2026-11-08 |

The `ff_siwis` → SIWIS mapping is therefore documented upstream, not merely asserted by Daymark. The `.bin` SHA-256 differs from the upstream `.pt` SHA-256; the recorded explanation is the ONNX Community `.pt` → `.bin` conversion. Daymark redistributes the `.bin` unmodified and pins its SHA-256 (`THIRD-PARTY-NOTICES.md:121-123`; `fetch-kokoro-assets.sh:60-70`).

### 1.2 CC BY 4.0 obligations

CC BY 4.0 Section 3(a) applies when the licensed material is shared. For a redistributed voice file the practical obligations are:

| Obligation | CC BY 4.0 provision | What Daymark must do |
|---|---|---|
| Identify the creator(s) and any designated attribution parties | §3(a)(1)(A)(i) | Name the SIWIS authors and the University of Edinburgh/CSTR as recorded in the DataShare citation. |
| Retain a copyright notice | §3(a)(1)(A)(ii) | State the corpus attribution; do not present the voice as Daymark’s own. |
| Give notice of the licence | §3(a)(1)(A)(iii) | State that the material is licensed under CC BY 4.0. |
| Give notice of the warranty disclaimer | §3(a)(1)(A)(iv) | The current attribution does not expressly mention the disclaimer; a link to the licence text is the practical way to satisfy this. Recommend adding “provided without warranties, see the licence” or equivalent. |
| Provide a URI/hyperlink to the material | §3(a)(1)(A)(v) | Include the DataShare handle/DOI and the Kokoro/ONNX source links. |
| Indicate modifications and retain prior modification notices | §3(a)(1)(B) | State that Daymark did not modify the bytes; identify the upstream `.pt` → `.bin` conversion as the only known transformation. Do **not** claim Daymark modified the corpus or voice. |
| State the licence and include the text or a link | §3(a)(1)(C) | Include `https://creativecommons.org/licenses/by/4.0/` (a link is sufficient). |
| Do not imply endorsement | §2(a)(6) | No “endorsed by”, “official”, University of Edinburgh logo, or similar implication. |

Source checked: <https://creativecommons.org/licenses/by/4.0/legalcode.en> (Sections 2(a)(6), 3(a)), observed 2026-11-08.

Two limits matter:

- CC BY 4.0 licenses copyright and similar rights only. It expressly does **not** license publicity, privacy, or other personality rights (§2(b)(1)). Daymark’s position for `ff_siwis` is that the DataShare depositor granted CC BY over the corpus, and the attribution relies on that grant. The repository contains no separate performer release, and the authority of the depositor to grant CC BY over every performance is not independently evidenced here. **Unknown / residual risk**, not a reason to omit attribution.
- The full CC BY 4.0 legal text is **not** in `licenses/` (only `licenses/Apache-2.0.txt` is present). A link satisfies §3(a)(1)(C), so this is acceptable, but the attribution must actually contain the link in every surface where the voice ships.

### 1.3 Required attribution text

The text below is the minimum. It is assembled from the existing notice and corrected for the gaps above. The existing packaged version (`THIRD-PARTY-NOTICES.md:109-123`) is close but omits an express warranty-disclaimer reference.

> **`ff_siwis` French narration voice.** Voice style: **ff_siwis**. Source corpus: **The SIWIS French Speech Synthesis Database** (2016) by Junichi Yamagishi, Pierre-Edouard Honnet, Philip Garner and Alexandros Lazaridis, University of Edinburgh, School of Informatics, The Centre for Speech Technology Research, <https://doi.org/10.7488/ds/1705> (DataShare record <https://datashare.ed.ac.uk/handle/10283/2353>). The corpus is licensed under the [Creative Commons Attribution 4.0 International licence](https://creativecommons.org/licenses/by/4.0/); it is provided without warranties, as set out in that licence. The voice style is published by **hexgrad** in [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) and converted to ONNX `.bin` by [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX). Daymark redistributes the exact `.bin` file unmodified; the only known transformation is the upstream voice-style conversion. Daymark does not claim that the voice or corpus was modified for Daymark, and does not claim endorsement by the authors, the University of Edinburgh, or the voice talent. Redistributed file SHA-256: `a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861`.

### 1.4 Exactly where the attribution must ship

Attribution is not satisfied by a repository document, a store listing, or a file buried in the APK with no user path. The release requirement is:

| Surface | Exact location | Required content | Status at `3426bb4` |
|---|---|---|---|
| **French pack payload (in-pack notice)** | Inside the downloadable `fr` pack, in a `licenses/` member that is installed and retained on device (for example `licenses/MULTILINGUAL-VOICE-NOTICE.txt`, `licenses/THIRD-PARTY-NOTICES.md`, and the CC BY link). The manifest must list this notice with its SHA-256. | The §1.3 text, the CC BY link, the DataShare DOI/handle, the file SHA-256. | **MISSING.** No pack notice mechanism exists. `PackInstaller` treats `payload` as one opaque file (`PackInstaller.java:74-158`, `190-196`) and never extracts or retains a notice. |
| **App legal screen** | A user-reachable screen (for example `/licences`, linked from Settings and from the pack-install confirmation) that renders the packaged notices and the installed packs’ notices. | The §1.3 text, plus the Apache-2.0 text and other third-party notices. | **MISSING.** The only routes are `/`, `/privacy`, `/fr/privacy`, `/es/privacy`, `/store-preview` (`artifacts/weather-app/src/App.tsx:276-280`); the footer links only Open-Meteo and Privacy (`App.tsx:266`). No third-party-notice screen was found. |
| **Release APK/AAB assets** | `assets/licenses/THIRD-PARTY-NOTICES.md` and `assets/licenses/Apache-2.0.txt` inside the archive | The file is packaged by `:app:generateLicenseAssets` (`artifacts/weather-app/android/app/build.gradle:81-100`) and verified at archive level (`app/build.gradle:193-260`). | **PRESENT** for the text. This does not cover the French pack, because the French voice is not in the release archive. |
| **Debug APK** | `assets/licenses/MULTILINGUAL-VOICE-NOTICE.txt` | The debug French/Spanish notice. | **PRESENT in debug only** (`artifacts/weather-app/android/app/src/debug/assets/licenses/MULTILINGUAL-VOICE-NOTICE.txt:1-23`). Release verification deliberately does not require it (`app/build.gradle:253-256`). |

The critical gap is the first two rows. A CC BY attribution that exists only in `THIRD-PARTY-NOTICES.md` inside the APK, with no screen and no pack notice, is weak: the app’s user cannot reasonably find it, and the pack recipient does not receive it at all. §3(a)(2) permits satisfaction “in any reasonable manner based on the medium, means, and context”, but an unlinked asset file in a mobile app is a poor fit for that standard. Treat the in-pack notice **and** the legal screen as release requirements, not optional polish.

Related documentation defects:

- `THIRD-PARTY-NOTICES.md:100-101` says the full CC BY attribution “is in this file, which is packaged with every APK/AAB”. The *attribution file* is packaged; the French voice is not. This overstates the position and should be corrected.
- The debug notice says “French or Spanish narration is not available in a production release” (`MULTILINGUAL-VOICE-NOTICE.txt:3-5`). That is no longer true of the release build configuration at `3426bb4` (see §4.1).

---

## 2. `em_alex` (Spanish)

### 2.1 Asset and declared copyright licence

| Property | Value | Evidence |
|---|---|---|
| Daymark asset | `em_alex.bin`, 522,240 bytes, debug source set currently | `docs/release/v2.1-em-alex-license-review.md:38`; `THIRD-PARTY-NOTICES.md:41` |
| SHA-256 | `27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95` | `THIRD-PARTY-NOTICES.md:41`; `v2.1-em-alex-license-review.md:40`; `fetch-kokoro-assets.sh:29` |
| Base voice | `hexgrad/Kokoro-82M`, `voices/em_alex.pt`, SHA-256 `5eac53f767c3f31a081918ba531969aea850bed18fe56419b804d642c6973431` | `v2.1-em-alex-license-review.md:45-47`; `THIRD-PARTY-NOTICES.md:131-132` |
| Conversion repository | `onnx-community/Kokoro-82M-v1.0-ONNX`, revision observed `1939ad2a8e416c0acfeecc08a694d14ef25f2231`, licence metadata `apache-2.0` | `v2.1-em-alex-license-review.md:42-44` |
| Base model licence | `apache-2.0` on `hexgrad/Kokoro-82M`; model card says “Apache-licensed weights” | `v2.1-em-alex-license-review.md:79-85`; model card re-checked 2026-11-08 at <https://huggingface.co/hexgrad/Kokoro-82M/raw/main/README.md> |
| Upstream per-voice documentation | Spanish `VOICES.md` table lists only name, traits and SHA-256 prefix; there is no source/licence column for `em_alex` | <https://huggingface.co/hexgrad/Kokoro-82M/raw/main/VOICES.md> (Spanish table), observed 2026-11-08 |

The copyright position is reasonably supported for the **bytes**: both model repositories declare Apache-2.0, and Daymark pins the exact `.bin` hash. The repository’s own review reaches that conclusion (`v2.1-em-alex-license-review.md:17-32`).

### 2.2 What Apache-2.0 does and does not cover

Apache-2.0 gives a broad copyright and patent licence, subject to conditions:

- §2 grants a perpetual, worldwide, non-exclusive, no-charge, royalty-free copyright licence to reproduce, prepare derivative works, publicly display, publicly perform, sublicense and distribute the Work (`licenses/Apache-2.0.txt:66-72`).
- §3 grants a patent licence on the stated terms (`licenses/Apache-2.0.txt:73-88`).
- §4 requires recipients to receive a copy of the licence, modified files to carry prominent change notices, and copyright/patent/trademark/attribution notices to be retained; if the Work includes a `NOTICE` file, its attribution notices must be reproduced (`licenses/Apache-2.0.txt:89-129`).
- §6 expressly does **not** grant trademark rights (`licenses/Apache-2.0.txt:138-140`).

**Apache-2.0 is not a speaker-consent, likeness, or right-of-publicity licence.** It is a copyright/patent grant from the publisher. For comparison, CC BY 4.0 itself says publicity, privacy and personality rights are not licensed (`https://creativecommons.org/licenses/by/4.0/legalcode.en`, §2(b)(1)). The Apache text contains no representation about the human voice, the recording, or the performer at all.

### 2.3 Apache retention obligations and current compliance

| Obligation | Status | Evidence |
|---|---|---|
| Give recipients a copy of Apache-2.0 | **Met in form.** `licenses/Apache-2.0.txt` is packaged in APK/AAB assets and verified at archive level. | `app/build.gradle:81-100`, `193-260`; `THIRD-PARTY-NOTICES.md:216-220` |
| Retain copyright/attribution notices | **Cannot be confirmed.** The notice identifies hexgrad and ONNX Community but reproduces no upstream copyright line. No upstream `NOTICE` file was found in the model repositories (recorded at `v2.1-em-alex-license-review.md:143`). Whether a copyright line exists in the upstream model card/repository metadata was not re-checked line by line. | `THIRD-PARTY-NOTICES.md:138-144`; `v2.1-em-alex-license-review.md:143` |
| Prominent change notices for modified files | **Not applicable to the voice bytes** — Daymark does not modify them. The `.pt` → `.bin` conversion is upstream and must be stated as such. | `THIRD-PARTY-NOTICES.md:134-136,211-212`; `v2.1-em-alex-license-review.md:69-70` |
| No trademark/endorsement implication | **Met in the notice text.** “Daymark does not claim speaker endorsement or identity.” | `THIRD-PARTY-NOTICES.md:144` |

The gap is not the Apache text; it is the absence of the copyright line (if one exists upstream) and the absence of the speaker-rights evidence below.

### 2.4 Speaker/likeness rights: the evidence actually in the repository

The key question is not “is the file Apache-2.0?” but “did the human whose voice this is consent to the creation and commercial redistribution of this voice model?” The repository does not answer that question.

| Thing that exists | What it proves | What it does not prove |
|---|---|---|
| Apache-2.0 declarations on `hexgrad/Kokoro-82M` and `onnx-community/Kokoro-82M-v1.0-ONNX` | A copyright/patent licence from the publishers over the repository contents | Speaker identity, consent, recording licence, or likeness rights |
| General model-card statement that Kokoro was trained on “permissive/non-copyrighted audio data” | A general training-data claim by the publisher | That `em_alex` specifically came from permissive data, or that the speaker consented to a synthetic voice model |
| Kokoro `VOICES.md` Spanish row: `em_alex`, male, SHA-256 `5eac53f7` | The voice exists and is identified by a pseudonym | Who the speaker is, what recording/dataset produced the voice, or any licence/consent |
| Owner assertion dated 2026-11-06 in `v2.1-em-alex-license-review.md:3-5,184` and `THIRD-PARTY-NOTICES.md:41,146,168` | That the owner says clearance is complete | The instrument relied on: no signatory, no date-stamped document, no scope, no attached evidence, no hash-identified record |
| `git log` around the clearance (`a67b763`, `fa650be`) | Documentation was edited to say “cleared” | Any new evidence; the commits only change notices/docs |
| `android-production-readiness.md:130` | The same repository still calls `em_alex` speaker/training-data provenance an “explicit release blocker” | Nothing — it directly contradicts the “cleared” annotation |

**Conclusion: written speaker-rights evidence is outstanding.** The “CLEARED — owner-confirmed 2026-11-06” status is an **assertion recorded in documentation**, not evidence. It cannot be audited, it identifies no grantor, and it does not state the scope (territories, term, commercial use, sublicensing, modification/derivative use). The repository also repeatedly says Daymark “does not claim speaker endorsement or identity” (`THIRD-PARTY-NOTICES.md:144`; `v2.1-em-alex-license-review.md:161`), which is consistent with the speaker being unidentified.

**Distribution status: BLOCKED.** No release, pack publication, store upload, or other distribution of `em_alex` should occur until the evidence in §5 (D1) is produced and accepted, or the voice is withdrawn (D2). This applies regardless of the Apache-2.0 position: the unresolved right is a different right.

### 2.5 Documentation conflict to resolve

The repository currently contains two incompatible positions:

| Position | Where |
|---|---|
| “CLEARED — owner-confirmed 2026-11-06”; no further blocker | `v2.1-em-alex-license-review.md:3-5,182-188`; `THIRD-PARTY-NOTICES.md:41,146,168` |
| “unresolved `em_alex` speaker/training-data provenance remains an explicit release blocker” | `docs/release/android-production-readiness.md:130` |
| Questions about speaker identity, dataset, consent and territory “remain unresolved” | `v2.1-em-alex-license-review.md:166-180` (described as historical, but the underlying facts are still true) |

This audit treats the **blocked** position as correct because it is the only one supported by evidence. The “cleared” annotation should be changed to “blocked — written evidence outstanding” unless D3 produces the instrument.

### 2.6 Notice text required if `em_alex` is ever cleared

If distribution is later authorised, the following text (already in `THIRD-PARTY-NOTICES.md:138-144`) must ship in the Spanish pack and on the legal screen:

> Kokoro-82M Spanish voice `em_alex` — published by [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), converted to ONNX `.bin` by [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), redistributed unmodified under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). Source voice file: `voices/em_alex.pt`, SHA-256 `5eac53f767c3f31a081918ba531969aea850bed18fe56419b804d642c6973431`; redistributed ONNX voice file SHA-256 `27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95`. Daymark does not claim speaker endorsement or identity.

The Apache-2.0 text must accompany it, and any upstream copyright/NOTICE line must be reproduced.

---

## 3. Kokoro model and runtime licence status

### 3.1 What the repository records

| Component | Declared licence | Redistributed | Notice/evidence |
|---|---|---|---|
| `pguso/kokoro` runtime (`kokoro-en` 0.1.5, commit `b42bd5cf915163607cb51984cabf273dcf09755e`) | **Apache-2.0** | Yes, compiled into `libkokoro_jni.so`; modified by Daymark | `THIRD-PARTY-NOTICES.md:37`; modification statement at `THIRD-PARTY-NOTICES.md:202-206`; build record `android/kokoro-poc/README.md:191-194` |
| Kokoro model weights `model_quantized.onnx` | **Apache-2.0 (upstream repository)** | Yes, asset, SHA-256 `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` | `THIRD-PARTY-NOTICES.md:38`; `fetch-kokoro-assets.sh:23`; README matrix `android/kokoro-poc/README.md:194` |
| `bm_fable.bin` (English voice) | **Apache-2.0 (per the model repository)** | Yes, release asset, SHA-256 `f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1` | `THIRD-PARTY-NOTICES.md:39`; provenance caveat at `:39`; README `android/kokoro-poc/README.md:195` |
| Apache-2.0 full text | Apache License 2.0 | Yes, `assets/licenses/Apache-2.0.txt` | `licenses/Apache-2.0.txt` (11,357 bytes); packaged by `app/build.gradle:81-100`; scope statement `THIRD-PARTY-NOTICES.md:216-220` |
| CC BY 4.0 text | Not included | n/a | Only a link is required for CC BY; no CC BY text file exists in `licenses/`. |

Independent spot checks on 2026-11-08:

- `hexgrad/Kokoro-82M` model card front matter: `license: apache-2.0`; “With Apache-licensed weights, Kokoro can be deployed anywhere from production environments to personal projects” (<https://huggingface.co/hexgrad/Kokoro-82M/raw/main/README.md>).
- `pguso/kokoro` GitHub repository metadata: `license.spdx_id = Apache-2.0` (<https://api.github.com/repos/pguso/kokoro>).
- The ONNX Community conversion repository’s `apache-2.0` metadata is recorded in the Daymark review (`v2.1-em-alex-license-review.md:42-44`) but was not re-fetched for this audit.

### 3.2 Compliance assessment

**Runtime — compliant in form.** The runtime is Apache-2.0, Daymark modifies it, and the change is prominently described (`THIRD-PARTY-NOTICES.md:202-206`). Apache §4(b) is satisfied by that statement. Apache §4(a) is satisfied by the packaged full text. The runtime’s upstream `NOTICE` status is recorded as “neither upstream repository ships a `NOTICE` file at the pinned revision” for sherpa-onnx and pguso/kokoro (`THIRD-PARTY-NOTICES.md:208-211`). The notice does not reproduce a pguso copyright line; §4(c) requires retention of copyright notices that exist. Whether upstream publishes such a line was not verified for this audit. **Action:** check the pinned upstream `LICENSE`/source headers and reproduce any copyright line in the notices.

**Model weights — declared, not fully evidenced in-repo.** The model card supports Apache-2.0, but the Daymark row has three weaknesses:

1. It says the model is “`kokoro-en` 0.1.5”, which is the *runtime* version, not the model repository/revision. The model is fetched from `onnx-community/Kokoro-82M-v1.0-ONNX` (`fetch-kokoro-assets.sh:19`), not from the pguso release.
2. It gives no model-card URL, revision, or upstream hash. The SHA-256 in the fetch script is a Daymark-pinned constant (`fetch-kokoro-assets.sh:23,39-51`), so it proves *integrity against the pin*, not *provenance from a specific upstream revision*.
3. It does not identify a copyright holder or reproduce a copyright line.

**This is a documentation/provenance gap, not a known licence failure.** The model card is Apache-2.0; the missing piece is a pinned, auditable record. Fix before a release that changes the model or the notice inventory.

**`bm_fable` — adjacent, out of scope but unresolved.** The English voice is declared Apache-2.0 “per the model repository”, and the notices themselves say per-voice training-data provenance is “not documented upstream; unresolved, low risk” (`THIRD-PARTY-NOTICES.md:39`; also `android-production-readiness.md:528,542`, `android/kokoro-poc/README.md:195,206`). This is the same *category* of gap as `em_alex` (speaker/likeness evidence), but it is not the subject of this audit and is not currently treated as a release blocker. It should be tracked explicitly rather than left as a footnote.

**General licence-text coverage.** `THIRD-PARTY-NOTICES.md:216-220` states the packaged Apache text covers the sherpa-onnx runtime/AAR, the pguso/kokoro runtime, the `em_alex` debug-POC voice, AndroidX/Google libraries, and `class-variance-authority`. It does **not** say the Apache text covers the Kokoro model weights or `bm_fable`; that should be made explicit if those are Apache-2.0. The ONNX Runtime MIT texts are reproduced inline in the notices, not in `licenses/` (`THIRD-PARTY-NOTICES.md:224-250`), which is acceptable because MIT requires the notice to accompany copies.

---

## 4. The distribution gate

### 4.1 What exists at `3426bb4`

Three layers currently exist, and only the first is a real gate:

1. **Static source gate.** `:app:verifyReleaseNarrationSources` fails if `ff_siwis.bin` or `em_alex.bin` is staged in main/release assets (`artifacts/weather-app/android/app/build.gradle:104-141`).
2. **Static archive gate.** `:app:verifyReleaseNarrationAssets` fails if the merged release assets contain those files, and `verifyArchive` fails a release APK/AAB containing them (`app/build.gradle:143-171`, `193-208`). Regression tests cover this (`app/build.gradle:431-442`).
3. **Packaged-notice gate.** `:app:verifyReleasePackagedLicenses` and `:app:verifyReleaseBundleContents` open the actual archive and require `assets/licenses/THIRD-PARTY-NOTICES.md` (containing `em_alex`, `SIWIS`, `Apache-2.0`) and `assets/licenses/Apache-2.0.txt` (`app/build.gradle:235-305`).

Those gates only inspect **files inside the APK/AAB**. They do not inspect a downloaded pack.

### 4.2 Why the static gate is no longer the release boundary

At `3426bb4` the release build was changed to enable multilingual narration:

- `daymark-voice/build.gradle:31-35` compiles `MULTILINGUAL_NARRATION = true` for release and `PACKAGED_MULTILINGUAL_VOICES = false`.
- `KokoroLocalTtsEngine.java:147-148` materialises only the packaged voices selected by `PACKAGED_MULTILINGUAL_VOICES`, so release packages only `bm_fable` from assets.
- `NarrationVoicePolicy.java:60-72` then selects `ff_siwis` or `em_alex` whenever the voice is **installed**, regardless of whether it came from an asset or a downloaded pack. `KokoroLocalTtsEngine.java:302-303` passes the installed-voice set and `MULTILINGUAL_NARRATION = true`.
- `PackInstaller.java:74-158` stages a pack after checking only `packId`, version, expected size and SHA-256. It has **no rights, licence, or release-eligibility field**. `requirePackId` accepts any two-letter code (`PackInstaller.java:214-218`), so the pack is not tied to a voice identity by the installer.
- The installer is not yet wired to the plugin (no caller in `daymark-voice/src/main/java` outside `PackInstaller.java` itself), so the exposure is **latent**, not live. But the runtime path that would consume it is already permissive.

Consequences:

- A future `es` pack containing `em_alex.bin` can be installed, registered (`DaymarkVoicePlugin` `registerVoice`/`activateVoice`), and selected in a **release** build. The static archive gate will not see it because it is not in the archive.
- The only thing preventing that today is that the pack manager/downloader is not implemented and no production pack channel exists. That is an accident of incomplete work, not a control.
- The documentation still says release rejects French/Spanish (`THIRD-PARTY-NOTICES.md:153-156`, `android-production-readiness.md:121-130`, `v2.1-release-scope.md:111`). That is **false at this commit** and would give a reviewer false assurance. It must be corrected as part of the gate work.

### 4.3 Proposed gate mechanism (Agent C proposal; not implemented)

The requirement is: **release packaging and the release app must refuse to publish, install, register, or select `em_alex` until written rights evidence exists and is pinned in the signed pack manifest.** The same mechanism should classify `ff_siwis` as distributable-with-attribution, and should not block English.

Proposed design, labelled as a proposal because none of it exists at `3426bb4`. The exact JSON field spelling is illustrative and should follow the final pack-manifest contract; the fail-closed semantics and the acceptance criteria in E are the requirement.

**A. Signed manifest gains mandatory `rights` records per component.**

```json
{
  "packId": "es",
  "version": 1,
  "components": [
    {
      "type": "voice",
      "id": "em_alex",
      "sha256": "27809e9e...",
      "licence": "Apache-2.0",
      "rights": {
        "status": "blocked",
        "copyright": "cleared",
        "speakerRights": {
          "status": "outstanding",
          "evidenceSha256": null,
          "scope": null
        }
      }
    }
  ],
  "notices": [
    {"path": "licenses/THIRD-PARTY-NOTICES.md", "sha256": "..."},
    {"path": "licenses/Apache-2.0.txt", "sha256": "..."}
  ]
}
```

Allowed `rights.status` values: `cleared` (may be published), `development-only` (may be built for internal/debug use, never published), `blocked` (never published). `speakerRights.status` must be `cleared` for any commercial release. A pack with a missing `rights` record is treated as `blocked` (fail closed).

**B. Build/publish flag separates development from release.**

- Build parameter `-PdaymarkVoicePackMode=release|development`, default `release`.
- `development` may sign packs containing `development-only` components but the signing job must mark them with the development channel and must never upload them to the production channel.
- `release` refuses to sign or publish a manifest containing `development-only` or `blocked`, or any voice component without a `speakerRights.status = cleared`.
- The signed manifest (including the `rights` block and evidence hashes) is retained as release evidence alongside the AAB.

**C. Enforcement points, in order.**

| Point | Required behaviour | Current state |
|---|---|---|
| Pack build/sign job | Compute manifest; fail if `em_alex` is present and `speakerRights.evidenceSha256` is absent or does not match a committed evidence file. | **Missing** |
| Release CI gate | A task such as `verifyReleaseVoicePackRights` reads every `*.manifest.json` under the pack output; fails on `development-only`/`blocked`/missing rights in a release build. | **Missing** |
| Production channel | Return 404 for development-only pack versions; never serve `em_alex` until cleared. | **Missing** (no channel yet) |
| Download/manifest verification layer | Verify the signature, then the `rights` block, before download. | **Missing** |
| `PackInstaller.stage` | Accept the verified manifest (or a `rights` verdict) and reject `development-only` when `BuildConfig.DEBUG` is false, and reject `blocked` always, before writing bytes. Return a stable reason such as `pack-not-licensed`. | **Missing** |
| `DaymarkVoicePlugin.registerVoice` | Refuse to register a voice whose manifest rights are not `cleared` for this build type. | **Missing** |
| Legal screen | Show the pack’s notices and licence/rights status before activation and permanently afterwards. | **Missing** |

**D. Pack notices must be part of the format.** The manifest’s `notices` array (paths + SHA-256) must be installed next to the payload and surfaced on the legal screen. `PackInstaller` currently stores one opaque `payload` file (`PackInstaller.java:131,190-196`); the format must either be an archive with extracted notices or a payload plus a verified notice directory. This is a format decision that belongs with the pack-manifest work (`v2.1-release-scope.md:121-123`).

**E. Acceptance criteria for the gate (testable).**

1. A release-mode pack build containing `em_alex` with no `speakerRights.evidenceSha256` fails before signing.
2. A release-mode pack build containing `em_alex` with `rights.status = development-only` fails before signing.
3. A release APK/AAB still fails if `em_alex.bin` is packaged as a static asset (regression coverage already exists at `app/build.gradle:431-442`).
4. A release build refuses to install/register/select an `em_alex` pack whose verified manifest is not `cleared`; the error is user-visible and does not fall back to English (`v2.1-release-scope.md:69-76` policy).
5. A debug build may install a `development-only` pack, and the app displays a persistent “development only — not for distribution” marker.
6. The legal screen lists the installed pack’s notices before activation and after installation; the notice files’ SHA-256 match the manifest.
7. `ff_siwis` is allowed in release only when its manifest contains the CC BY attribution and the notice files; the pack build fails if the `SIWIS`/CC BY text is missing.
8. CI records the manifest hash, rights status, and evidence hashes in the release evidence bundle.

This is the only design that makes the rule “release packaging must refuse to publish `em_alex` until rights evidence exists” mechanically true. A documentation warning or a build-type comment is not sufficient, because the distribution path is a downloaded manifest, not the APK.

---

## 5. Owner decisions required

Each item states the exact evidence or instruction needed. Until the decision is recorded, the conservative status remains as shown.

### D1 — `em_alex` speaker-rights evidence (blocking)

**Decision needed:** provide written evidence covering the exact `em_alex` asset, or confirm withdrawal (D2).

**Evidence required — exact content:**

A signed statement (letterhead or verifiable email from an authorised representative of the rights holder; PDF plus SHA-256 for the evidence register) that:

1. **Identifies the speaker and the source recording/dataset** used to produce `hexgrad/Kokoro-82M voices/em_alex.pt` (SHA-256 `5eac53f767c3f31a081918ba531969aea850bed18fe56419b804d642c6973431`), or states a documented pseudonym basis and provides the identity to Daymark under confidentiality.
2. **Confirms the speaker consented** to the creation of a synthetic voice model / voice embedding from that recording, and to its reproduction, modification (including the `.pt` → `.bin` conversion), public performance, and commercial use.
3. **Confirms the grant covers redistribution** of the resulting voice file as part of the Daymark Android application and as a separately downloadable Spanish language pack, worldwide, for the period Daymark distributes it, with sublicensing to end users for personal use.
4. **Confirms that no separate performer, publicity, likeness, or moral right** held by the speaker or a third party blocks that distribution, or identifies the permission relied on.
5. **Identifies the grantor’s authority** (for example the dataset owner, voice-talent contract, or employer) and attaches the relevant clause or a signed summary.
6. **States any limits** on territory, term, field of use, or commercial scope precisely. “Worldwide, perpetual, commercial, sublicensable” must be stated explicitly if that is the grant.
7. **Is dated and signed**, with printed name, role, organisation, and contact details.

The statement must be specific to `em_alex`; a general statement about Kokoro’s training data, or the Apache-2.0 declaration, is **not** sufficient.

### D2 — fallback if D1 cannot be produced

**Decision needed:** choose one:

- withdraw `em_alex` from V2.1 and ship English + French only; or
- replace the Spanish voice with a voice whose provenance and speaker rights are documented; or
- defer Spanish narration to a later release.

**Exact instruction required:** “`em_alex` is withdrawn from V2.1 distribution; no `es` narration pack will be published until a replacement with documented speaker rights is approved.” If a replacement is chosen, D1 applies to the replacement asset, with its own hashes.

### D3 — reconcile the 2026-11-06 “CLEARED” assertion

**Decision needed:** identify the instrument relied on, or authorise correcting the record.

**Exact evidence required:** “The 2026-11-06 clearance is based on [document name], dated [date], signed by [name, role], covering [asset SHA-256 / scope / territories / term]”, with the document attached and hashed. If no such document exists, instruct that `THIRD-PARTY-NOTICES.md:41,146,168`, `docs/release/v2.1-em-alex-license-review.md:3-5,184`, `artifacts/weather-app/android/app/src/debug/assets/licenses/MULTILINGUAL-VOICE-NOTICE.txt:41-43`, and `android-production-readiness.md:130` be changed to “blocked — written evidence outstanding”.

### D4 — `ff_siwis` attribution and placement

**Decision needed:** approve the exact §1.3 text and the two required surfaces (in-pack notice + legal screen), and confirm the no-modification statement.

**Exact instruction required:** “Approve the `ff_siwis` attribution text in §1.3 for the French pack notice and the in-app legal screen; confirm that Daymark does not modify the voice or corpus and that the only transformation is the upstream voice-style conversion; confirm the legal screen route and link placement.”

Also confirm whether Daymark relies solely on the DataShare CC BY grant for performer rights, or holds a separate release. If the latter, record it under D1-style evidence (speaker/performer consent for the SIWIS recording).

### D5 — Kokoro model and runtime evidence

**Decision needed:** either accept the current declarations as sufficient, or require a pinned upstream licence record.

**Exact evidence required:** “The Kokoro model weights at `model_quantized.onnx` SHA-256 `fbae9257...` are redistributed under Apache-2.0 as declared at [model card URL], revision [commit], and the upstream copyright/NOTICE line (if any) is reproduced at [path].” Also confirm the pguso/kokoro upstream copyright line, if one exists, is reproduced in the notices. If this cannot be evidenced, record the model licence as “declared by upstream model card, not independently verified” and decide whether that is acceptable for release.

### D6 — pack rights policy and sign-off

**Decision needed:** approve the manifest rights schema (§4.3), the release/development flag, and the named role authorised to set `rights.status = cleared`.

**Exact instruction required:** “The following role is authorised to approve a voice pack’s `rights.status = cleared`: [role/name]. A pack may be published only when its signed manifest contains a `rights` record whose `speakerRights.evidenceSha256` matches a document in `docs/release/rights/` and the release CI gate passes.” Also decide what happens to any development-only pack already installed on a user device when the app updates to a release build (recommend: refuse selection and offer removal; do not silently delete without notice).

### D7 — notice completeness for other voices/components

**Decision needed:** confirm whether `bm_fable` and the Kokoro model weights are in scope for the same speaker/provenance evidence standard, or explicitly accept the current “low risk, undocumented provenance” position.

**Exact instruction required:** “`bm_fable` is accepted for V2.1 distribution on the basis of [evidence], or is excluded”; and the same for the Kokoro model weights. This audit does not treat `bm_fable` as a blocker, but the inconsistency should be a recorded decision rather than an implicit one.

---

## 6. Unknowns and limitations

The following are **not** established by this audit and must not be presented as established:

1. **Speaker identity and consent for `em_alex`.** Unknown. No public or in-repo source identifies the speaker, recording, dataset, or consent.
2. **Territorial analysis.** No right-of-publicity or performer-rights analysis for any jurisdiction (UK, EU, US, or elsewhere) was performed. “Worldwide” in the Apache grant is a copyright grant, not a likeness clearance.
3. **Authority of the SIWIS depositor.** The DataShare record grants CC BY 4.0; whether that grant covers every performer right in the corpus is not independently evidenced here.
4. **Upstream NOTICE/copyright lines for the Kokoro repositories.** Not exhaustively checked. The repository records that no `NOTICE` file was found in the model repositories (`v2.1-em-alex-license-review.md:143`); the pguso/kokoro line was not checked for this audit.
5. **The 2026-11-06 clearance instrument.** Not present in the repository; the assertion cannot be verified.
6. **Pack format and delivery architecture.** The V2.1 scope explicitly leaves hosting/delivery “TBD — not selected” (`v2.1-release-scope.md:78-80`). The gate design in §4.3 assumes a signed manifest; the final transport is not fixed.
7. **Legal effect.** This is an engineering record, not legal advice. The owner should obtain advice on the sufficiency of any D1 instrument for the intended territories.
8. **Build/runtime verification.** No APK/AAB was built and no device test was run. The code-level findings are source inspections at `3426bb4`.

---

## 7. Release recommendation

**Do not publish any V2.1 artefact that contains or can install `em_alex`.**

Minimum conditions for a multilingual voice release:

1. **`em_alex`:** written D1 evidence accepted, or the voice withdrawn (D2). Until then, `em_alex` must be `blocked` in the manifest and refused by the build, the channel, the installer, and the plugin.
2. **`ff_siwis`:** §1.3 attribution shipped in the French pack **and** reachable from an in-app legal screen; CC BY link and DOI present; no endorsement implication.
3. **Distribution gate:** §4.3 implemented and covered by tests, with the release build defaulting to `release` mode and failing closed on a missing/`development-only` rights record.
4. **Documentation:** correct the stale claims that release rejects French/Spanish (`THIRD-PARTY-NOTICES.md:153-156`, `android-production-readiness.md:121-130`, `v2.1-release-scope.md:111`) and change the `em_alex` status to blocked until D1/D3 is resolved.
5. **Kokoro notice record:** pin the model repository/revision and any upstream copyright line; make explicit that the packaged Apache text covers the model weights and `bm_fable`.

An English-only **distribution** is not blocked by this audit, provided no `es` pack is published and the multilingual runtime path is either gated by §4.3 or removed from the release build. Its packaged `THIRD-PARTY-NOTICES.md` currently asserts `em_alex` clearance (`:41,146,168`) and still carries the `em_alex` attribution. That text should be corrected before any release, even an English-only one, so the distributed notice does not misstate the rights position.

**Blockers:** B1 `em_alex` speaker-rights evidence; B2 no runtime pack rights gate; B3 no in-pack notices / legal screen; B4 stale/contradictory notices. B1 is an owner/legal blocker; B2–B4 are implementation blockers.

---

## 8. References

### Repository files

- `THIRD-PARTY-NOTICES.md` — packaged notices; component table at `:31-54`, CC BY section `:76-101`, voice attribution `:103-146`, packaging/gate claims `:148-171`, Apache modifications `:190-212`, licence text scope `:214-220`.
- `docs/release/v2.1-em-alex-license-review.md` — provenance review; clearance assertion `:3-7`, asset identity `:34-58`, primary sources `:72-132`, assessment `:134-145`, notice text `:147-164`, unresolved questions `:166-180`, final status `:182-188`.
- `docs/release/v2.1-release-scope.md` — approved scope; pack composition `:41-58`, delivery architecture TBD `:78-80`, gap assessment `:105-126`.
- `docs/release/android-production-readiness.md` — narration gate description `:118-131`; licensing table `:520-545`.
- `artifacts/weather-app/android/daymark-voice/build.gradle` — release/debug flags `:22-35`; compiled gate `:58-95`.
- `artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/tts/NarrationVoicePolicy.java` — installed-voice selection `:60-72`; packaged voices `:74-82`.
- `artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/tts/KokoroLocalTtsEngine.java` — packaged voice materialisation `:147-148`; synthesis selection `:302-303`.
- `artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/packs/PackInstaller.java` — stage checks `:74-158`; payload handling `:131,190-196`; pack-id rule `:214-218`.
- `artifacts/weather-app/android/app/build.gradle` — licence asset copy `:81-100`; release narration gates `:104-171`; archive verification `:193-305`; archive-verifier tests `:431-442`.
- `artifacts/weather-app/android/app/src/debug/assets/licenses/MULTILINGUAL-VOICE-NOTICE.txt` — debug notice `:1-48`.
- `artifacts/weather-app/src/App.tsx` — footer `:266`; routes `:276-280`.
- `artifacts/weather-app/src/pages/privacy.tsx` — Kokoro narration disclosure `:119-126`, model bundling `:175`.
- `android/kokoro-poc/scripts/fetch-kokoro-assets.sh` — asset sources/hashes `:18-31`; staging `:55-70`.
- `android/kokoro-poc/README.md` — licence matrix `:191-206`, residual provenance item `:214-218`.
- `licenses/Apache-2.0.txt` — §2 `:66-72`, §3 `:73-88`, §4 `:89-129`, §6 `:138-140`.

### Public sources (accessed 2026-11-08)

- SIWIS DataShare record: <https://datashare.ed.ac.uk/handle/10283/2353>; full metadata: <https://datashare.ed.ac.uk/items/1de74991-eede-4b48-8fbe-6c2abaed88d8/full>; DOI: <https://doi.org/10.7488/ds/1705>.
- CC BY 4.0 legal code: <https://creativecommons.org/licenses/by/4.0/legalcode.en>; deed: <https://creativecommons.org/licenses/by/4.0/>.
- Apache License 2.0: <https://www.apache.org/licenses/LICENSE-2.0>.
- Kokoro-82M model card: <https://huggingface.co/hexgrad/Kokoro-82M>; raw card: <https://huggingface.co/hexgrad/Kokoro-82M/raw/main/README.md>.
- Kokoro voice list: <https://huggingface.co/hexgrad/Kokoro-82M/raw/main/VOICES.md>.
- ONNX Community conversion: <https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX>.
- pguso/kokoro repository: <https://github.com/pguso/kokoro>; metadata: <https://api.github.com/repos/pguso/kokoro>.

---

*This is a documentary and engineering audit, not legal advice. It records the evidence found at `3426bb4` and the evidence needed; it does not create or imply any licence or consent that is not documented.*
