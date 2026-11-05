# Testing reference

Detailed reference for Daymark's test layers. For the newcomer overview see
[TESTING.md](TESTING.md); for the Playwright suite's design see
[TESTING-ARCHITECTURE.md](TESTING-ARCHITECTURE.md).

Commands assume the repository root unless a section says otherwise. The
workspace package is `artifacts/weather-app` (`@workspace/weather-app`).

## What the layers are

| Layer | Scope | Config | Limit |
| --- | --- | --- | --- |
| TypeScript | App source, Playwright specs, page objects and support code | `artifacts/weather-app/tsconfig.json`, `artifacts/weather-app/tsconfig.e2e.json` | Types only; no runtime behaviour |
| Vitest | `src/**/*.test.ts` plus `tests/e2e/support/**/*.test.ts` | `artifacts/weather-app/vitest.config.ts` | Unit/source level; no browser |
| Playwright | `artifacts/weather-app/tests/e2e/specs/**/*.spec.ts` in Chromium | `artifacts/weather-app/playwright.config.ts` | Chromium only, mocked network, no Android WebView or real hardware |

Two support files are deliberately Vitest tests, not Playwright specs:
`rng.test.ts` (seeded randomisation helpers) and `awaits.test.ts` (static
async-await guard). Playwright's `testMatch` is `**/*.spec.ts`, so `*.test.ts`
files under `tests/e2e/support/` are collected only by Vitest.

## Prerequisites and setup

| Requirement | Notes |
| --- | --- |
| Node 24 | CI-tested runtime (Node 20+ generally works) |
| pnpm 12.3.4 | Pinned in the root `package.json`; npm/Yarn are rejected |
| Chromium | Installed once with `pnpm --filter @workspace/weather-app exec playwright install chromium` |
| Production build | Required by the Playwright suite; it starts `vite preview` but does not build |

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/weather-app exec playwright install chromium
pnpm --filter @workspace/weather-app run build
```

On Linux CI the browser install adds system dependencies:

```bash
pnpm --filter @workspace/weather-app exec playwright install chromium --with-deps
```

## Commands

### Type checks

```bash
pnpm --filter @workspace/weather-app run typecheck
```

This runs both configs in sequence:

```text
tsc -p tsconfig.json --noEmit && tsc -p tsconfig.e2e.json --noEmit
```

The first checks the app; the second (`tsconfig.e2e.json`) checks everything
under `tests/e2e`. A non-zero exit or any diagnostic is a failure.

### Vitest

```bash
pnpm --filter @workspace/weather-app run test
```

Equivalent to `pnpm exec vitest run` inside `artifacts/weather-app`. The current
suite is **257 tests in 19 files**: 17 app-source test files (236 tests) plus
`tests/e2e/support/rng.test.ts` (14 tests) and
`tests/e2e/support/awaits.test.ts` (7 tests). The reporter prints the file and
test totals; no counts are hard-coded in config.

To run only the E2E support tests:

```bash
pnpm --filter @workspace/weather-app exec vitest run tests/e2e/support
```

### Playwright

```bash
pnpm --filter @workspace/weather-app run test:e2e
```

The config starts `pnpm run serve` (`vite preview` against the production
build), waits for it on the configured port, runs the suite and stops the
server. The current suite is **164 tests in 19 spec files**. Do not treat a
`--list` result as an executed run.

Configuration facts worth knowing:

- `testDir` is `./tests/e2e`; `testMatch` is `**/*.spec.ts`, so the support
  `.test.ts` files never reach Playwright.
- One project, `chromium`; default viewport 1280×800; test timeout 30s;
  assertion timeout 5s.
- The managed `webServer` command is `pnpm run serve` on `E2E_PORT` (default
  5177) with `PORT`/`BASE_PATH` forced for that process and
  `NODE_ENV=production`; startup timeout 30s.
- Locally (`CI` unset) an already-running server is reused; in CI it is not.
- No HTML/trace/screenshot reporter is configured by default, so failure detail
  comes from the terminal output and the fixtures' `random-seed` annotation.
  Generated output goes to the gitignored `test-results/` directory.

Useful variants from the repository root:

```bash
# One spec
pnpm --filter @workspace/weather-app exec playwright test specs/weather-core.spec.ts

# One describe/test group by title
pnpm --filter @workspace/weather-app exec playwright test specs --grep "voice"

# One test by title
pnpm --filter @workspace/weather-app exec playwright test specs --grep "renders the rain cue"

# Per-file inventory without executing anything
cd artifacts/weather-app
pnpm exec playwright test specs/voice.spec.ts --list

# Full inventory
pnpm exec playwright test specs --list
```

Because `pnpm --filter … exec` runs in the package directory, paths are relative
to `artifacts/weather-app` (`specs/...`, not `artifacts/weather-app/specs/...`).

## Environment variables

| Variable | Default | Read by | Effect |
| --- | --- | --- | --- |
| `PORT` | `5173` | `artifacts/weather-app/vite.config.ts` | Vite dev/preview server port. Must be a positive number or the config throws. The Playwright-managed preview server overrides it with `E2E_PORT`. |
| `E2E_PORT` | `5177` | `playwright.config.ts` | Port for the `vite preview` server and `baseURL` (`http://localhost:<E2E_PORT>`). Use it to avoid port clashes between local runs. |
| `BASE_PATH` | `/` | `vite.config.ts` | Vite `base` path for sub-path deployments. The Playwright preview server forces `/`; build with `BASE_PATH=/` before running E2E. |
| `CI` | unset | `playwright.config.ts` | When truthy, focused tests are forbidden (`forbidOnly`) and an existing server is not reused (`reuseExistingServer: false`). |
| `DAYMARK_E2E_SEED` | unset | `tests/e2e/support/rng.ts` via the `seed` fixture | Changes the namespace used to derive every test's random seed. For exploratory variation; see the next section. |

Examples:

```bash
# Different preview port
E2E_PORT=5191 pnpm --filter @workspace/weather-app run test:e2e

# Explore different randomised data
DAYMARK_E2E_SEED=12345 pnpm --filter @workspace/weather-app run test:e2e

# Run one randomised spec with an override
DAYMARK_E2E_SEED=12345 pnpm --filter @workspace/weather-app exec playwright test specs/randomised-data.spec.ts

# CI-like behaviour locally
CI=1 E2E_PORT=5198 pnpm --filter @workspace/weather-app run test:e2e
```

CI sets `PORT=5173` and `BASE_PATH=/` for the build step, and `CI=1` for the
browser tests. `E2E_PORT` is unset there, so CI uses 5177.

## Directory and file inventory

```text
artifacts/weather-app/
├── playwright.config.ts        Playwright project, webServer, Chromium
├── tsconfig.e2e.json           TypeScript config for tests/e2e
├── vitest.config.ts            Unit-test include and @ -> src alias
└── tests/e2e/
    ├── specs/                  19 Playwright spec files (164 tests)
    ├── pages/                  7 page objects
    └── support/                7 support modules + 2 Vitest test files
```

The pre-refactor `tests/e2e/app.spec.ts` no longer exists; its tests now live in
`specs/`.

### Spec files

Counts were taken with `pnpm exec playwright test specs --list`; run the same
command to re-check them.

| Spec file | Tests | `describe` suites | Focus |
| --- | ---: | --- | --- |
| `accessibility.spec.ts` | 2 | accessibility and zoom | axe-core serious/critical violations at desktop and mobile; pinch-zoom viewport meta |
| `day-cue.spec.ts` | 8 | day cue hero | One emoji cue with a label, no redundant advice cards, EN/FR/ES copy, reduced motion |
| `geolocation.spec.ts` | 14 | geolocation flow | Deferred/timed/failed device location, option values, race handling, browser-context permission tests |
| `locality.spec.ts` | 9 | offline locality naming | Weather never blocked by the locality dataset, low-confidence fallback, races, localized fallbacks |
| `location-search.spec.ts` | 10 | location search; location selection loading | Debounced combobox, per-location weather, keyboard selection, stale-search guard |
| `mobile-layout.spec.ts` | 10 | mobile touch targets and legibility; mobile viewport layout | 320–390px touch targets, legibility, insets, hero actions and search panel |
| `multilingual.spec.ts` | 10 | multilingual interface | Live EN→FR/ES switching, persistence, per-location locale, localized voice/alerts |
| `privacy.spec.ts` | 17 | privacy-safe persisted storage; privacy policy pages | Only the language preference persists; EN/FR/ES policy copy, links, overflow |
| `pwa.spec.ts` | 1 | PWA service-worker lifecycle (production build) | Root scope, shell precache, manifest, offline shell |
| `randomised-data.spec.ts` | 11 | randomised and boundary weather data | Seeded temperatures/rain/UV/location, boundaries, malformed/empty payloads (11 new tests) |
| `responsive.spec.ts` | 10 | responsive layout across breakpoints | No horizontal overflow at 320/375/390/430/768/1024/1280/1440px; mobile data sections |
| `security.spec.ts` | 5 | security headers (preview server); security headers in build output; hostile input is rendered inert (XSS) | Served headers and CSP, `dist/public/_headers` parity, three XSS cases |
| `store-promo.spec.ts` | 1 | store promo gallery | Five Play promo images in order, with copy, alt text and dimensions |
| `voice.spec.ts` | 14 | voice playback and Ask Daymark | Narration toggle/end/language/stop, playback failure, unsupported recognition, privacy note, intent answers, lifecycle |
| `weather-alerts.spec.ts` | 7 | weather alerts | Absence, severity/timing, narration and intent layer, location changes, 320px layout |
| `weather-cards.spec.ts` | 7 | live weather cards | Five hourly points/bars, peak-first rain timeline, clean surfaces, section order, reduced motion |
| `weather-core.spec.ts` | 10 | weather dashboard; hero action hierarchy | First paint, default location, °C/°F, error/retry, hero actions (contains the fixed missing-await regression guard) |
| `weather-refresh.spec.ts` | 8 | non-destructive weather refresh | In-place refresh, scroll/node identity, failed refresh, both location controls |
| `weather-sections.spec.ts` | 10 | weather details (humidity and dew point); UV forecast and protection window; regional model comparison | Details fallbacks/localization, UV window/states, UK regional comparison |
| **Total** | **164** | | |

The 11 tests in `randomised-data.spec.ts` are the new coverage added on top of
the 153 tests carried over from `app.spec.ts`; the other 18 specs preserve the
old leaf titles and assertions.

### Support modules

| File | Responsibility |
| --- | --- |
| `support/fixtures.ts` | Exports the extended `test`/`expect`. Provides `seed`, `random`, `api`, `requests`, `browserLog`, the seven page objects, `geo`, `speech`, and the `speechPlaybackFails` / `speechRecognitionSupported` options. |
| `support/mocks.ts` | `ApiMocks` route helpers: canonical defaults, per-endpoint overrides, `all`, `offline`, `delayForecast`, `forecastByLatitude`, `geocodeByName`, `locations`. |
| `support/test-data.ts` | Frozen canonical Open-Meteo fixtures, location cases, privacy/store-promo expectations, scenario generators (`generateWeatherScenario`, `buildForecastForScenario`, `buildAirForScenario`), UI-text helpers. |
| `support/rng.ts` | FNV-1a `hashString`, mulberry32 `createSeededRandom`, `resolveSeed`, `randomInt`/`randomFloat`/`randomItem`. No Playwright imports, so Vitest can test it. |
| `support/network.ts` | `RequestLog` (URL observation) and `BrowserLog` (console/page errors), installed as auto fixtures. |
| `support/speech.ts` | `SpeechHarness`: stubs `speechSynthesis`/`SpeechRecognition`, records spoken text/cancel counts, drives recognition results, errors and end events. |
| `support/geolocation.ts` | `GeolocationHarness`: deferred fixes (`defer`/`resolve`/`resolveEach`/`fail`) and a simulated-timeout `timed` mode. |
| `support/rng.test.ts` | 14 Vitest tests: determinism, ranges, seed resolution, generated payloads, frozen canonical fixtures. |
| `support/awaits.test.ts` | 7 Vitest tests: scanner unit cases plus a full scan of `specs/` and `pages/` for un-awaited Playwright assertions/actions. |

### Page objects

| File | Responsibility |
| --- | --- |
| `pages/dashboard.page.ts` | Header/unit/location controls, hero (city, date, temperature, day cue), loading/error/retry states, toast, a horizontal-overflow helper and `open()`. |
| `pages/weather-sections.page.ts` | Temperature, rain, details, sun, forecast-pair, UV, air-quality and micro-climate sections; values and assertions used by the specs. |
| `pages/location-search.page.ts` | Combobox input, clear button, status line, results list, option selection, keyboard interaction and search helpers. |
| `pages/voice-controls.page.ts` | "Hear today" and Ask Daymark controls, panel/status/error visibility; speech stubs stay in the fixture. |
| `pages/weather-alerts.page.ts` | Alert section/list presence, per-hazard cards and their content locators; absence means no section at all. |
| `pages/privacy-policy.page.ts` | Per-language policy pages, heading/effective date, back link, language switcher and content. |
| `pages/store-promo.page.ts` | `/store-preview` gallery: image count/sources/natural size, titles and captions. |

## Seeded randomisation and failure reproduction

Randomised coverage lives in `support/rng.ts`, `support/test-data.ts` and
`specs/randomised-data.spec.ts`.

- The per-test seed is **derived from the test's title path**:
  `hashString(titlePath.join(' › '))` using FNV-1a 32-bit.
- When `DAYMARK_E2E_SEED` is set, the title is namespaced with the raw override
  value instead: `hashString(`${DAYMARK_E2E_SEED.trim()}::${title}`)`. Tests keep
  distinct streams; only the whole suite's data changes.
- A failing test logs `RNG seed for "<title>": <seed> (derived from the test
  title)` or `… (derived from DAYMARK_E2E_SEED=<value>)`, then rerun advice;
  the `random-seed` attachment is JSON:

  ```json
  {
    "seed": 1109334050,
    "envSeed": null,
    "titlePath": ["chromium", "randomised and boundary weather data", "…"]
  }
  ```

- **Reproduce by rerunning the same test in the same environment.** Without an
  override the title-derived seed is stable, so `--grep` for the same title (or
  rerunning the file) produces identical data. With an override, rerun with the
  same raw `DAYMARK_E2E_SEED` value.
- `DAYMARK_E2E_SEED` is a data-variation namespace, **not** a way to replay the
  resolved number printed for a failure: the override is hashed with the title
  again, so `DAYMARK_E2E_SEED=<printed seed>` would select different data. Keep
  the raw override value you ran with.

Example reproduction loop:

```bash
# Failing test printed: RNG seed for "…": 1109334050 (derived from the test title)
pnpm --filter @workspace/weather-app exec playwright test specs --grep "renders generated temperatures"

# Exploratory run produced a failure; reuse the SAME raw override value, not the printed seed
DAYMARK_E2E_SEED=explore-1 pnpm --filter @workspace/weather-app exec playwright test specs/randomised-data.spec.ts
```

Canonical fixtures in `support/test-data.ts` are frozen regression data; do not
replace them with generated values. Randomised tests build payloads from them
via `buildForecastForScenario`/`buildAirForScenario`.

## Conventions for writing tests

1. **Import the shared test object.** In a spec use
   `import { expect, test } from '../support/fixtures';` — never
   `@playwright/test` directly, or the mocks/logs/seed fixtures are not applied.
2. **Override network stubs before navigating.** The `api` fixture installs
   canonical defaults first; later `page.route` registrations win. Call
   `api.forecast(...)`, `api.locations()`, `api.offline()` etc. *before*
   `dashboard.goto('/')`.
3. **Use page objects for selectors and repeated interactions.** Add a locator
   or helper to the owning page object instead of duplicating selectors in a
   spec. Prefer `getByTestId` where the app exposes one; raw `page.evaluate` is
   acceptable for geometry, performance and build-output checks that the POM
   does not model.
4. **`beforeEach` only for genuinely shared setup** — navigation that every test
   in the suite performs, for example. Keep viewport size,
   fixture options and custom payloads per test, because they must be applied
   before the app's first render. Request fixtures you depend on inside the hook
   (for example `speech`) so their init scripts are installed before navigation.
5. **Await every Playwright action and assertion.** The guard in
   `support/awaits.test.ts` fails the Vitest run for un-awaited Playwright
   matcher assertions, `expect.poll`, or page-object actions in `specs/` and
   `pages/`.
6. **Keep test order independence.** No module-level mutable state; Playwright
   gives each test a fresh context and page. Do not rely on tests that ran
   before.
7. **Name suites by behaviour.** Top-level describes should say what area is
   under test (for example "geolocation flow"), not "functional".
8. **Use fixture options for environment variants** instead of local stubs:
   `test.use({ speechPlaybackFails: true })` and
   `test.use({ speechRecognitionSupported: false })`.
9. **Put support unit tests in `support/*.test.ts`.** They run under Vitest; a
   `.spec.ts` file under `tests/e2e` is a Playwright test.
10. **Typecheck your test code.** `pnpm --filter @workspace/weather-app run
    typecheck` includes `tsconfig.e2e.json`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Executable doesn't exist … playwright install` | Chromium not installed | `pnpm --filter @workspace/weather-app exec playwright install chromium` |
| `built _headers not found` / `dist/public` missing | Production build not run, or stale | `pnpm --filter @workspace/weather-app run build` |
| App looks old or tests hit a stale server | Local run reused an existing preview server | Stop it, or use another `E2E_PORT`; `CI=1` disables reuse |
| `EADDRINUSE` / port conflict | Another preview server on the same port | `E2E_PORT=5191 pnpm --filter @workspace/weather-app run test:e2e` |
| Playwright starts but every page is blank | `dist/` built with a non-`/` `BASE_PATH` | Rebuild with `BASE_PATH=/` |
| `tsc -p tsconfig.e2e.json` errors after adding a file | Type error in spec/support code; E2E uses its own strict config | Fix the type; check `tsconfig.e2e.json` includes the file |
| Vitest runs `support/*.test.ts` as well | Expected: the include covers them | Scope to app tests with `pnpm --filter @workspace/weather-app exec vitest run src` |
| A randomised test fails once | Seed/data combination; title-derived seed is stable | Rerun the same test; if you used `DAYMARK_E2E_SEED`, reuse the same raw value |
| PWA/offline test flakes on repeated runs | Service worker state plus a reused preview server | Rebuild, restart the server, or run with `CI=1`/a fresh `E2E_PORT` |
| `--grep` matches nothing | Title case/spacing differs, or the spec path also needs quoting | Copy the title from `--list` or match a shorter substring |

Do not add `waitForTimeout` sleeps to paper over races. Prefer Playwright web
first assertions (`expect.poll`, `toBeVisible`), deterministic route delays
(`api.delayForecast`) and harness-driven events (`geo.resolve`,
`speech.emitResult`). Avoid `test.skip`/`test.fixme`/`.only`; CI forbids the
latter and skipped tests silently reduce coverage.

## Limitations and evidence conventions

The browser suite is **Chromium-only** and runs against **mocked network
providers**. It does not establish Android WebView behaviour, device sensors
(GNSS), microphone/audio behaviour, real speech-recognition accuracy, live
Open-Meteo behaviour, deployment state or release readiness. A green run is
evidence for the assertions in the tested code at the tested commit only.

When recording a result, note:

- the exact commit (`git rev-parse HEAD`) and whether the tree was dirty;
- the command(s) run and whether `CI`, `E2E_PORT`, `BASE_PATH`, `PORT` or
  `DAYMARK_E2E_SEED` were set;
- which layer produced it (typecheck / Vitest / Playwright) and the counts from
  that run — `--list` results are inventory, not execution evidence;
- for failures, the full test title, the `random-seed` attachment JSON and the
  error output.

## Related documents

- [Testing overview](TESTING.md)
- [Testing architecture](TESTING-ARCHITECTURE.md)
- [Architecture and the Capacitor migration](architecture/capacitor-migration.md)
- [Android production readiness](release/android-production-readiness.md)
