# Google Play launch checklist — Daymark

Companion to [`android-production-readiness.md`](android-production-readiness.md)
(§2 Play requirements, §3 Asset Links, §10 data map, §20 matrix, §21 release
sequence).

**Status (13 October 2026):** The maintainer reports that Daymark has moved to
production. That production status is **maintainer-reported**: this repository
holds no Play Console export, rollout record or store-listing capture that
independently verifies it, and the assertions below about completed Console
actions carry the same status. The website deployment, by contrast, is
independently verifiable — see §6. When the Console is next checked, record the
result and date here so the status stops being an assertion. Remaining work in this checklist is post-release housekeeping: correct
the Data safety declaration if it does not describe the shipped behaviour, and
check the existing Digital Asset Links endpoint if verified website links are
expected to open the app. Core physical-device testing is already complete;
the wider matrix is optional additional QA, not a requirement to repeat it.

Package: `io.github.sami_gor.daymark` · versionCode `1` / versionName `1.0.0`
· minSdk `24` / targetSdk `36`
Origin: `https://daymark-weather.pages.dev` (Cloudflare Pages)
Architecture: React/Vite → Capacitor Android (`artifacts/weather-app/android`;
the repo-root `android/` is the frozen TWA rollback/history project)
First submitted artifact: `app-release.aab` — SHA-256
`309abe94f4c4f572fe1a478e5b517e76e17c1e49a2e45e9cb90d4571747b89b5`,
96,463,981 bytes.

**Document scope.** This checklist describes the **released v1.0.0** build. The
`v2/privacy-hardened-voice` branch changes the location permission, the
coordinate precision and the Android speech path, so the answers a future
candidate would give differ for location and voice input. Those differences are
stated inline below. The v2 candidate is not released, and the Data safety
declaration must continue to describe the build that is actually distributed.

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

## 2. App content declarations — PREVIOUSLY REPORTED DONE; POST-RELEASE ACCURACY CHECK

Play Console → **Policy and programs → App content**. All rows completed:

- [x] Privacy policy: `https://daymark-weather.pages.dev/privacy`
- [x] App access: **All functionality is available without special access**
      (no login).
- [x] Ads: **No ads** (advertising ID = No).
- [x] Content rating questionnaire (weather utility, no user content, no ads).
- [x] Target audience completed.
- [x] Government apps: No · Financial features: No · Health: No · News: No.
- [x] Data safety form was previously reported complete. **Post-release action:**
      compare the saved answers with the shipped behaviour for location, WebView
      speech input and browser/system TTS. Google Play includes app-controlled
      WebViews in its data-flow rules and defines collection as transmission
      off-device. Open-Meteo says its free-API server logs may contain geographic
      coordinates and are deleted after 90 days, so do **not** mark location
      processing as ephemeral. Sources: [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469)
      and [Open-Meteo Terms & Privacy](https://open-meteo.com/en/terms).

| Data type / flow | Current repo evidence | Console follow-up |
|---|---|---|
| Location | The user taps “Use my location”; coordinates are rounded to 2 decimal places and sent to Open-Meteo over HTTPS. Open-Meteo says free-API server logs may contain geographic coordinates and are deleted after 90 days. | **Released v1.0.0:** select **Precise location** (the sent grid is under 3 km² by Google's definition). **v2 candidate:** the app declares `ACCESS_COARSE_LOCATION` only and sends the OS-provided approximate fix unmodified on Android, so the Android answer becomes **Approximate location**; the web/PWA grid cell is roughly 4.8 km² at the example latitude, which also qualifies as Approximate. The cell area shrinks with latitude, so re-derive the answer from the build actually being submitted rather than reusing either value. In Data usage and handling: **Collected = Yes**; **Optional = Yes**; purpose **App functionality**; **Ephemeral = No** because provider logs may retain coordinates for 90 days. For **Shared**, Google provides exceptions for transfers to a qualifying service provider and for a specific user-initiated action the user reasonably expects. The explicit “Use my location” action may qualify for the latter; apply it only if the actual UI and disclosure support that conclusion, otherwise select Shared = Yes. Encryption in transit: Yes for this HTTPS flow. See [Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469) and [Open-Meteo Terms & Privacy](https://open-meteo.com/en/terms). |
| Voice-input audio | Released v1.0.0: Ask Daymark uses browser/platform speech recognition; the app does not save audio or transcripts, but the speech provider may process audio remotely. v2 candidate: on Android, recognition uses the platform's on-device recogniser with no online fallback. | **Released v1.0.0:** in Data types, account for **Audio files → Voice or sound recordings** if audio is transmitted off-device. Collection and any sharing depend on the actual provider path; do not mark ephemeral unless that provider's documentation confirms memory-only real-time processing with no longer retention. **v2 candidate:** for the Android build the answer becomes “not collected” once the on-device path is device-verified; the web path is unchanged. The two platforms must be answered separately. |
| In-app search history | The user types a place name; the query is sent to Open-Meteo forward geocoding. The app keeps no search history of its own. | Google Play's *App activity* category includes in-app search history. Account for the typed place query as app activity with the same provider retention caveat as location; answer it separately from app interactions. |
| Voice-output text | Android English uses bundled local Kokoro; web uses browser speech synthesis; Android French/Spanish use native Android system TTS | Keep English Android output local. For web and Android French/Spanish, check the actual selected speech provider. If forecast/location text is transmitted off-device, include the affected data type and purpose; do not assume provider processing is ephemeral without evidence. |
| App activity / personal info / messages / contacts | No in-app account, analytics or related SDK found in this audit | Confirm existing answers remain accurate |
| Analytics / crash logs | No in-app analytics/crash SDK found in repo | Confirm existing answers remain accurate |

- [ ] **Multi-version rule.** Play's Data safety section describes the **sum**
      of an app's data collection and sharing across **all versions currently
      distributed** on Google Play. While v1.0.0 — which declares
      `ACCESS_FINE_LOCATION` and transmits a two-decimal fix — remains
      distributed, declaring Approximate location only would be inaccurate.
      Either withdraw v1.0.0 from Play, or declare both location types until it
      is gone. Do not change the declaration for a candidate while the older
      build is still live.
- [x] Account-deletion requirement: not applicable because Daymark has no
      account-creation flow.
- [ ] Separately answer Data safety's "deletion request mechanism" question
      based on the actual support process. Do not imply Daymark can erase
      Open-Meteo's logs on demand; the provider's published terms say its free-API
      logs may contain coordinates and are deleted after 90 days.
- [x] AI asset declaration completed.

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
- [ ] If adopting the revised privacy-page text in this PR, deploy the web build,
      publish the same policy in a new Android bundle, and set the effective date
      to the actual publication date. The already-uploaded AAB does not contain
      these source edits.
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
- [ ] **Privacy-policy publication sync:** the policy source pages are edited on
      the v2 branch, but the changes are not live and are not in the
      already-uploaded AAB. Publication waits until the three policy pages state the Android
      on-device voice path and the French/Spanish offline-voice constraint, and
      until the checklist records that the pages match the build being shipped.
      Before using this revised wording, deploy the web build and rebuild
      the Android bundle so the bundled policy matches. Increment `versionCode`
      to the next unused value (expected `2` if `1` is still the latest upload),
      confirm the three policy pages match and set the effective date to the
      actual publication date. Do not claim the revised wording is live before
      the website deployment and Android release are complete.
- [ ] Never remove fingerprints from `assetlinks.json` (sideload verification
      breaks); replace only if you rotate a key.
- [ ] If the origin changes, update the intent filter host in
      `artifacts/weather-app/android/app/src/main/AndroidManifest.xml`, the
      `resolveDeepLink()` allow-list, and assetlinks.json together.
