# Google Play launch checklist — Daymark

Companion to [`android-production-readiness.md`](android-production-readiness.md)
(§2 Play requirements, §3 Asset Links, §10 data map, §20 matrix, §21 release
sequence).

**Status (11 October 2026):** The maintainer confirms the closed-testing phase is
complete. The website is already deployed. The maintainer reports that
**Apply for production is available** in Play Console; whether the application
has been submitted or decided is not verified. Other follow-up: capture the
Play app-signing SHA-256, verify the existing `/.well-known/assetlinks.json`
endpoint (change the site only if that file is missing or wrong), and review
Data safety answers for location, speech input and speech-output provider
flows. Core physical-device testing is already complete and does not need to
be repeated. The wider matrix is optional additional QA, not a blanket blocker.

Package: `io.github.sami_gor.daymark` · versionCode `1` / versionName `1.0.0`
· minSdk `24` / targetSdk `36`
Origin: `https://daymark-weather.pages.dev` (Cloudflare Pages)
Architecture: React/Vite → Capacitor Android (`artifacts/weather-app/android`;
the repo-root `android/` is the frozen TWA rollback/history project)
First submitted artifact: `app-release.aab` — SHA-256
`309abe94f4c4f572fe1a478e5b517e76e17c1e49a2e45e9cb90d4571747b89b5`,
96,463,981 bytes.

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

## 1. Create the app — DONE

- [x] Play Console → **All apps → Create app**: name `Daymark`, default
      language English (US), type App, Free.
- [x] Accept the developer program policies.

## 2. App content declarations — PREVIOUSLY REPORTED DONE; RECHECK BEFORE PRODUCTION

Play Console → **Policy and programs → App content**. All rows completed:

- [x] Privacy policy: `https://daymark-weather.pages.dev/privacy`
- [x] App access: **All functionality is available without special access**
      (no login).
- [x] Ads: **No ads** (advertising ID = No).
- [x] Content rating questionnaire (weather utility, no user content, no ads).
- [x] Target audience completed.
- [x] Government apps: No · Financial features: No · Health: No · News: No.
- [x] Data safety form was previously reported complete. **Recheck the existing
      answers before production** for user-initiated location, WebView speech
      input and browser/system TTS output. Providers may process data off-device
      even though Daymark does not store it. Google Play defines collection as
      transmitting data off-device; controlled WebViews are included. Data
      transmitted off-device but processed ephemerally still needs the correct
      form response, although qualifying ephemeral processing may not appear in
      the public Data safety section. Use the current
      [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469)
      and actual production flow.

| Data type / flow | Current repo evidence | Console follow-up |
|---|---|---|
| Location | User-initiated device location; coordinates are rounded to 2 decimal places (~1 km) before the Open-Meteo weather request | **Do not assume that rounding makes this “approximate location”.** Play defines approximate location as an area ≥3 km² and precise location as <3 km². Assess the effective location resolution, the fact that the coordinates are transmitted off-device, and the ephemeral-processing rule using [current Play guidance](https://support.google.com/googleplay/android-developer/answer/10787469). Ephemeral handling can affect public disclosure, but is not a reason to omit required form answers. |
| Voice-input audio | Daymark does not store recordings; the WebView/browser speech service may process audio remotely | **Unresolved policy check:** determine the required collection/sharing answer for this controlled WebView speech path under current Data safety rules | 
| Voice-output text | Android English uses bundled local Kokoro; web uses browser speech synthesis; Android French/Spanish use native Android system TTS | Check whether the selected browser/system provider sends or retains utterance text and whether that flow changes the Data safety response |
| App activity / personal info / messages / contacts | No in-app account, analytics or related SDK found in this audit | Confirm existing answers remain accurate |
| Analytics / crash logs | No in-app analytics/crash SDK found in repo | Confirm existing answers remain accurate |

- [x] Data deletion form previously reported complete. Daymark offers no accounts
      and has no server-side user-data store; only a language preference is
      stored locally.
- [x] AI asset declaration completed.

## 3. Store listing — DONE (default store listing)

- [x] App name, short description, full description, graphics (512×512 icon,
      1024×500 feature graphic), phone screenshots, category (Weather), contact
      email.
- [x] Default store listing completed.

## 4. First upload — DONE

- [x] AAB uploaded (`309abe94…`, 96,463,981 bytes); versionCode `1` for the
      first upload (bump for every later upload).
- [x] Play App Signing enrollment completed on this first upload (Play
      generated the app signing key; its fingerprint is not yet recorded — see
      step 5).

## 5. Copy the Play app-signing fingerprint — PENDING

- [ ] Play Console → **Test and release → Setup → App integrity → Play app
      signing → App signing key certificate** → copy the **SHA-256** (the key
      Play uses to re-sign the AAB, *not* the upload key).
- [ ] Do not substitute the upload-key fingerprint
      (`34:6B:BE:…:FA:7E`) for the app-signing fingerprint in `assetlinks.json`.
      They are different keys with different roles.

## 6. Confirm Digital Asset Links on the existing website

The website at `https://daymark-weather.pages.dev` is already deployed; this
step is **not** asking you to deploy a website from scratch. First check the
specific endpoint. The last result recorded in the audit was an HTML fallback,
but that live result has not been independently rechecked in this session.

- [ ] Check the current response and content:

```bash
curl -sI https://daymark-weather.pages.dev/.well-known/assetlinks.json | head -5
curl -s https://daymark-weather.pages.dev/.well-known/assetlinks.json
```

It must return HTTP 200, JSON (not the app HTML), the package
`io.github.sami_gor.daymark`, and the correct **Play app-signing SHA-256**.
If it is already correct, no website change/deploy is needed. If it is absent,
returns HTML, or has the wrong fingerprint:

- [ ] Create the destination directory if it does not exist:
      `mkdir -p artifacts/weather-app/public/.well-known`.
- [ ] Copy `docs/release/assetlinks.template.json` to
      `artifacts/weather-app/public/.well-known/assetlinks.json` and replace
      `__PLAY_APP_SIGNING_SHA256__` with the fingerprint from step 5. Keep the
      upload-key entry as the second element so sideloaded release builds still
      verify. Both entries must stay in the same JSON array.
- [ ] Optional hardening — add to `artifacts/weather-app/public/_headers`:

```
/.well-known/assetlinks.json
  Content-Type: application/json
```

- [ ] Build and publish the resulting site update through the existing Cloudflare
      Pages deployment workflow. This is a normal update to the deployed site,
      not an initial deployment.

## 7. Verify App Links — PENDING until the endpoint is correct

- [ ] Query Google's Digital Asset Links statement API:

```bash
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://daymark-weather.pages.dev&relation=delegate_permission/common.handle_all_urls"
```

Confirm it returns this package and the expected fingerprints.

- [ ] On a device with a build signed by one of the listed keys (Play-signed
      install, or the repo's release APK signed with the upload key):

```bash
adb shell pm verify-app-links --re-verify io.github.sami_gor.daymark
adb shell pm get-app-links io.github.sami_gor.daymark     # check daymark-weather.pages.dev
adb shell am start -a android.intent.action.VIEW -d "https://daymark-weather.pages.dev/privacy"
adb shell am start -a android.intent.action.VIEW -d "https://daymark-weather.pages.dev/fr/privacy"
```

- [ ] If Android's verified App Links have not already been checked, test the
      domain-verification behaviour on a suitable install, including cold/warm
      opens. This is a distinct check from the completed core device pass and
      is only outstanding if you have not already verified it.

## 8. Closed testing — COMPLETE (maintainer-confirmed)

- [x] The maintainer confirms the closed-testing phase is complete
      (11 October 2026); live track history and tester metrics were not
      independently checked here.
- [x] The maintainer reports **Apply for production is available** in Play Console
      (11 October 2026). This means the Console allows the application flow to
      be opened; it does not mean the application was submitted or approved.
- [x] Do not treat the 12-testers / 14-continuous-days period as still waiting
      by default. Follow an eligibility warning only if the live Console
      explicitly shows one; do not repeat the completed testing period.

## 9. Production access and rollout — APPLICATION DECISION NOT VERIFIED

- [x] **Apply for production was reported available** by the maintainer on
      11 October 2026.
- [ ] In the Play Console Dashboard, record the current application state:
      available to apply, submitted/in review, approved, or returned for more
      testing. The available button does not establish submission or approval.
- [ ] If the application has not been submitted, complete it in Play Console
      using truthful tester feedback, engagement and readiness evidence. Do not
      invent tester feedback, engagement or install estimates. Keep these answers
      in Play Console, not in a separate public worksheet.
- [ ] Reconcile Data safety for location, voice input and browser/system TTS
      output, then verify all Console declarations match the app and privacy
      policy.
- [ ] Check the existing website's Digital Asset Links endpoint as described
      in steps 5–7; publish an updated site only if the JSON is absent or wrong.
      This is separate from the production-access application and AAB acceptance.
      It affects automatic verified-link opening, not permission to submit the
      production-access form.
- [ ] Once access is approved, create the Production release using the tested
      bundle through the current Console workflow. If a new AAB is required,
      increment versionCode and validate the new build.
- [ ] Roll out in stages (for example 10% → 50% → 100%) and monitor Android
      vitals for ANRs/crashes, especially memory-related kills on low-RAM devices.
- [ ] Keep the local TWA rollback reference until rollout is stable. The tag
      `pre-capacitor-daymark` is not published to GitHub; a fresh clone can use
      the reachable rollback commit
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
- [ ] **Privacy-policy publication sync:** the policy source pages are edited in
      this PR, but the changes are not live and are not in the already-uploaded
      AAB. Before using this revised wording, deploy the web build and rebuild
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
