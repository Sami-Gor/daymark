# Google Play launch checklist — Daymark

Companion to [`android-production-readiness.md`](android-production-readiness.md)
(§2 Play requirements, §3 Asset Links, §10 data map, §20 matrix, §21 release
sequence).

**Status (11 October 2026):** The maintainer confirms the closed-testing phase is
complete. The website is already deployed. Remaining work: confirm the
production-access application status, capture the Play app-signing SHA-256,
verify the existing `/.well-known/assetlinks.json` endpoint (make a website
change only if that file is missing or wrong), and review Data safety answers
for speech input. A physical-device pass is already documented; only the
additional test gaps listed in the readiness audit remain.

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
- [ ] Record whether the developer account is personal or organisation. The
      maintainer reports closed testing is complete; for personal accounts
      created after 13 November 2023, confirm Play Console recognises the
      12-testers / 14-continuous-days gate as satisfied.
- [x] AAB built from merged `main` and uploaded (metadata above). Rebuild
      command kept for reference:

```bash
cd artifacts/weather-app
pnpm install              # fresh clone only
pnpm build
pnpm exec cap sync android
cd android
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
- [x] Data safety form was previously reported complete. **Recheck the
      existing answers before production**, particularly speech input: Daymark
      does not persist audio, but the Android/browser speech service may process
      it remotely. Use current Play definitions and the actual production flow;
      do not infer the answer from the absence of app-side storage alone.

| Data type / flow | Current repo evidence | Console follow-up |
|---|---|---|
| Location | User-initiated device location; coordinates rounded to 2 decimals before the weather request | Confirm collection/sharing answers accurately describe the provider transfer and any applicable ephemeral-processing exception |
| Voice-input audio | Daymark does not store recordings; the Android/browser speech service may process audio remotely | **Unresolved policy check:** determine whether this WebView speech path must be reported as collected/shared under current Data safety rules |
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
adb shell pm get-app-links io.github.sami_gor.daymark     # both hosts: verified
adb shell am start -a android.intent.action.VIEW -d "https://daymark-weather.pages.dev/privacy"
adb shell am start -a android.intent.action.VIEW -d "https://daymark-weather.pages.dev/fr/privacy"
```

- [ ] Once Digital Asset Links is valid, verify Android's **verified App Links**
      on device, including cold/warm opens. This is a separate test from the
      already-completed core device pass; the previous emulator routing test
      verified in-app handling, not Android domain verification.

## 8. Closed testing — COMPLETE (maintainer-confirmed)

- [x] The maintainer confirms the closed-testing phase is complete
      (11 October 2026). This status has not been independently checked against
      the live Play Console.
- [x] The repository records an Alpha track, first AAB submission, Google Group
      `daymark-testers@googlegroups.com`, and all available countries/regions.
- [x] The closed-test phase is reported complete. For a personal account
      created after 13 November 2023, confirm Play Console recognises the
      required tester count and continuous opt-in period as satisfied.
- [ ] Prepare production-access responses in Play Console using actual tester
      engagement, feedback, and changes made in response. Keep evidence factual;
      do not invent metrics or feedback.
- [ ] If another bundle is required, increment `versionCode`; do not reuse a
      code already uploaded for this app.

## 9. Production access and rollout — STATUS NOT VERIFIED

- [ ] In the Play Console Dashboard, confirm whether production access is
      available to request, already submitted, approved, or returned for more
      testing. Closed testing is reported complete; production access is a
      separate decision.
- [ ] If not already submitted, prepare the application in Play Console.
      Use truthful evidence; do not invent tester feedback, engagement or
      install estimates.
- [ ] Reconcile the speech-input Data safety declaration and verify all Console
      policy declarations still match the app and privacy policy.
- [ ] Check the existing website's Digital Asset Links endpoint as described
      in steps 5–7; publish an updated site only if the JSON is absent or wrong.
      This is an App Links task separate from AAB acceptance.
- [ ] Once access is approved, create the Production release using the tested
      bundle through the current Console workflow. If a new AAB is required,
      increment versionCode and validate the new build.
- [ ] Roll out in stages (for example 10% → 50% → 100%) and monitor Android
      vitals for ANRs/crashes, especially memory-related kills on low-RAM devices.
- [ ] Keep the `pre-capacitor-daymark` TWA rollback tag until rollout is stable.

## 10. Follow-ups (non-blocking)

- [ ] Native debug symbols were **not** uploaded with the first AAB (the Play
      upload warning is expected). Configure/upload them for the **next**
      Android release — e.g. set the release `ndk.debugSymbolLevel` (or upload
      the symbols archive). This does not block the current closed test.
- [ ] Every update: rebuild the AAB, bump `versionCode` in
      `artifacts/weather-app/android/app/build.gradle`, re-upload.
- [ ] Never remove fingerprints from `assetlinks.json` (sideload verification
      breaks); replace only if you rotate a key.
- [ ] If the origin changes, update the intent filter host in
      `artifacts/weather-app/android/app/src/main/AndroidManifest.xml`, the
      `resolveDeepLink()` allow-list, and assetlinks.json together.
