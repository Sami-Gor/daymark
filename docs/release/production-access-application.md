# Daymark — production-access application worksheet

**Purpose:** prepare the production-access application in Google Play Console after closed testing.

**Status:** closed-testing phase marked complete by the maintainer on 11 October 2026. This worksheet is preparation only. The live Play Console application/decision state has not been verified.

Google's official flow for eligible new personal developer accounts groups the application into:
1. About your closed test
2. About your app/game
3. About your production readiness

Official guidance: [App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465).

## Before opening the application

- [ ] Confirm the production-access application has not already been submitted or approved.
- [ ] Confirm the developer account type and whether the account-specific testing gate is shown as satisfied in Console.
- [ ] Confirm the tester eligibility / opt-in period shown in Console; do not rely on a local checklist alone.
- [ ] Gather actual tester feedback, any issues found, changes made in response, and evidence of repeat testing.
- [ ] Confirm the release being considered for production and its version code in Console. The first bundle is documented as package `io.github.sami_gor.daymark`, versionCode `1`, versionName `1.0.0`, SHA-256 `309abe94f4c4f572fe1a478e5b517e76e17c1e49a2e45e9cb90d4571747b89b5`. Do not upload another bundle with a previously used versionCode.
- [ ] Reconcile the Data safety declaration, especially speech-recognition processing and the precise details of the location flow, against current Google policy and the production app.
- [ ] Confirm no unresolved policy alerts or required declarations are outstanding in Console.

## 1. About your closed test

Answer the choices exactly as presented in the current Play Console form. Record the actual facts before submitting.

### Tester recruitment

**Console answer selected for recruitment difficulty:** `[FILL FROM EXPERIENCE]`

**How testers were recruited:**

`[Describe the actual recruitment channels and process. The repository records the Google Group daymark-testers@googlegroups.com, but it does not establish how easy recruitment was or how many people engaged.] `

### Testers and engagement

**Number of testers who opted in and remained opted in for the required period:** `[VERIFY IN PLAY CONSOLE]`

**Who tested and how well they represented intended users:**

`[Describe who participated in general terms, how they relate to likely Daymark users, and any limitations. Do not include private tester details.] `

**What testers did during the test:**

`[List only activities testers actually completed, such as checking forecasts, searching for places, using “Use my location”, using AskDaymark voice input, listening to narration, testing language options, or trying the app after restart/network loss. Delete features that testers did not test.] `

**How feedback was collected:**

`[FILL: e.g. email, Google Group discussion, message thread, direct conversation, feedback form. Include only channels actually used.] `

**Summary of feedback received:**

`[FILL FROM REAL FEEDBACK. Include repeated themes, concrete examples, and any feedback that could not be addressed. If no feedback was received for a topic, say so rather than inventing it.] `

### Issues and changes during testing

| Feedback or issue | Evidence/source | Action taken | Re-test performed | Result |
|---|---|---|---|---|
| `[ISSUE 1 OR “No issue reported” if accurate]` | `[SOURCE]` | `[ACTION / NONE]` | `[TEST]` | `[RESULT]` |
| `[ISSUE 2]` | `[SOURCE]` | `[ACTION]` | `[TEST]` | `[RESULT]` |

**Summary for the Console narrative:**

`[Explain how testing affected the app. Be specific about feedback received and what changed. Do not claim that changes resulted from tester feedback unless they actually did.] `

## 2. About your app/game

### What Daymark does

The repository describes Daymark as a weather app for the web and Android. It presents forecasts and air-quality information using Open-Meteo, allows users to search for a place or optionally request device location, and includes voice features. The Android build bundles Kokoro for English narration on-device; French and Spanish narration use Android system text-to-speech. Voice input relies on the browser/device speech-recognition service and may be processed remotely by that platform provider.

Use the following as a starting point only; tailor it to the exact Console questions and current release:

> Daymark is a weather app designed to make local weather information easier to check and listen to. Users can search for a location or optionally use device location, view weather and air-quality information, and use voice input or spoken narration. The Android app does not require an account and does not contain advertising or in-app analytics according to the current repository audit. English narration uses a bundled on-device voice model; French and Spanish narration use the device's speech engine. Weather and place-search requests are sent to Open-Meteo. Optional speech recognition is handled by the device/browser speech service and may involve the platform provider's processing.

### Intended users

`[DESCRIBE THE REAL INTENDED AUDIENCE — for example, people who want a simple way to check local weather. Only name groups, countries, or age groups that match your actual product and Play Console target-audience declaration.] `

### Core functionality and user value

`[Describe the principal functionality users can access today, why it is useful, and any important limitations. Avoid claims that imply official severe-weather warnings; repository documentation says severe-weather risks are Daymark estimates based on forecasts, not official warnings.] `

## 3. About your production readiness

### Why the app is ready

Use only statements still true after verifying the current release:

- The closed-testing phase is complete according to the maintainer.
- The documented release uses package `io.github.sami_gor.daymark`, versionCode `1` / versionName `1.0.0`, targets API 36, and supports `arm64-v8a`.
- The documented bundle hash is `309abe94f4c4f572fe1a478e5b517e76e17c1e49a2e45e9cb90d4571747b89b5`.
- The app can be used without a login.
- The repository contains an English, French, and Spanish privacy policy at `/privacy`, `/fr/privacy`, and `/es/privacy`.

These are repository or maintainer claims; they do not prove the live Console forms are accurate, the exact release under review is unchanged, or every physical-device test is complete.

**Production readiness narrative to complete:**

`[Explain the actual testing completed, the most important issues investigated or fixed, the device(s)/Android versions tested, and the evidence supporting your decision to launch. Include the remaining known limitations and mitigation. Do not say the physical-device matrix or App Links work is complete unless verified.] `

### Known limitations / remaining actions

- App Links at `https://daymark-weather.pages.dev` require the Play app-signing certificate fingerprint to be added to the Digital Asset Links file. The upload-key fingerprint is not a substitute.
- The repository audit marked extended device validation outstanding for lower-memory devices, TalkBack, longer narration / thermal behaviour, Bluetooth/audio interruptions, French/Spanish system voices, upgrade install, and Play-distributed validation. Update this list with actual outcomes before making readiness claims.
- Speech recognition depends on the platform/browser service; availability, offline behaviour and possible remote processing vary by device/provider.
- The bundle contains the on-device TTS model and is relatively large. Ensure performance and memory were acceptable on the devices actually tested.

## Submission quality check

- [ ] Every answer reflects the real closed test and current app.
- [ ] Tester-count and continuous opt-in requirements are confirmed in Console where applicable.
- [ ] Feedback and app changes are specific and factual.
- [ ] Data safety answers account for WebView-controlled speech recognition and third-party processing under current Play rules.
- [ ] Public privacy policy and Play declarations agree with the actual build.
- [ ] No unresolved Console policy alert has been overlooked.
- [ ] Production-access status and any Google response are recorded in `play-console-checklist.md`.

**Do not copy placeholder text into Google Play.** This file is a preparation worksheet, not a completed submission; tester-specific answers cannot be derived from the repository.
