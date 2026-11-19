# Round 7 — Agent A — PR #80 (V2.1 integration) evidence

- Work location: `/Volumes/DaymarkWorkspace/Daymark/worktrees/r7-pr80`
- Branch: `r7/pr80-v21`
- Candidate (base): `aedfe8a` (merge of main `6aafa15` into development/v2.1 `04ec4cc` + dev-workspace restore)
- Work commit: `e09c34c40f7396079d73449478323eb6b80dde9c` — "test(v2.1): port main E2E suite to web/PWA behaviour; fix Vitest TSX transform"
- Not pushed, not merged, no production assets/AAR/signing touched.
- PNPM store: `/Volumes/DaymarkWorkspace/Daymark/cache/pnpm-store`; TMPDIR: `/Volumes/DaymarkWorkspace/Daymark/cache/round7/tmp`

## 1. Vitest TSX parse failure (candidate blocker) — fixed

Symptom (before):

```
FAIL src/lib/weather-errors.test.ts [ src/lib/weather-errors.test.ts ]
Error: Failed to parse source for import analysis because the content contains
invalid JS syntax. If you use tsconfig.json, make sure to not set jsx to preserve.
Plugin: vite:import-analysis
File: .../src/components/weather/WeatherError.tsx
```

Root cause: Vite 8 (Rolldown) honours `"jsx": "preserve"` from
`artifacts/weather-app/tsconfig.json`. The app build survives because
`@vitejs/plugin-react` performs the JSX transform, but `vitest.config.ts` had no
plugins, so Vitest imported `WeatherError.tsx` untransformed and Vite's import
analysis failed. The test itself (9 tests) is valid; no test was disabled.

Fix: `artifacts/weather-app/vitest.config.ts` now loads `@vitejs/plugin-react`
(same transform as the app build), with a comment explaining the tsconfig
`jsx: preserve` interaction. Unit tests importing `.tsx` modules now load.

## 2. E2E suite ported from main to real V2.1 web behaviour

Baseline (candidate `aedfe8a`, main suite as merged): **164 tests — 126 passed,
38 failed** (`e2e-baseline.log`, 6.3 min). Failures were all main-era
assumptions, not product bugs:

- Voice: main assumed browser SpeechSynthesis/SpeechRecognition. V2.1 web hides
  `Hear today` and `Ask Daymark` (`CurrentWeather`/AskDaymark gated on
  `Capacitor.isNativePlatform() && platform === 'android'`) and ships no browser
  speech modules. Removed `tests/e2e/support/speech.ts` and
  `tests/e2e/pages/voice-controls.page.ts`; rewrote `voice.spec.ts` around the
  web-only contract (localized weather-only demo note, controls absent, no
  microphone request, no transcript sink); adapted day-cue, mobile-layout,
  multilingual, location-search, privacy, security, weather-alerts, weather-core.
- Privacy: expectations now pin V2 wording — 0.025-degree grid, Android-only
  voice, adult audience, operator "Sami".
- Geolocation: V2 snaps device fixes to a 0.025° on-device grid, so
  51.5074567/-0.12789012 is sent as exactly `latitude=51.5&longitude=-0.125`
  (asserted via URLSearchParams, raw fix asserted absent), not V1's 51.51/-0.13.
- Location failures: V2 renders an inline `location-notice` (with Try again)
  instead of the main-era toast; all geolocation/refresh assertions updated.
- Hostile-transcript XSS coverage moved to the Android-side sink:
  `src/lib/weather-intents.test.ts` now asserts `normalizeTranscript` strips
  markup (the web demo has no transcript surface).

Net E2E count: 164 -> 154 tests. The 10 removed tests were browser voice
scenarios that cannot exist in V2.1's web build; equivalent web regressions
(voice surface must stay hidden, localized demo note) were added and the
Android-only intent/speech paths remain covered by the unit suites.

Changed files (commit `e09c34c`):

- `artifacts/weather-app/vitest.config.ts`
- `artifacts/weather-app/src/lib/weather-intents.test.ts`
- `artifacts/weather-app/tests/e2e/support/{fixtures,test-data}.ts`
- `artifacts/weather-app/tests/e2e/support/speech.ts` (deleted)
- `artifacts/weather-app/tests/e2e/pages/dashboard.page.ts`
- `artifacts/weather-app/tests/e2e/pages/voice-controls.page.ts` (deleted)
- `artifacts/weather-app/tests/e2e/specs/{day-cue,geolocation,location-search,mobile-layout,multilingual,privacy,security,voice,weather-alerts,weather-core,weather-refresh}.spec.ts`

## 3. Final verification (all on final commit e09c34c, final build artifacts)

| # | Command (cwd) | Exit | Result | Log |
|---|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile --store-dir /Volumes/.../pnpm-store` (worktree root) | 0 | 420 packages, lockfile unchanged | — |
| 2 | `pnpm run typecheck` (root) | 0 | weather-app + mockup-sandbox typecheck | `final-typecheck.log` |
| 3 | `pnpm run build` (root) | 0 | both artifacts built (vite 8.3.8; >500 kB chunk warning only) | `final-build.log` |
| 4 | `pnpm run sync:android-web` (artifacts/weather-app) | 0 | build + `cap copy android` + `verify-android-web-assets`: PASS 27 files match | `final-sync-android-web.log` |
| 5 | `pnpm exec vitest run` (artifacts/weather-app) | 0 | **32 files: 414 passed, 1 skipped (415 tests)**; includes async-scanner + ESLint guard unit suites | `final-unit.log` |
| 6 | `pnpm run lint:e2e` (artifacts/weather-app) | 0 | `eslint tests/e2e --max-warnings=0` | `final-lint-e2e.log` |
| 7 | `CI=1 PORT=5173 E2E_PORT=5173 BASE_PATH=/ pnpm run test:e2e` (artifacts/weather-app) | 0 | **154 passed (0 failed), chromium, 1.1 min** (run against the final build) | `e2e-final-on-final-build.log` |

Post-fix but pre-build full E2E run (`e2e-final.log`): 154 passed / 58.6 s, exit 0.
Intermediate run (`e2e-after-port.log`): 154 tests, 151 passed / 3 failed (fixed:
ES privacy phrase, one `Locator.count()` await, topbar-vs-hero ordering).

## 4. Failures that remain / environmental notes

- None in the required gates: install, typecheck, build, sync:android-web, unit,
  lint:e2e, full chromium E2E are all green on commit e09c34c.
- Unit suite has 1 pre-existing skipped test (unchanged by this work).
- Vite build warns that a chunk is >500 kB (pre-existing; not a gate).
- Ordering requirement (not a blocker): run `pnpm run sync:android-web` before
  the unit suite; `src/lib/network-boundary.test.ts` reads
  `android/app/src/main/assets/capacitor.config.json`, which `cap copy`
  generates. Without the sync the suite shows 2 failures (seen in the first
  baseline run; green after sync).
- No Android SDK/emulator, AAR/signing or production-asset work was needed or
  performed. No network blocker: install reused the local pnpm store.
- E2E was run on the production build served by `vite preview` (CP/security
  headers plugin active), not the dev server.

## 5. Readiness verdict

**Ready for review.** The candidate's one real test blocker (Vitest/Vite 8 TSX
parse) is fixed at the config level without disabling tests, and the merged main
E2E suite now reflects V2.1's actual web/PWA behaviour with deterministic waits
(no added sleeps; the pre-existing deliberate negative-window wait in the stale
geolocation test is unchanged). All gates are green on commit e09c34c.

Caveats for the reviewer:
1. E2E count is 154 vs main's 164 because browser voice scenarios are impossible
   in V2.1's web build; those tests were replaced with web "voice must stay
   hidden" assertions, and the Android voice/intent/XSS-sanitization coverage is
   in unit suites. Please sanity-check that coverage trade-off.
2. The Vitest fix depends on `@vitejs/plugin-react` (already a devDependency,
   catalog ^6.3.0); no lockfile change was needed.
3. This work touched tests/config only — no product source behaviour changed.

## 6. Environment and CI parity

- Local: macOS, Node v26.8.2, pnpm 12.3.4, @playwright/test 1.63.0 (chromium
  headless shell 1243), Vite 8.3.8, Vitest 5.1.1.
- CI (`.github/workflows/ci.yml`) uses Node 24. The Vitest fix only uses
  `import.meta.dirname` (Node >=20.11) and an existing devDependency, so it is
  Node-24 compatible; it was not executed on Node 24 in this session.
- CI unit job runs `cap sync android` + `verify:android-web-assets` before
  `pnpm test`; this session ran the equivalent `pnpm run sync:android-web`
  (build + `cap copy android` + verify) before the final unit/E2E runs.
- CI E2E job starts Playwright's own preview server (config default 5177) with
  `CI=1`; this session used `E2E_PORT=5173` to match the requested
  `PORT=5173` setup. Both paths use the same production `vite preview` build.
- Android/Gradle build, AAR packaging and signing were explicitly out of scope
  and were not run.
