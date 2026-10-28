# Google Play launch checklist — Daymark

Companion to [`android-production-readiness.md`](android-production-readiness.md)
(§2 Play requirements, §3 Asset Links, §10 data map, §20 matrix, §21 release
sequence).

**Status (27 October 2026):** The maintainer reports that Daymark has moved to
production. The public Play storefront was readable on 21 October 2026, but the
**Play Console dashboard was not accessible read-only** — `play.google.com/console`
redirected to the public marketing page and no signed-in session was present.
This repository therefore holds no Console export or rollout record. The public
listing says "Updated on Oct 20, 2026", shows 10+ downloads and PEGI 3, and its
**V1-era saved** Data safety page declares Approximate location, Voice or sound
recordings and In-app search history, all Optional / App functionality, with
**no data shared** and **data can't be deleted**. The V1 source sends a
two-decimal coordinate and declares `ACCESS_FINE_LOCATION`, so the saved
Approximate-only/no-sharing answers appear inaccurate; see
[`data-safety-v1-v2.md`](data-safety-v1-v2.md). The highest uploaded version
code is not visible on the public listing; record it from the Console when
access is available. The owner has settled the V2 target at **Ages 18+ only**,
but that target and the Data Safety correction are **not entered in Console**.
The public PEGI 3 label is a content rating, not an 18+ target-audience
declaration; do not treat either as verified enforcement. The website deployment,
by contrast, is independently verifiable — see §6. Remaining work in this
checklist is the V1/V2 Data Safety reconciliation before any submission.
Core physical-device testing is already complete; the wider matrix is optional
additional QA, not a requirement to repeat it.

Package: `io.github.sami_gor.daymark` · released V1: versionCode `1` /
versionName `1.0.0`, minSdk `24`, targetSdk `36` · V2 candidate: versionCode
`2` / versionName `2.0.0`, minSdk `29`, targetSdk `36`
Origin: `https://daymark-weather.pages.dev` (Cloudflare Pages)
Architecture: React/Vite → Capacitor Android (`artifacts/weather-app/android`;
the repo-root `android/` is the frozen TWA rollback/history project)
First submitted artifact: `app-release.aab` — SHA-256
`309abe94f4c4f572fe1a478e5b517e76e17c1e49a2e45e9cb90d4571747b89b5`,
96,463,981 bytes.

**Document scope.** This checklist covers the **released v1.0.0** build that is
currently distributed and the **unreleased V2 candidate** on
`release/v2-candidate`. V2 changes the location permission, coordinate precision
and Android speech path, so its answers differ for location and voice input.
Those differences are stated inline. V2 is not released; until it fully
replaces V1, the final global Data safety declaration must describe both
currently distributed practices.

## 0. Pre-flight (local)

- [x] Upload keystore present: canonical `android/daymark-upload.keystore`
      (alias `daymark-upload`), referenced by
      `artifacts/weather-app/android/keystore.properties`; both gitignored.
      SHA-256
      `34:6B:BE:F3:43:8C:6F:E8:1E:89:F6:3F:C0:A0:FF:29:E9:6D:A1:98:98:74:E6:BA:18:7A:9E:52:C3:AA:FA:7E`.
      Historical: the pre-rotation key `3C:60:AD:…:20:57` is retired and no
      longer signs builds.
- [ ] Keep the offline keystore + password backup confirmed in safe storage.
      Losing them requires a Play key-reset request.
- [ ] Record whether the developer account is personal or organisation only
      if relevant to the Console application. The maintainer reports that Apply
      for production is available, so do not treat the 12-testers / 14-continuous-
      days period as a pending task unless the live Console explicitly shows an
      eligibility warning.
- [x] AAB built from merged `main` and uploaded (metadata above). Rebuild
      command kept for reference:

```bash
cd artifacts/weather-app
pnpm install              # fresh clone only
pnpm build
pnpm exec cap sync android
cd android
# macOS + Homebrew example; on other systems, set JAVA_HOME to your JDK 21 path
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew :app:bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

On a clean clone, run the Kokoro JNI + asset steps from
`android-production-readiness.md` §1 first.

## 1. Create the app — DONE (maintainer-reported)

- [x] Play Console → **All apps → Create app**: name `Daymark`, default
      language English (US), type App, Free.
- [x] Accept the developer program policies.

## 2. App content declarations — PREVIOUSLY REPORTED DONE; V2 AUDIT OPEN

Play Console → **Policy and programs → App content**. Rows below were previously
completed for the released V1 declaration; the V2 target and Data Safety
updates have **not** been entered in Console.

- [x] Privacy policy URL: `https://daymark-weather.pages.dev/privacy`.
- [x] App access: **All functionality is available without special access**
      (no login).
- [x] Ads: **No ads** (advertising ID = No).
- [x] Content rating questionnaire (weather utility, no user content, no ads).
- [x] Target audience was previously completed for the released V1 declaration.
- [ ] **V2 target audience: Ages 18+ only.** This is the owner-settled target
      plan and is not yet entered in Console. No child age groups are selected;
      the Families child-audience process is not part of this declared target.
      Do not claim that an age gate or Restrict Minor Access is implemented.
- [ ] **Audience declaration is not an access control.** The 18+ setting is a
      Google Play declaration; it does not prove minors cannot access the app.
      Assess the UK Children's Code / Age Appropriate Design Code separately
      where applicable; selecting 18+ does not by itself resolve UK privacy
      obligations.
- [x] **In-app content is not child-directed.** The weather utility has no
      child-directed characters, activities, rewards or advertising, so the
      Google Play Families child-targeting process is not a separate blocker
      for the 18+ design, subject to final store-listing/content-rating review.
      This is not a claim of Families approval or legal exemption.
- [x] **Open-Meteo / Families is not a separate child-targeting blocker for
      this adult-only design.** The provider's published terms are still silent
      on child-directed use; do not claim approval or prohibition and do not
      contact the provider. Reassess if the audience changes or a regulator
      treats the service as likely to be accessed by children.
- [x] Government apps: No · Financial features: No · Health: No · News: No.
- [x] Data safety form was previously reported complete. The saved answers are
      still V1-era and must be reconciled before V2 submission.
- [ ] **Data Safety global form.** Google Play requires the **sum** of practices
      across all versions currently distributed on production, open and closed
      testing tracks (internal-testing-only artifacts are exempt). V1 remains
      distributed until the full V2 production release. Do not label the final
      form “V2-only.”
- [ ] **Only Console fact — V1 track/version inventory:** record the highest
      versionCode/versionName and release status on every production, open,
      closed and staged rollout track. V1 source evidence is on `main` at
      `44fd211` and the physical-test source at `69e21c`; neither is proof of
      the artifact currently served.
- [ ] **V1 speech/provider evidence:** establish whether V1 browser/WebView
      recognition and system TTS transport audio/text off-device, and the
      provider/retention path, before finalizing V1 audio sharing or global
      encryption.
- [ ] **Deletion:** no dedicated data-deletion mechanism is implemented. Daymark
      has no accounts, backend user record, or location/search history. Clearing
      local app/browser storage does not delete Open-Meteo provider logs.
- [ ] **Public policy deployment:** the source policy now describes V2 and the
      18+ audience, but the public `/privacy`, `/fr/privacy` and `/es/privacy`
      routes still rendered the older 11 September 2026 policy on 27 October
      2026. Do not treat the deployed policy as current until it is published.
- [ ] **Packaged policy:** the local debug AAB/APK still contain old
      `suitable for children and adults` policy text. They are debug artifacts,
      not release candidates. Rebuild from the approved source; do not edit
      generated assets manually.

### V2 Data Safety / location / voice checklist

- [ ] **Approximate location — Collected = Yes.** After explicit location
      action and permission, V2 sends the coarse fix after the on-device
      latitude-aware grid (0.025° minimum step; longitude widens to preserve
      3 km²) to Open-Meteo. Default London is a fixed place.
- [ ] **Approximate location — Shared = Yes, provisionally.** Open-Meteo is an
      independent controller; the current UI has no specific pre-action
      third-party disclosure. A “No” answer requires a documented Play
      exception and legal review.
- [ ] **Approximate location — Optional = Yes; purpose App functionality;
      Ephemeral = No** because Open-Meteo’s published troubleshooting logs may
      retain coordinates for 90 days.
- [ ] **In-app search history — Collected = Yes; Shared = Yes, provisionally;
      Optional = Yes; purpose App functionality; Ephemeral = No.** Typed
      `name` is sent to Open-Meteo geocoding; Daymark does not retain a search
      history. Do not call it stored history.
- [x] **Voice or sound recordings — V2-only: Collected = No; Shared = No.**
      Parakeet runs on-device; no system/browser/remote speech path is
      registered. Source/data-flow regression tests establish the boundary.
      Packet capture is not a standalone gate; no universal zero-traffic claim
      is made.
- [ ] **Local preferences — not a Data Safety collection.** `daymark.locale`
      and Android `daymark.permissions`/`microphone-requested` remain on-device.
- [ ] **Precise location — V2 = No.** Android declares only
      `ACCESS_COARSE_LOCATION`; the latitude-aware grid is applied before
      requests. V1 still requires a precise-location row while it remains
      distributed.
- [ ] **IP/network metadata:** disclose Open-Meteo’s receipt of source IP/URL
      metadata in the policy. Do not guess a Play data type; resolve with
      Play/legal if the final form requires one.
- [ ] **Encryption in transit:** V2 Open-Meteo requests use HTTPS. Do not
      finalize a global Yes while V1’s speech/TTS transport is unknown.
- [ ] **Target audience/content rating/Data Safety consistency:** confirm all
      three agree before submission. Console has not been edited.

## 3. Store listing — DONE (maintainer-reported; default store listing)

- [x] App name, short description, full description, graphics (512×512 icon,
      1024×500 feature graphic), phone screenshots, category (Weather), contact
      email.
- [x] Default store listing completed.

## 4. First upload — DONE (maintainer-reported)

- [x] AAB uploaded (`309abe94…`, 96,463,981 bytes); versionCode `1` for the
      first upload (bump for every later upload).
- [x] Play App Signing enrollment completed on this first upload (Play
      generated the app signing key). Its fingerprint is recorded in step 5
      and is live in the production association file.

## 5. Copy the Play app-signing fingerprint — DONE (recorded; Console-side state not independently verified)

- [x] Play Console → **Test and release → Setup → App integrity → Play app
      signing → App signing key certificate** → **SHA-256**
      `04:3C:41:E1:C9:EC:F5:B5:2C:17:6C:5D:AE:1C:28:8A:10:B0:F8:67:95:6F:6F:C9:F5:3D:98:73:08:5E:9F:FA`
      (the key Play uses to re-sign the AAB, *not* the upload key).
- [x] Do not substitute the upload-key fingerprint
      (`34:6B:BE:F3:43:8C:6F:E8:1E:89:F6:3F:C0:A0:FF:29:E9:6D:A1:98:98:74:E6:BA:18:7A:9E:52:C3:AA:FA:7E`)
      for the app-signing fingerprint in `assetlinks.json`.
      They are different keys with different roles. Both fingerprints are
      present in the live file (Play signing first, upload second for
      sideloaded builds).

## 6. Confirm Digital Asset Links on the existing website — DONE (live, verified)

The website at `https://daymark-weather.pages.dev` is already deployed; this
step is **not** asking you to deploy a website from scratch. The production
endpoint is live and verified:

- URL: `https://daymark-weather.pages.dev/.well-known/assetlinks.json`
- HTTP status: `200`
- Content-Type: `application/json` (not the app HTML fallback)
- Package: `io.github.sami_gor.daymark`
- Fingerprints: Play app-signing
  `04:3C:41:E1:C9:EC:F5:B5:2C:17:6C:5D:AE:1C:28:8A:10:B0:F8:67:95:6F:6F:C9:F5:3D:98:73:08:5E:9F:FA`
  plus upload-key
  `34:6B:BE:F3:43:8C:6F:E8:1E:89:F6:3F:C0:A0:FF:29:E9:6D:A1:98:98:74:E6:BA:18:7A:9E:52:C3:AA:FA:7E`.
- The fix was preserved in PR #35, merged into `main` (merge commit
  `8f85a96610703b43a5131f8841e2d490913851de`).

- [x] Live response and content verified (HTTP 200, `application/json`,
      correct package and both fingerprints). No further website change is
      needed for this fix.

For future verification and troubleshooting (website already deployed; do not
redeploy from scratch):

```bash
curl -sI https://daymark-weather.pages.dev/.well-known/assetlinks.json | head -5
curl -s https://daymark-weather.pages.dev/.well-known/assetlinks.json
```

Historical record of how the file was created (already done; retained for
reference, not as a pending task): the `artifacts/weather-app/public/.well-known`
directory was created, `docs/release/assetlinks.template.json` was copied to
`artifacts/weather-app/public/.well-known/assetlinks.json` with
`__PLAY_APP_SIGNING_SHA256__` replaced by the step-5 fingerprint (upload-key
entry kept second for sideloaded builds), and
`artifacts/weather-app/public/_headers` gained:

```
/.well-known/assetlinks.json
  Content-Type: application/json
```

That site update went through the normal Cloudflare Pages deployment workflow.

## 7. Verify App Links — website side DONE; on-device domain verification NOT TESTED (optional)

- [x] Google's Digital Asset Links statement API returned the expected
      association statements for this package and both fingerprints:

```bash
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://daymark-weather.pages.dev&relation=delegate_permission/common.handle_all_urls"
```

- [ ] **Android on-device domain verification has not been independently
      tested and is not claimed as complete.** It is optional additional
      verification, distinct from the completed core physical-device test pass.
      If wanted, on a device with a build signed by one of the listed keys
      (Play-signed install, or the repo's release APK signed with the upload
      key):

```bash
adb shell pm verify-app-links --re-verify io.github.sami_gor.daymark
adb shell pm get-app-links io.github.sami_gor.daymark     # check daymark-weather.pages.dev
adb shell am start -a android.intent.action.VIEW -d "https://daymark-weather.pages.dev/privacy"
adb shell am start -a android.intent.action.VIEW -d "https://daymark-weather.pages.dev/fr/privacy"
```

      Cold/warm opens likewise remain optional additional coverage, not a
      repeat of the completed core device pass.

## 8. Closed testing — COMPLETE (maintainer-reported); production — MAINTAINER CONFIRMED

- [x] Closed-testing phase complete (maintainer-reported).
- [x] Daymark has moved to production (maintainer-confirmed, 13 October 2026).
- [ ] Record the next Console verification — the date, the release status and
      who checked it — in this document, so the production status stops being
      an assertion. The live Console state is not independently verified in
      this repository.

## 9. Post-release housekeeping

- [ ] Reconcile Data safety for the shipped location and voice-input behaviour.
      Correct the form if it does not match what the app transmits and what
      third-party providers retain. Follow the guidance in §2 and the official
      [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-GB).
- [x] Website Digital Asset Links endpoint verified live per steps 5–7
      (HTTP 200, `application/json`, correct package and both fingerprints;
      DAL API returns the expected statements; fix preserved in PR #35 merge
      `8f85a96610703b43a5131f8841e2d490913851de`). This affects verified
      website links opening in the app, not the fact that Daymark is in
      production. On-device domain verification remains optional and untested
      (see §7).
- [ ] Before any policy publication, deploy the revised web build, include the
      same policy in a new Android bundle, and set the effective date to the
      actual publication date. The already-uploaded AAB and the public
      `/privacy` page do not contain these source edits.
- [ ] Monitor Android vitals for ANRs/crashes, especially memory-related kills
      on lower-RAM devices. Additional device-matrix tests are optional QA, not
      a requirement to repeat the completed core device pass.
- [ ] Keep the local TWA rollback reference until the production rollout is
      stable. The tag `pre-capacitor-daymark` is not published to GitHub; a
      fresh clone can use reachable rollback commit
      `ff496996fcf9b47d9524d81ac300e69c2974c805`.

## 10. Follow-ups (non-blocking)

- [ ] Native debug symbols were **not** uploaded with the first AAB; the upload
      warning was recorded as expected and non-blocking for that submission.
      Configure/upload them for the **next** Android release (for example, set
      the release `ndk.debugSymbolLevel` or upload the symbols archive). Check
      the current Console message before a new submission; this note does not
      replace any release-specific requirement shown there.
- [ ] Every new Android bundle: rebuild the AAB and increment `versionCode`
      in `artifacts/weather-app/android/app/build.gradle`; verify the next
      unused value in Play Console rather than assuming the prior value.
- [ ] **Privacy-policy publication sync:** the three policy source pages now state
      the Android on-device Parakeet path, distinguish it from the web/PWA
      no-voice web demo, disclose that grid-rounded location and typed
      geocoding/weather requests are sent to Open-Meteo, state the
      V2 French/Spanish unavailable state, and carry a version
      note for 1.0.0 users. Those edits are not live: the public policy routes
      still showed the 11 September 2026 text on 21 October 2026 (and again on
      27 October 2026), and the edits are not in the already-uploaded AAB. Before using this revised wording,
      deploy the web build and rebuild the Android bundle so the bundled policy
      matches. Increment `versionCode` to the next unused value (expected `2` if
      `1` is still the latest upload), confirm the three policy pages match and
      set the effective date (and the "last updated" date) to the actual
      publication date. Do not claim the revised wording is live before the
      website deployment and Android release are complete.
- [ ] Never remove fingerprints from `assetlinks.json` (sideload verification
      breaks); replace only if you rotate a key.
- [ ] If the origin changes, update the intent filter host in
      `artifacts/weather-app/android/app/src/main/AndroidManifest.xml`, the
      `resolveDeepLink()` allow-list, and assetlinks.json together.
