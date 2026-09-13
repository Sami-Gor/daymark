# Google Play launch checklist — Daymark

Companion to [`android-production-readiness.md`](android-production-readiness.md)
(§2 Play requirements, §3 Asset Links, §10 data map, §20 matrix, §21 release
sequence). Everything repo-side is already green. The items below are the only
remaining release gates, and they are all manual Play Console work.

Package: `io.github.sami_gor.daymark` · versionCode `1` / versionName `1.0.0`
Origin: `https://daymark-weather.pages.dev` (Cloudflare Pages)

## 0. Pre-flight (local, once)

- [ ] Back up the upload keystore offline:
      `artifacts/weather-app/android/daymark-upload.keystore` and
      `artifacts/weather-app/android/keystore.properties` (both gitignored).
      Losing them requires a Play key-reset request. Alias `daymark-upload`,
      SHA-256 `3C:60:AD:BB:70:EB:70:4C:26:A7:B8:16:C2:6A:FC:B4:06:E2:A1:0A:ED:32:2A:EE:AB:A9:3C:6C:B0:81:20:57`.
- [ ] Confirm the account type in Play Console. Personal accounts created after
      Nov 2023 must run closed testing with **12 testers for 14 continuous
      days** before production access (see step 8).
- [ ] Rebuild the AAB from the final release commit:

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

## 1. Create the app

- [ ] Play Console → **All apps → Create app**: name `Daymark`, default
      language English (US), type App, Free.
- [ ] Accept the developer program policies.

## 2. App content declarations

Play Console → **Policy and programs → App content**. Every row must end green.

- [ ] Privacy policy: `https://daymark-weather.pages.dev/privacy`
- [ ] App access: **All functionality is available without special access**
      (no login).
- [ ] Ads: **No ads**.
- [ ] Content rating questionnaire: Weather utility, no user content, no ads.
- [ ] Target audience: choose for your intended audience (weather utility, no
      user-generated content).
- [ ] Government apps: No · Financial features: No · Health: No · News: No.
- [ ] Data safety — map repo behavior from `android-production-readiness.md`
      §10. Suggested answers:

| Data type | Collected? | Shared? | Use |
|---|---|---|---|
| Location → Approximate + Precise | Yes (sent to Open-Meteo, rounded to ~1 km) | No (service provider) | App functionality |
| Audio → Voice/sound recordings | No (in-memory only; the platform speech service may process it remotely — see §10) | No | App functionality |
| App activity / personal info / messages / contacts | No | — | — |
| Analytics / crash logs | None in-app | — | — |

- [ ] Data deletion: no accounts and no stored user data — select the
      "no data collected that requires deletion" path as applicable.

## 3. Store listing

- [ ] App name (≤ 30), short description (≤ 80), full description (≤ 4000).
- [ ] Graphics: app icon 512×512 PNG (32-bit), feature graphic 1024×500.
- [ ] Phone screenshots (2–8, min 320 px side). Existing captures in
      `docs/images/` (e.g. `daymark-mobile.png`, `daymark-today-sun.png`,
      `daymark-today-rain.png`, `daymark-forecast.png`) qualify at 390×844.
- [ ] Category: Weather · contact email · website optional.

## 4. First upload → internal testing

- [ ] Play Console → **Test and release → Testing → Internal testing → Create
      new release**.
- [ ] Upload `app-release.aab`; keep versionCode `1` for the first upload (bump
      for every later upload).
- [ ] Continue through the Play App Signing enrollment (default); Play
      generates the app signing key on this first upload.
- [ ] Add yourself as a tester, install through the opt-in link, smoke test
      (launch, location, Hear today, Ask Daymark).

## 5. Copy the Play app signing fingerprint

- [ ] Play Console → **Test and release → Setup → App integrity → Play app
      signing → App signing key certificate** → copy the **SHA-256** (the key
      Play uses to re-sign your AAB, *not* the upload key).
- [ ] Keep the upload key fingerprint as the second entry in assetlinks.json so
      sideloaded release builds still verify.

## 6. Deploy `assetlinks.json`

- [ ] Copy `docs/release/assetlinks.template.json` to
      `artifacts/weather-app/public/.well-known/assetlinks.json` and replace
      `__PLAY_APP_SIGNING_SHA256__` with the fingerprint from step 5.
      Both entries must stay in the same JSON array.
- [ ] Optional hardening — add to `artifacts/weather-app/public/_headers`:

```
/.well-known/assetlinks.json
  Content-Type: application/json
```

- [ ] `pnpm build` and deploy `dist/` to Cloudflare Pages (static assets are
      served before the SPA fallback, so the path will return JSON instead of
      the app HTML).

## 7. Verify App Links

- [ ] Served correctly:

```bash
curl -sI https://daymark-weather.pages.dev/.well-known/assetlinks.json | head -5
# expect: HTTP/2 200 and content-type: application/json

curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://daymark-weather.pages.dev&relation=delegate_permission/common.handle_all_urls"
# expect: the package + fingerprints from the file
```

- [ ] On a device with a build signed by one of the listed keys (Play-signed
      install, or the repo's release APK signed with the upload key):

```bash
adb shell pm verify-app-links --re-verify io.github.sami_gor.daymark
adb shell pm get-app-links io.github.sami_gor.daymark     # both hosts: verified
adb shell am start -a android.intent.action.VIEW -d "https://daymark-weather.pages.dev/privacy"
adb shell am start -a android.intent.action.VIEW -d "https://daymark-weather.pages.dev/fr/privacy"
```

- [ ] Confirm links open in the app cold and warm (readiness §3).

## 8. Closed testing (personal accounts: required gate)

- [ ] **Test and release → Testing → Closed testing** → create a track, upload
      the same AAB.
- [ ] Add ≥ 12 testers (email list), have them opt in and install.
- [ ] Keep 12 testers active for 14 continuous days, collect feedback, fix and
      re-upload with a bumped `versionCode` as needed.

## 9. Production rollout

- [ ] Apply for production access (if gated), then **Production → Create
      release** with the tested AAB.
- [ ] Staged rollout 10% → 50% → 100%; watch **Monitor and improve → Android
      vitals** for ANRs/crashes, especially memory-related kills on
      lower-RAM devices.
- [ ] Keep the `pre-capacitor-daymark` TWA rollback tag until the rollout is
      stable.

## 10. After release

- [ ] Every update: rebuild the AAB, bump `versionCode` in
      `artifacts/weather-app/android/app/build.gradle`, re-upload.
- [ ] Never remove fingerprints from `assetlinks.json` (sideload verification
      breaks); replace only if you rotate the upload key.
- [ ] If the origin changes, update the intent filter host in
      `artifacts/weather-app/android/app/src/main/AndroidManifest.xml`, the
      `resolveDeepLink()` allow-list, and assetlinks.json together.
