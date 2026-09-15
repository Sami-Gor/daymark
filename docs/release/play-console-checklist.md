# Google Play launch checklist — Daymark

Companion to [`android-production-readiness.md`](android-production-readiness.md)
(§2 Play requirements, §3 Asset Links, §10 data map, §20 matrix, §21 release
sequence).

**Status (15 September 2026):** Play Console setup is complete through the first
closed-testing submission. The closed-testing (Alpha) release has been
submitted to Google Play and is **in review**. Remaining gates: retrieve the
**Play app-signing** SHA-256, deploy `assetlinks.json`, satisfy the
closed-testing requirement, then production access.

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
- [ ] Confirm the developer account type. Personal accounts created after
      Nov 2023 must run closed testing with **12 testers for 14 continuous
      days** before production access (see step 8).
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

## 2. App content declarations — DONE

Play Console → **Policy and programs → App content**. All rows completed:

- [x] Privacy policy: `https://daymark-weather.pages.dev/privacy`
- [x] App access: **All functionality is available without special access**
      (no login).
- [x] Ads: **No ads** (advertising ID = No).
- [x] Content rating questionnaire (weather utility, no user content, no ads).
- [x] Target audience completed.
- [x] Government apps: No · Financial features: No · Health: No · News: No.
- [x] Data safety — mapped from `android-production-readiness.md` §10:

| Data type | Collected? | Shared? | Use |
|---|---|---|---|
| Location → Approximate + Precise | Yes (sent to Open-Meteo, rounded to ~1 km) | No (service provider) | App functionality |
| Audio → Voice/sound recordings | No (in-memory only; the platform speech service may process it remotely — see §10) | No | App functionality |
| App activity / personal info / messages / contacts | No | — | — |
| Analytics / crash logs | None in-app | — | — |

- [x] Data deletion: no accounts and no stored user data.
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

## 6. Deploy `assetlinks.json` — BLOCKED on step 5

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

- [ ] `pnpm build` and deploy `dist/` to Cloudflare Pages (static assets are
      served before the SPA fallback, so the path will return JSON instead of
      the app HTML).

## 7. Verify App Links — PENDING (after step 6)

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

## 8. Closed testing — SUBMITTED, IN REVIEW

- [x] **Test and release → Testing → Closed testing** (Alpha) track created;
      the first AAB submitted for review.
- [x] Tester mechanism: Google Group `daymark-testers@googlegroups.com`.
- [x] Countries/regions: all available countries/regions selected.
- [ ] Once the release passes review: have ≥ 12 testers opt in and keep them
      active for 14 continuous days (personal-account production gate), collect
      feedback.
- [ ] Fix and re-upload with a bumped `versionCode` as needed.

## 9. Production rollout — PENDING

- [ ] Production access remains gated by Google's closed-test requirement
      (step 8) for personal accounts.
- [ ] Apply for production access when eligible, then **Production → Create
      release** with the tested AAB.
- [ ] Staged rollout 10% → 50% → 100%; watch **Monitor and improve → Android
      vitals** for ANRs/crashes, especially memory-related kills on lower-RAM
      devices.
- [ ] Keep the `pre-capacitor-daymark` TWA rollback tag until the rollout is
      stable.

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
