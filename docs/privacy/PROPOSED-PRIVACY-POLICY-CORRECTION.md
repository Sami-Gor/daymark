# Proposed privacy-policy correction (Android V1 / V2)

- **Status: NOT DEPLOYED.** This is proposed source only. Nothing has been built, uploaded, or published from this branch.
- Prepared: 2026-11-04
- Branch: `docs/post-release-housekeeping-2026-11`
- Prepared by: Daymark post-release housekeeping
- Files under review:
  - `artifacts/weather-app/src/pages/privacy.tsx` (English, `/privacy`)
  - `artifacts/weather-app/src/pages/privacy-fr.tsx` (French, `/fr/privacy`)
  - `artifacts/weather-app/src/pages/privacy-es.tsx` (Spanish, `/es/privacy`)

## Why this exists

The policy currently served at `https://daymark-weather.pages.dev/privacy` is stale in two
material respects:

1. It describes Android 2.0.0 (V2) as a "candidate" that is "not fully released", and describes
   Android 1.0.0 (V1) as the "currently distributed" Android build. V2.0.0 has since been published
   as a GitHub release (tag `v2.0.0`, release published 2026-11-04).
2. It never states the full Android permission sets. It mentions the location permissions in prose
   but does not tell a reader which version has which declared permissions, so the V1/V2 change
   (V1 five permissions including precise location; V2 four permissions without
   `ACCESS_FINE_LOCATION`) is not legible from the live page.

This correction rewrites the three locale pages into a version-aware policy in which a reader can
identify which description applies to the installed version, while preserving every other accurate
disclosure in the live text.

## Authoritative-source finding

The live policy is a **compiled React bundle**, and its source is **not present in any git ref** of
this repository:

| Source | Effective date in source | Matches live? |
| --- | --- | --- |
| `main` branch heads, `artifacts/weather-app/src/pages/privacy*.tsx` | October 11, 2026 (V1-only) | No |
| Tag `v2.0.0` (commit `c371300b3908a8f9805078f26159ff1a44f6538a`) | October 27, 2026 (V2-aware) | No |
| Live site `/privacy`, `/fr/privacy`, `/es/privacy` | October 29, 2026 | — (baseline) |

Evidence for the live text is the captured bundle:

- `daymark-promotion/evidence/live-index-CnPIbPkk.js`
  (SHA-256 `c14e27ed0fee153a15ccd5b6d910c39705d116b8dda0f030368fc23928d9d894`).

The English, French, and Spanish policy functions were extracted **programmatically** with a Python
brace-matching / string-literal extractor (compiled functions `MS`, `LS`, and `zS` respectively),
not transcribed by eye. A `git grep` across all 429 commits reachable from all refs found **no
occurrence** of the live effective-date strings (`October 29, 2026`, `29 octobre 2026`,
`29 de octubre de 2026`) in any tracked file at any revision. This confirms the live policy source
has no matching git revision.

**Consequence:** the live bundle's strings are the only current evidence of what the live policy
says. This correction is therefore anchored on the captured live bundle (effective 2026-10-29) and
uses `v2.0.0:artifacts/weather-app/src/pages/privacy*.tsx` only as the **structural base** (layout
props, JSX style, section order), adding the V1-specific facts the live text introduced.

## What changed vs the live 2026-10-29 text

| # | Live 2026-10-29 text | Corrected source | Reason |
| --- | --- | --- | --- |
| 1 | Calls V2 "candidate" and says "V2 is not fully released"; calls V1 the "currently distributed" build. | V2.0.0 is a **published release** (tag `v2.0.0`, GitHub release 2026-11-04). V1 "may still be installed"; V1 installations are not deliberately disabled. No "candidate" wording anywhere. | V2.0.0 has shipped; the candidate framing is false. |
| 2 | Never enumerates Android permissions; only mentions `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` in location prose. | Adds a dedicated **"Android permissions by version"** section with explicit lists: **V1 (versionCode 1) five permissions** — `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`; **V2 (versionCode 2) exactly four permissions** — `INTERNET`, `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`. V2 is stated to declare no precise-location permission. | The V1→V2 permission change is the central accuracy correction and was missing from the live page. |
| 3 | No guidance on how to tell which policy description applies. | Adds **"Which version applies"** with the on-device check (Settings → Apps → Daymark → App info), the `versionCode 1` / `versionCode 2` mapping, and a statement that the deployed web/PWA uses V1 behaviour. | A version-aware policy must be actionable for the reader. |
| 4 | Says "Android and the V2 web/PWA snap … to a 0.025-degree grid", while also saying the current web/PWA does not use the grid. | Scopes the **0.025-degree grid to Android V2** and states the deployed web/PWA keeps two-decimal (~1 km) rounding. No claim that a V2 web/PWA build is deployed. | The live wording could imply a deployed V2 web/PWA; the grid and on-device engines are Android V2 behaviour. |
| 5 | V2 location paragraph leaves the precise/raw-fix point implicit. | Adds that V2 **does not receive a precise-location permission** and **never sends the raw device fix** to Open-Meteo. Retains the 0.025-degree grid, 0.025-degree minimum latitude step, longitude widening above roughly 67° to keep the cell ≥ 3 km², London ~2.8 km N/S × 1.7 km E/W (~4.8 km²), and the "reduces precision but does not anonymise" caveat. | Makes the privacy-relevant claim explicit and testable. |
| 6 | Headings say "Android V2 candidate voice input" and "Android V2 candidate narration". | Headings and prose say "Android V2 voice input (Ask Daymark)" and "Android V2 narration". Candidate framing removed throughout. | V2.0.0 is published. |
| 7 | Says French/Spanish narration "is planned for V2.2". | Removes the V2.2 plan from the page; states only that French/Spanish narration is **not available in Android V2**. | Do not present future-release plans as current capabilities. If a later release ships them, add a dated statement then. |
| 8 | Made no statement about Google Play distribution. | Says Google Play distribution of the verified release bundle is **tracked separately and is not verified on this page**; does not equate the GitHub release with a Play-served bundle. | The Play-served bundle/version is unverified and must not be implied to match the verified AAB. |
| 9 | "The Android V2 candidate is intended for adults…"; "The currently distributed V1 build was offered as a general-audience weather utility." | "Android V2 (Android 2.0.0, versionCode 2) is intended for adults…"; "The distributed V1 build was offered as a general-audience weather utility." | Aligns age section with published V2 and removable V1. |
| 10 | Effective date line: "Effective date: October 29, 2026 · Last updated: October 29, 2026". | **"Effective date: October 29, 2026 · Last updated: November 4, 2026"** in English, with matching French ("29 octobre 2026 · 4 novembre 2026") and Spanish ("29 de octubre de 2026 · 4 de noviembre de 2026"). | The live policy date is retained as the effective date; the source correction is dated by its last update. On actual deployment the effective date should be advanced to the deployment date. |

### Wording used for the permission change (all three locales)

English:

> V1 (Android 1.0.0, versionCode 1) declares five Android permissions: `INTERNET`,
> `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`.
>
> V2 (Android 2.0.0, versionCode 2) declares exactly four Android permissions: `INTERNET`,
> `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`.
>
> V2 does not declare or receive a precise-location permission.

French and Spanish carry the same statements ("cinq autorisations" / "exactement quatre" and
"cinco permisos" / "exactamente cuatro"), with the permission constants unchanged.

### Deliberately preserved from the live text

The following accurate disclosures were carried over in all three locales:

- Open-Meteo as an independent controller; `api.open-meteo.com`, `air-quality-api.open-meteo.com`,
  `geocoding-api.open-meteo.com`; 90-day troubleshooting logs that may contain coordinates;
  source-IP/URL request metadata; no IP-based identification by Daymark.
- Cloudflare Pages static hosting and standard request metadata; no fixed Cloudflare retention
  claim.
- GeoNames local locality dataset; no coordinates sent to GeoNames.
- Bundled Parakeet TDT 0.6B v3 int8, Kokoro, and sherpa-onnx runtime for Android V2.
- On-device storage: `daymark.locale`, and V2's `daymark.permissions` /
  `microphone-requested` flag; no location/search/transcript/weather history.
- Voice sections with the source-level/automated-test caveat (not packet-level verified).
- Security, age suitability, choices, and changes/contact sections.
- Operator and contact: Sami Belhadj, skylinelabdev@gmail.com.

## Deployment status

**NOT DEPLOYED.** No build was produced and nothing was uploaded to Cloudflare Pages, GitHub
Releases, or Google Play from this work. The repository pages are source only; the live site still
serves the stale 2026-10-29 compiled policy until a separate review and deployment happens.

Deployment is intentionally out of scope for this correction. When (if) it is deployed:

1. The effective date in all three locales should be advanced to the real deployment date (the
   current "Last updated: November 4, 2026" is the source-correction date, not a deployment date).
2. The build must be produced from a reviewed git revision and the deployed asset verified, because
   the current live deployment has no matching git revision.

## Remaining unresolved issues

1. **Play-served bundle / version discrepancy (unresolved).** The verified release AAB at tag
   `v2.0.0` has `versionCode 2` / `versionName 2.0.0` and exactly four permissions (no
   `ACCESS_FINE_LOCATION`). The bundle served by Google Play has **not** been independently
   verified. This policy therefore describes the published GitHub release and V1 while explicitly
   not equating them with a Play-served bundle. Resolution requires independent verification of the
   Play-served artifact; tracked separately.
2. **Deployment source is a manual direct upload outside git (unresolved).** The live policy text
   has no corresponding commit/tag in this repository, and the live deployment is a manual
   direct-upload build rather than a CI build from a git revision. Until the Cloudflare Pages project
   is pointed at a git source (or the direct-upload process is replaced), corrected source committed
   here will not automatically reach the live site. Deployment provenance is investigated separately
   in `CLOUDFLARE-DEPLOYMENT-REPORT.md`.
3. **Stale public text until deployment.** While this correction is undeployed, the live page still
   contains the "candidate / not fully released" framing and the incomplete permission disclosure.
4. **No packet-level zero-egress proof for V2 voice.** The voice section retains the source-level and
   automated-test caveat; it is not an independently verified packet-capture claim.
5. **French/Spanish narration future availability is not stated.** The page deliberately omits any
   date or release number for future narration support; add a dated statement only when a release
   actually ships it.

## Verification performed

- `pnpm run typecheck` in `artifacts/weather-app` (`tsc -p tsconfig.json --noEmit`) — passed with no
  errors, so all three TSX files parse and typecheck (including balanced JSX).
- Grep of each page confirms:
  - All four V2 permission names are present exactly: `INTERNET`, `ACCESS_COARSE_LOCATION`,
    `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`.
  - `ACCESS_FINE_LOCATION` appears only in **V1** contexts: the V1 declared-permission list and the
    V1 location prose. V2 is described as declaring no precise-location permission, so the
    constant is never presented as a V2 permission.
  - No "candidate" / "not fully released" wording remains.
  - "five permissions" wording appears only in the clearly labelled V1 sentence; V2 is described as
    "exactly four".
  - The only Google Play distribution statement says Play distribution of the verified release
    bundle is tracked separately and not verified on this page; nothing says Play serves the
    verified AAB.
  - No V2.2 or other future-release plan is presented as a current capability.
- All three locales keep the e2e-test-visible contract: `data-lang` values, headings, effective
  date prefixes (`Effective date` / `Date d’entrée en vigueur` / `Fecha de entrada en vigor`),
  operator "Sami Belhadj", and contact `skylinelabdev@gmail.com`.
- Diff size vs `HEAD`: 3 files changed, 575 insertions(+), 468 deletions(-).
