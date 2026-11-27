# Daymark privacy & Google Play reconciliation audit — 2026-11-26

**Auditor:** `privacy-audit` (independent sub-agent, task-249)
**Repository:** `Sami-Gor/daymark`
**Workspace:** isolated scratch clone (other agents' worktrees were not used)
**Candidate:** `release/v2-candidate` @ `15525b9be3fff04ac64a62d8059d702d6f84c4f0`
**`main`:** `6aafa15333101e39e61b7cc70f23431f122c82e0`
**Mode:** read-only remote Play/browser inspection. No Play declaration submitted, no page deployed, no signing/AAB/tag/secret change, no merge or push to `release/v2-candidate` or `main`.

---

## 0. Status at a glance

| Area | Result | Basis |
|---|---|---|
| V1 vs V2 source/manifests | **CONFIRMED** | cloned source + `bundletool` manifest dumps |
| Deployed `/privacy`, `/fr/privacy`, `/es/privacy` | **CONFIRMED (rendered)** | headless Chromium, 2026-11-26 |
| Public Play listing / Data safety summary | **CONFIRMED (public view)** | `play.google.com` public pages, 2026-11-26 |
| Play Console track inventory / saved answers / target audience | **UNVERIFIED** | no read-only Console access |
| Candidate source policy vs deployed policy | **MISMATCH** | four different policy texts identified |
| Play-served AAB bytes | **UNVERIFIED** | only local T5Backup AABs inspected |
| V1 speech/TTS provider transport | **UNVERIFIED** | no packet capture / provider evidence |

**Bottom line.** V2 source is internally consistent on location, voice and analytics. The live Play listing advertises **Daymark 2.0.0** (updated 2 Nov 2026), but the candidate/docs still describe V2 as unreleased, the deployed web policy still calls V2 a candidate, and the available V2 production AAB packages an older general-audience policy. The live Data safety summary now includes **Precise location** and **Voice or sound recordings** as collected and shared, which is only correct while V1 remains distributed; Console track inventory is the decisive unverified fact.

---

## 1. Access, limits and method

- **Play Console:** UNVERIFIED. CUA `getApp('com.google.Chrome')` and `getApp('829')` both returned `STALE_APP: Application executable changed during selection`; `cua.getCapabilities()` reported `accessibility: false`, `screenRecording: false`. No signed-in Play Console session could be read. No Console setting was changed.
- **Public Play pages:** verified through the bundled Playwright CLI (`~/.codex/skills/playwright/scripts/playwright_cli.sh`) with headless Chromium: store listing and `/store/apps/datasafety`.
- **Deployed pages:** SPA routes. Plain `curl` returns the same 2,115-byte app shell for every path (HTTP 200), so the rendered DOM was used rather than raw HTML.
- **Artifacts:** local T5Backup AABs inspected with `/Volumes/T5Backup/bundletool-all.jar` on JDK 21; packaged JS grepped for policy strings. These are local evidence artifacts, not proof of the bytes Google Play serves.
- **Not performed:** no packet capture, no device run, no live microphone session, no provider contact, no deploy, no Play edit.

---

## 2. Live Play state (public view, 2026-11-26)

Source: `https://play.google.com/store/apps/details?id=io.github.sami_gor.daymark&hl=en&gl=GB`

| Fact | Rendered value |
|---|---|
| App / developer | Daymark / Skylinelab |
| Downloads | 10+ |
| Updated on | **Nov 2, 2026** |
| Category | Weather |
| Content rating shown | **PEGI 3** |
| What's new | **“Daymark 2.0.0 introduces on-device voice input and offline English voice narration, alongside improved location privacy through approximate location handling.”** |
| Data safety summary — shared | **Location, Audio, and App activity** |
| Data safety summary — collected | **Location, Audio, and App activity** |
| Security practices | **Data is encrypted in transit**; **Data can’t be deleted** |

Source: `https://play.google.com/store/apps/datasafety?id=io.github.sami_gor.daymark&hl=en&gl=GB`

| Section | Publicly listed data types |
|---|---|
| **Data shared** | Location — **Approximate location and Precise location**; App activity — **In-app search history**; Audio — **Voice or sound recordings** |
| **Data collected** | Location — **Approximate location and Precise location**; App activity — **In-app search history**; Audio — **Voice or sound recordings** |
| **Security practices** | Data is encrypted in transit; Data can’t be deleted |

**Interpretation (bounded).** The public summary is consistent with a **combined V1+V2** form: Precise location and Audio are V1 behaviours; Approximate location and In-app search are common to V1 and V2. The summary does **not** prove the form was built as combined, nor which versionCode is live on each track. The public listing's “What's new 2.0.0” and “Updated on Nov 2, 2026” indicate that a 2.0.0 build has been published to a public track; the Console rollout state remains UNVERIFIED.

---

## 3. Deployed privacy pages (rendered, 2026-11-26)

| Route | Rendered title | Effective / last updated |
|---|---|---|
| `https://daymark-weather.pages.dev/privacy` | Privacy Policy — Daymark | **Effective date: October 29, 2026 · Last updated: October 29, 2026** |
| `https://daymark-weather.pages.dev/fr/privacy` | Politique de confidentialité — Daymark | **Date d’entrée en vigueur : 29 octobre 2026 · Dernière mise à jour : 29 octobre 2026** |
| `https://daymark-weather.pages.dev/es/privacy` | Política de privacidad — Daymark | **Fecha de entrada en vigor: 29 de octubre de 2026 · Última actualización: 29 de octubre de 2026** |

Key rendered English statements:

- “The web/PWA currently deployed is the V1 behaviour described below; the Android 2.0.0 (V2) candidate is described where it differs.”
- “V2 is not fully released. The web/PWA remains on V1 behaviour until a separate V2 web release is approved and deployed; the V2 voice and 0.025-degree location-grid changes described below do not apply to the current web/PWA.”
- “The web/PWA currently deployed includes the optional Ask Daymark microphone control and the ‘Hear today’ narration control. It uses the browser’s or device’s speech recognition and speech-synthesis services for those features.”
- “The currently distributed V1 build was offered as a general-audience weather utility.”
- Operator named as **Sami Belhadj** (candidate source says “Sami”).

**Deployed web app itself:** `https://daymark-weather.pages.dev/` renders **Ask Daymark** and **Hear today** controls and has **no** `web-demo-note` element — i.e. the deployed web build is V1 behaviour, consistent with its own Oct 29 policy and inconsistent with the candidate source policy (which says the web/PWA demo has no voice).

**Source provenance of the live text.** No reachable commit in the fresh clone contains the exact live line `Last updated: October 29, 2026` (`git log --all -S` produced no hit). The nearest committed candidate is branch `docs/post-release-housekeeping-2026-11` tip `981d0d1e67adce1301b6e9fc26a9c3cc909c2ee7` (2026-11-04), whose page says `Effective date: October 29, 2026 · Last updated: November 4, 2026` and states V2 was “published as a GitHub release on November 4, 2026”. That branch is **not** an ancestor of `main` (merge-base `02a07a17028e9c8931ee63b6a8a268fd221bb02c`) and **not** present on `release/v2-candidate`. The live page is therefore an unreproducible/stale deployment relative to the public repository history, or was deployed from an amended commit or manual build. This is recorded as a finding, not a conclusion about how it was deployed.

### Policy text inventory found

| Text | Where | Effective / updated | Distinguishing statement |
|---|---|---|---|
| V1 in-app | V1 `upload.aab` packaged JS | Effective **2026-09-11** | general-audience; “not specifically designed for children” |
| V1 source | `main` `privacy.tsx` | Effective **2026-10-11** | 2-decimal location; browser speech |
| V2 source | `release/v2-candidate` `privacy.tsx` / `-fr` / `-es` | Effective **2026-10-27** | web/PWA is a limited demo with **no** voice; Android V2 on-device Parakeet/Kokoro; **18+**; version 2.0.0 |
| V2 production AAB packaged | `v2-release-candidate/daymark-v2-2.0.0-production.aab` | Effective **2026-10-11**, last updated **2026-10-21** | general-audience; “not specifically designed for children”; mentions `ACCESS_FINE_LOCATION` and browser speech |
| Deployed web | `daymark-weather.pages.dev` | Effective/last updated **2026-10-29** | V1 web + “V2 candidate” hybrid; 18+ only for V2 |
| Docs branch tip | `docs/post-release-housekeeping-2026-11` `981d0d1` | Effective **2026-10-29**, last updated **2026-11-04** | says V2 “published as a GitHub release on 2026-11-04” |

---

## 4. V1 vs V2 source, manifests and dependencies

| Fact | V1 (released) | V2 candidate | Evidence |
|---|---|---|---|
| Branch / commit used | `main` @ `6aafa153…` | `release/v2-candidate` @ `15525b9b…` | `git rev-parse` |
| Android project | Capacitor `artifacts/weather-app/android` | same | tree |
| applicationId | `io.github.sami_gor.daymark` | same | `build.gradle` |
| versionCode / versionName | **1 / 1.0.0** | **2 / 2.0.0** | `build.gradle` + AAB manifest |
| minSdk / targetSdk / compileSdk | **24 / 36 / 36** | **29 / 36 / 36** | `variables.gradle` |
| Location permissions | `INTERNET`, `ACCESS_COARSE_LOCATION`, **`ACCESS_FINE_LOCATION`**, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | `INTERNET`, **`ACCESS_COARSE_LOCATION`**, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` — **no FINE** | manifest + bundletool |
| Location precision | `Number(coords.latitude.toFixed(2))` ≈ 1.1 km; below Play’s 3 km² approximate floor | `resolveDeviceLocation()`: 0.025° latitude grid; longitude widens to keep ≥3 km²; pole clamp | `App.tsx`, `location-privacy.ts` |
| Voice input | browser/WebView `SpeechRecognition` via `voice-input-browser.ts` | bundled Parakeet TDT 0.6B v3 int8 via sherpa-onnx, on device; no browser/Android recogniser fallback | source + `MainActivity` |
| Narration | English Kokoro native; FR/ES Android `SystemSpeechPlugin` (system TTS); browser speech synthesis on web | English Kokoro only; FR/ES unavailable with explicit message; no system/browser fallback | `speech-engine.ts`, `use-daymark-speech.ts` |
| Network destinations | 3 Open-Meteo hosts: `api.open-meteo.com`, `air-quality-api.open-meteo.com`, `geocoding-api.open-meteo.com` | same 3 hosts | `weather.ts` |
| Analytics/ads/crash/tracking SDK | none found in app dependencies | none found in app dependencies | `package.json`, lockfile grep |
| Local storage | `daymark.locale`; app caches | `daymark.locale`; `daymark.permissions` / `microphone-requested`; app caches | `i18n.ts`, Parakeet plugin |
| Web/PWA voice | present (browser speech) | absent; demo note “Web demo: weather only…” | `App.tsx`, `CurrentWeather.tsx` |
| Source policy effective date | 2026-10-11 | **2026-10-27** | `privacy*.tsx` |

**V1.1 note.** `release/v1.1` (`cc9635278bf5266a3f59c857df330ed98eb4d4b6`, 2026-09-11) is an ancestor of the candidate but is the older **TWA** project and has no `artifacts/weather-app/src/pages/privacy.tsx`; it is not the source of the versionCode 1 Play build. The released V1 Capacitor source is `main`, consistent with the actual `upload.aab` manifest.

**V2 native configuration.** Capacitor `server.androidScheme = https`, no remote `server.url`, `allowMixedContent: false`, `loggingBehavior: none`. The Parakeet model is delivered as a Play install-time asset pack (`assetPacks = [":parakeet-assets"]`).

---

## 5. Actual artifact inspection (local T5Backup)

| Artifact | Path | Manifest result | Packaged policy |
|---|---|---|---|
| V1 Play upload AAB | `/Volumes/T5Backup/Daymark/03-local-assets/sensitive/release-artifacts/google-play-upload/upload.aab` | package `io.github.sami_gor.daymark`, **versionCode 1 / versionName 1.0.0**, permissions INTERNET, COARSE, **FINE**, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS | Effective **2026-09-11**; general-audience; “not specifically designed for children” |
| V2 production AAB | `/Volumes/T5Backup/Daymark/v2-release-candidate/daymark-v2-2.0.0-production.aab` | package `io.github.sami_gor.daymark`, **versionCode 2 / versionName 2.0.0**, permissions INTERNET, **COARSE only**, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS | Effective **2026-10-11**, last updated **2026-10-21**; general-audience; “not specifically designed for children”; references `ACCESS_FINE_LOCATION` 6× and browser speech 2× |

**Artifact caveat.** The V2 AAB is dated 21 Oct 2026; the Play listing says “Updated on Nov 2, 2026”. The two are not proven to be the same bytes. What is proven: the only available V2 production AAB does **not** package the current 27 Oct candidate policy, does **not** state 18+, and still describes V1-era general-audience/browser-speech behaviour. Exact Play-served policy text is UNVERIFIED.

---

## 6. Data Safety declaration audit

Legend: **C** = confirmed by source/artifact/public page; **M** = mismatch; **U** = unverified (needs Console/legal/provider evidence); **N/A** = not applicable.

| Field | Live public answer (2026-11-26) | V1 combined expectation | V2-only expectation | Classification |
|---|---|---|---|---|
| Approximate location — collected | Yes | Yes | Yes | **C** |
| Approximate location — shared | Yes | Yes (Open-Meteo independent controller) | Yes (same) | **C** on public page; sharing rationale **U** (Play/legal exception) |
| Approximate location — optional | not public | Yes | Yes | **C** source |
| Approximate location — purpose | not public | App functionality | App functionality | **C** source |
| Approximate location — ephemeral | not public | No (Open-Meteo logs up to 90 days) | No | **C** provider notice |
| Approximate location — encrypted in transit | Yes (global) | V2 HTTPS; V1 weather/search HTTPS | Yes | **C** for Open-Meteo; global **U** via V1 speech |
| Precise location — collected | **Yes** | **Yes** (V1 FINE + 2 dp ≈1.1 km < 3 km²) | **No** (V2 COARSE only + 0.025° grid) | **C** for both per-version; live form **M** if V2 is the only distributed version |
| Precise location — shared | **Yes** | Yes | No | same |
| In-app search history — collected | Yes | Yes | Yes | **C** |
| In-app search history — shared | Yes | Yes | Yes | **C** on public page; rationale **U** |
| In-app search history — optional | not public | Yes | Yes | **C** |
| In-app search history — ephemeral | not public | No | No | **C** (query in URL; provider retention not query-specific) |
| Voice or sound recordings — collected | **Yes** | **Yes** (V1 browser/WebView recognition) | **No** (V2 on-device Parakeet; audio in memory) | **C** per-version; live form **M** if V2-only |
| Voice or sound recordings — shared | **Yes** | **Yes** (platform/browser speech provider), provider/retention **U** | No | **C** conservative for V1; provider transport **U** |
| Voice — optional | not public | Yes | Yes (mic optional) | **C** source |
| Voice — purpose | not public | App functionality | App functionality | **C** source |
| Microphone permission | not public | RECORD_AUDIO | RECORD_AUDIO | **C** manifest, both AABs |
| Local preferences | not listed | not a collection | not a collection | **C** source |
| IP / requested URL metadata | not listed as a type | provider receives it; Daymark does not use it to identify | same | **U** Play/legal classification; policy discloses it |
| Advertising | not listed | No | No | **C** no ad SDK |
| Encryption in transit — global | **Yes** | **U** (V1 speech/TTS transport not established) | Yes | **M/U** under combined scenario |
| Deletion | **Data can’t be deleted** | No account/backend record; local clear only; provider logs outside control | same | **C** implementation; policy wording must not imply provider deletion |
| Data sharing overall | **Yes** | Yes (Open-Meteo; speech provider) | Yes (Open-Meteo) | **C** public page |

**Critical scoping question.** Play’s Data safety form describes the **sum** of practices across versions currently distributed on non-internal tracks. The public form currently contains Precise location + Audio, i.e. V1 rows. That is correct **only if V1 is still distributed outside internal testing**. If the 2.0.0 build fully replaced V1 on production and no open/closed/staged track carries V1, those two rows are wrong and must become No. This exact track/version inventory is the one Console fact this audit could not read.

---

## 7. Discrepancy table

| ID | Severity | Finding | Evidence | Impact / owner action |
|---|---|---|---|---|
| **D1** | **P0** | Play listing advertises **Daymark 2.0.0** (updated 2 Nov 2026), while candidate docs and the deployed policy call V2 a “candidate”, “not fully released”. | public listing; live EN policy | Confusing/stale public disclosure; decide the true release state and update policy/docs or confirm the listing is a staged/preview state. |
| **D2** | **P0** | Live Data safety form lists **Precise location** and **Voice or sound recordings** collected/shared. V2 source has neither (COARSE only; on-device speech). Correct only if V1 remains distributed. | public data-safety page; V2 manifest/source | Must read Console track inventory and either keep combined rows or remove V1 rows for V2-only. |
| **D3** | **P0** | V2 production AAB packages **Effective 2026-10-11 / Last updated 2026-10-21** policy: general-audience, “not specifically designed for children”, references FINE location and browser speech. Candidate source is 2026-10-27, 18+, on-device speech. | AAB packaged JS grep | Android users of the 2.0.0 build may see a policy that does not describe V2 and contradicts the 18+ decision. Rebuild/republish from approved source; verify Play-served bytes. |
| **D4** | **P1** | Three/four policy texts diverge: deployed 2026-10-29, candidate source 2026-10-27, V2 AAB 2026-10-11/21, docs branch 2026-10-29/11-04, V1 2026-10-11 & 2026-09-11. | §3 inventory | Establish one source of truth per surface; deploy/build them together; set effective date to publication date. |
| **D5** | **P1** | Deployed web has Ask Daymark + Hear today (V1 behaviour), while candidate source policy says the web/PWA demo has **no** voice and candidate web build removes voice. | live DOM (`button-ask-daymark`, `button-hear-today` true; no demo note); candidate `App.tsx`/`CurrentWeather.tsx` | If V2 web is deployed, the current policy’s web statements become wrong; if not deployed, candidate source policy is ahead of the live site. Coordinate deploy + policy. |
| **D6** | **P1** | Owner target **18+** is not reflected in live Play content rating (**PEGI 3**) or the packaged V2 AAB policy (general-audience). Console target audience not readable. | public listing; AAB grep | Re-run/confirm content rating and target audience; align policy, listing and Console. |
| **D7** | **P1** | Public form says **encrypted in transit = Yes**; V1 browser speech/system TTS provider transport is not established. | docs + V1 source; no packet capture | Either evidence provider transport or scope form to V2-only; do not claim global Yes on unverified V1 paths. |
| **D8** | **P1** | No reachable commit contains the exact live `Last updated: October 29, 2026` line; nearest is docs branch `981d0d1` (last updated 11-04). | `git log --all -S` | Deployment provenance untracked; adopt a deployment-from-tagged-commit process or record the artifact SHA. |
| **D9** | **P2** | Open-Meteo is an independent controller per its notice; the public form now says data is shared, but no written Play/legal sharing analysis is in the repo. | provider notice; public page | Record the sharing rationale and retain it with the declaration. |
| **D10** | **P2** | IP/network metadata: policy discloses it, but no Play data type is selected. | policy source; public form | Resolve with Play/legal; do not guess. |
| **D11** | **P2** | V2 source privacy page names operator “Sami”; deployed page says “Sami Belhadj”. | source vs live | Non-privacy-critical; align for accuracy. |
| **D12** | **P2** | `docs/release/play-console-checklist.md` and `data-safety-v1-v2.md` still say the public routes rendered 11 Sep text and the public form said “No data shared”; live now shows 29 Oct text and a sharing-inclusive form. | docs vs live | Docs stale; corrected in draft PR. |

---

## 8. Classification summary

**Confirmed (C):**
- V1 AAB is versionCode 1 / 1.0.0 with FINE + COARSE; V2 AAB is versionCode 2 / 2.0.0 with COARSE only.
- V1 sends 2-decimal coordinates; V2 applies a 0.025° latitude-aware grid with ≥3 km² longitude widening.
- V1 voice input uses browser/WebView recognition and FR/ES system TTS; V2 uses on-device Parakeet + Kokoro with no system/browser fallback registered.
- Both versions use only the three Open-Meteo hosts; no analytics/ads/crash/tracking SDK found.
- Deployed `/privacy`, `/fr/privacy`, `/es/privacy` all render effective 29 Oct 2026; deployed web has V1 voice controls.
- Public Play Data safety summary lists Location (Approx + Precise), App activity (In-app search), Audio (Voice), collected and shared; encrypted; can’t be deleted.

**Mismatch (M):** D1–D8 above. Most material: V2/live release-state narration; combined-form rows vs V2-only source; V2 AAB packaging old general-audience policy; web voice vs candidate source; 18+ vs PEGI 3/general-audience.

**Unverified (U):**
- Play Console track inventory, rollout status, per-track versionCode, saved Data Safety answers, target-audience declaration, content-rating questionnaire.
- Exact bytes Google Play serves (AAB inspected is local only).
- V1 browser speech/system TTS provider transport, retention and sharing path.
- Open-Meteo role under Play’s sharing definition; IP-address data-type classification.
- Any packet-level zero-egress claim for V2 speech.

---

## 9. Remediation order

**P0 — before any further declaration, submission or store-text change**
1. **Read the Console track inventory** (production/open/closed/internal/staged: versionCode, versionName, rollout %). Decide whether the form is **combined V1+V2** or **V2-only**. Do not guess. *Owner/Console operator.*
2. **Fix the Android in-app policy before the next AAB**: rebuild from the approved source so the packaged policy matches 2.0.0 (on-device speech, coarse location, 18+ if that remains the decision). Verify by re-dumping the built AAB and grepping the policy strings. *Android release owner.*
3. **Resolve D1/D2**: if 2.0.0 is live and V1 is gone from non-internal tracks, remove Precise location and Audio rows (V2-only). If V1 remains, keep them and document the combined basis. *Owner + Play/legal.*
4. **Align target audience / content rating / policy**: 18+ decision vs PEGI 3 vs general-audience packaged text. Re-run content rating and update Console target audience, then make policy and listing agree. *Owner.*

**P1 — before treating the public privacy URL as release-accurate**
5. Deploy a single policy text that matches the actually deployed web build and the actually served Android build; set effective date and last-updated to the real publication date.
6. Evidence V1 speech/TTS transport or remove the combined V1 encryption claim; then finalize the global encryption answer.
7. Record Play/legal rationale for “shared” (Open-Meteo independent controller) and for IP metadata.

**P2 — documentation hygiene**
8. Update the stale docs (`play-console-checklist.md`, `data-safety-v1-v2.md`, `version-2-privacy-hardening.md`) with the 2026-11-26 live facts (draft PR attached to this audit).
9. Adopt deployment provenance: deploy a tagged commit and record the deployed commit SHA next to the policy effective date.

---

## 10. Exact recommended answers and changes

### 10.1 Decide the form scope first

| If Console shows… | Then the form is… | Precise location | Voice or sound recordings |
|---|---|---|---|
| V1 (versionCode 1) on any non-internal track | **Combined V1+V2** | **Collected/Shared = Yes** | **Collected/Shared = Yes** |
| Only V2 (versionCode 2) on all non-internal tracks | **V2-only** | **Collected = No** | **Collected = No** |

### 10.2 Recommended Data Safety values — combined V1+V2 (V1 still distributed)

| Data type / field | Recommended answer |
|---|---|
| Approximate location | Collected **Yes**; Shared **Yes**; Optional **Yes**; Purpose **App functionality**; Ephemeral **No**; Encrypted in transit **Yes** (Open-Meteo HTTPS) |
| Precise location | Collected **Yes**; Shared **Yes**; Optional **Yes**; Purpose **App functionality**; Ephemeral **No**; Encrypted in transit **Yes** (Open-Meteo HTTPS) |
| In-app search history | Collected **Yes**; Shared **Yes**; Optional **Yes**; Purpose **App functionality**; Ephemeral **No**; Encrypted in transit **Yes** |
| Voice or sound recordings | Collected **Yes**; Shared **Yes** (V1 browser/WebView speech; system TTS); Optional **Yes**; Purpose **App functionality**; Ephemeral **No**; Encrypted in transit **U — do not claim Yes until V1 provider transport is evidenced** |
| Advertising / ads | **No** |
| Deletion | **Data can’t be deleted** (no account/backend record; policy explains local clearing and provider retention) |
| Encryption in transit (global) | **U** until V1 speech/TTS transport is evidenced; V2 Open-Meteo is HTTPS |

### 10.3 Recommended Data Safety values — V2-only (V1 no longer distributed)

| Data type / field | Recommended answer |
|---|---|
| Approximate location | Collected **Yes**; Shared **Yes**; Optional **Yes**; Purpose **App functionality**; Ephemeral **No**; Encrypted in transit **Yes** |
| Precise location | **No** (COARSE only + 0.025° grid) |
| In-app search history | Collected **Yes**; Shared **Yes**; Optional **Yes**; Purpose **App functionality**; Ephemeral **No**; Encrypted in transit **Yes** |
| Voice or sound recordings | **No** collected; **No** shared (Parakeet audio in memory, no server; Kokoro on-device) |
| Advertising / ads | **No** |
| Deletion | **Data can’t be deleted** (no account) |
| Encryption in transit (global) | **Yes** (all Daymark-initiated requests HTTPS) |

### 10.4 Policy text changes

1. **One source of truth.** The candidate source (`release/v2-candidate` `privacy.tsx`, `privacy-fr.tsx`, `privacy-es.tsx`, effective 2026-10-27) is accurate for the **candidate V2 build** (no web voice, on-device speech, 18+) but is **not** what the deployed site or the available V2 AAB package. Do not publish it as “live” until the V2 web build is deployed and a matching AAB is built.
2. **If V2 web is deployed:** deploy the candidate text, update the effective/last-updated date to the actual deploy date, and keep the “web/PWA demo has no voice” statement.
3. **If V1 web remains deployed:** keep the 29 Oct deployed text’s V1 web description, but replace “V2 candidate / not fully released” with the true Play state (2.0.0 published) and reconcile the Android section with the served AAB.
4. **Android:** rebuild the AAB so the packaged policy is the approved text. The available V2 AAB’s packaged 2026-10-11/21 general-audience text is not acceptable for a V2/18+ release.
5. **Operator name:** use one legal/operator name consistently (currently “Sami” vs “Sami Belhadj”).
6. **Do not set an effective date earlier than the actual publication date**; do not claim a deploy that did not happen.

### 10.5 Target audience / content rating

- If the owner keeps **18+ only**: enter 18+ in Console, re-run the content-rating questionnaire (PEGI 3 is inconsistent with an adult-only target), and update the packaged policy (currently general-audience). Record that this is a declaration, not an age gate.
- If the owner reverts to general audience: update the candidate policy/source and docs, and do not claim 18+.

### 10.6 Docs changes recommended (draft PR)

- `docs/release/data-safety-v1-v2.md`: add 2026-11-26 addendum with live Play/data-safety facts and the four-text divergence; the existing “public still shows 11 Sep / no data shared” statements are stale.
- `docs/release/play-console-checklist.md`: add 2026-11-26 verification block; correct the public-policy and public-Data-safety status; keep Console rows open/UNVERIFIED.
- Add this report as `docs/release/privacy-play-audit-2026-11-26.md`.

---

## 11. Official Google Play policy citations

Verified reachable (HTTP 200) on 2026-11-26:

1. Google Play Console Help — **Provide information for Google Play's Data safety section** (collection, sharing, ephemeral processing, encryption, deletion, version-sum rule): <https://support.google.com/googleplay/android-developer/answer/10787469>
2. Google Play Console Help — **User Data** (transparency, consent, sensitive data): <https://support.google.com/googleplay/android-developer/answer/10144311>
3. Google Play Console Help — **Manage target audience and app content settings**: <https://support.google.com/googleplay/android-developer/answer/9867159>
4. Google Play Console Help — **Families policy / child-directed content**: <https://support.google.com/googleplay/android-developer/answer/9893335>

Provider evidence: Open-Meteo Terms & Privacy <https://open-meteo.com/en/terms> (independent controller; troubleshooting logs may contain coordinates; deleted after 90 days). Cloudflare privacy policy <https://www.cloudflare.com/privacypolicy/>. These are provider statements, not Google rules.

---

## 12. Repository change / draft PR

- Branch: `docs/privacy-play-audit-20261126` (created from `release/v2-candidate` @ `15525b9b…`).
- Scope: docs-only corrections + this audit report. No privacy-policy source text was changed, no deploy, no Console edit, no merge.
- Draft PR target: `release/v2-candidate`.
- PR URL: *recorded in the final report to the lead; see PR body.*
- Files: `docs/release/privacy-play-audit-2026-11-26.md`, `docs/release/data-safety-v1-v2.md`, `docs/release/play-console-checklist.md`.

---

## 13. Blockers and owner decisions

**Blockers (cannot be resolved from this workspace)**
1. Play Console read-only access (track/version inventory, saved Data Safety answers, target audience, content rating, rollout). The decisive fact for combined-vs-V2-only.
2. Exact Play-served AAB bytes/versionCode (local AAB is an Oct 21 snapshot).
3. V1 browser/WebView speech and Android system-TTS provider transport/retention evidence.
4. Play/legal ruling on Open-Meteo “sharing” and IP-metadata data type.

**Owner decisions needed**
1. Is V1 still distributed on a non-internal track? → combined vs V2-only form.
2. Is the 2.0.0 Play listing the final production release or a staged/preview rollout? → policy release-state wording.
3. Keep 18+ or revert to general audience? → Console target audience, content rating, policy text.
4. Approve rebuilding the Android AAB with the current policy and publishing it (cannot be done in this read-only audit).
5. Approve deploying the reconciled web policy (cannot be done in this read-only audit).

---

## 14. Evidence commands and paths

```bash
# Workspace / candidate
cd /Users/m1/daymark-ws-privacy
git rev-parse HEAD                       # 15525b9be3fff04ac64a62d8059d702d6f84c4f0
git rev-parse origin/main                # 6aafa15333101e39e61b7cc70f23431f122c82e0
git rev-parse origin/release/v1.1        # cc9635278bf5266a3f59c857df330ed98eb4d4b6

# V1 vs V2 facts
git show origin/main:artifacts/weather-app/android/app/src/main/AndroidManifest.xml | grep uses-permission
grep uses-permission artifacts/weather-app/android/app/src/main/AndroidManifest.xml
git show origin/main:artifacts/weather-app/src/App.tsx | grep -n 'toFixed(2)'
grep -n 'resolveDeviceLocation' artifacts/weather-app/src/App.tsx

# Artifact manifests
java -jar /Volumes/T5Backup/bundletool-all.jar dump manifest --bundle=/Volumes/T5Backup/Daymark/03-local-assets/sensitive/release-artifacts/google-play-upload/upload.aab
java -jar /Volumes/T5Backup/bundletool-all.jar dump manifest --bundle=/Volumes/T5Backup/Daymark/v2-release-candidate/daymark-v2-2.0.0-production.aab

# Deployed pages (rendered; raw curl is only the 2,115-byte SPA shell)
PWCLI=$HOME/.codex/skills/playwright/scripts/playwright_cli.sh
$PWCLI open https://daymark-weather.pages.dev/privacy
$PWCLI snapshot
# Public Play store listing and Data safety
$PWCLI open 'https://play.google.com/store/apps/details?id=io.github.sami_gor.daymark&hl=en&gl=GB'
$PWCLI open 'https://play.google.com/store/apps/datasafety?id=io.github.sami_gor.daymark&hl=en&gl=GB'
```

*End of report. Values above are taken from the cited evidence; where evidence was unavailable the item is marked UNVERIFIED rather than inferred.*
