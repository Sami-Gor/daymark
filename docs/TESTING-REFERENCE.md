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
| ESLint (async safety) | `artifacts/weather-app/tests/e2e/**/*.ts` | `artifacts/weather-app/eslint.config.mjs` | Type-aware, but only two async-safety rules; not repo-wide or comprehensive lint |
| Vitest | `src/**/*.test.ts` plus `tests/e2e/support/**/*.test.ts` | `artifacts/weather-app/vitest.config.ts` | Unit/source level; no browser |
| Playwright | `artifacts/weather-app/tests/e2e/specs/**/*.spec.ts` in Chromium | `artifacts/weather-app/playwright.config.ts` | Chromium only, mocked network, no Android WebView or real hardware |

The three support test files are deliberately Vitest tests, not Playwright specs:
`rng.test.ts` (seeded randomisation helpers, 14 tests), `awaits.test.ts`
(invocation-specific static scanner, 12 tests) and `eslint-guard.test.ts`
(regression proof that the ESLint rules fire, 4 tests). Playwright's `testMatch`
is `**/*.spec.ts`, so `*.test.ts` files under `tests/e2e/support/` are collected
only by Vitest.

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
under `tests/e2e` (including the deliberately-invalid lint fixtures). A non-zero
exit or any diagnostic is a failure.

### ESLint async safety

```bash
pnpm --filter @workspace/weather-app run lint:e2e
```

Runs `eslint tests/e2e --max-warnings=0` with the focused flat config in
`artifacts/weather-app/eslint.config.mjs`. The config is scoped to
`tests/e2e/**/*.ts`, uses `typescript-eslint` with parser project
`./tsconfig.e2e.json`, and enables exactly two error rules:

| Rule | Why it is on |
| --- | --- |
| `@typescript-eslint/no-floating-promises` (`ignoreVoid: false`) | A Playwright action/assertion promise must be awaited; `void promise` is not accepted as a silencer |
| `@typescript-eslint/no-misused-promises` | Catches an async function passed where a synchronous callback is expected (e.g. a `() => void` handler) |

This is **not** a general lint layer: no `@eslint/js`/`typescript-eslint`
recommended preset is enabled. The baseline was evaluated and produces
pre-existing findings outside this change's scope, so only the two async rules
are active. The `tests/e2e/lint-fixtures/` directory holds seven deliberately
invalid fixtures (plus one valid control) that the `lint:e2e` target ignores;
`support/eslint-guard.test.ts` lints them through the ESLint API with
`ignore: false` to prove both rules fire. CI runs `lint:e2e` in the `verify` job
immediately after Typecheck.

### Vitest

```bash
pnpm --filter @workspace/weather-app run test
```

Equivalent to `pnpm exec vitest run` inside `artifacts/weather-app`. The current
suite is **266 tests in 20 files**: 17 app-source test files (236 tests) plus
`tests/e2e/support/rng.test.ts` (14 tests), `tests/e2e/support/awaits.test.ts`
(12 tests) and `tests/e2e/support/eslint-guard.test.ts` (4 tests). The reporter
prints the file and test totals; no counts are hard-coded in config.

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
├── eslint.config.mjs           Focused type-aware async-safety rules for tests/e2e
├── playwright.config.ts        Playwright project, webServer, Chromium
├── tsconfig.e2e.json           TypeScript config for tests/e2e
├── vitest.config.ts            Unit-test include and @ -> src alias
└── tests/e2e/
    ├── specs/                  19 Playwright spec files (164 tests)
    ├── pages/                  7 page objects
    ├── lint-fixtures/          7 deliberately-invalid + 1 valid ESLint fixture
    └── support/                9 support modules + 3 Vitest test files (30 tests)
```

The pre-refactor `tests/e2e/app.spec.ts` no longer exists; its tests now live in
`specs/`.

### Spec files

Counts were taken with `pnpm exec playwright test specs --list`; run the same
command to re-check them.

| Spec file | Tests | `describe` suites | Focus |
| --- | ---: | --- | --- |
| `accessibility.spec.ts` | 2 | accessibility and zoom | axe-core serious/critical violations at desktop and mobile; waits for no running/pending animation before each colour scan; pinch-zoom viewport meta |
| `day-cue.spec.ts` | 8 | day cue hero | One emoji cue with a label, no redundant advice cards, EN/FR/ES copy, reduced motion |
| `geolocation.spec.ts` | 14 | geolocation flow | Deferred/timed/failed device location, option values, race handling (one 500 ms bounded negative window), browser-context permission tests |
| `locality.spec.ts` | 9 | offline locality naming | Weather never blocked by the locality dataset, low-confidence suppression and stale-result ordering observed through a test-only worker probe, localized fallbacks |
| `location-search.spec.ts` | 10 | location search; location selection loading | Debounced combobox, per-location weather, keyboard selection; request-log poll plus one 600 ms bounded negative window for the stale-search guard |
| `mobile-layout.spec.ts` | 10 | mobile touch targets and legibility; mobile viewport layout | 320–390px touch targets, legibility, insets, hero actions and search panel |
| `multilingual.spec.ts` | 10 | multilingual interface | Live EN→FR/ES switching, persistence, per-location locale, localized voice/alerts |
| `privacy.spec.ts` | 17 | privacy-safe persisted storage; privacy policy pages | Only the language preference persists; EN/FR/ES policy copy, links, overflow |
| `pwa.spec.ts` | 1 | PWA service-worker lifecycle (production build) | Root scope, shell precache, manifest, offline shell |
| `randomised-data.spec.ts` | 11 | randomised and boundary weather data | Seeded temperatures/rain/UV/location, boundaries, malformed/empty payloads (11 new tests); one 500 ms bounded negative window for the short-query guard |
| `responsive.spec.ts` | 10 | responsive layout across breakpoints | No horizontal overflow at 320/375/390/430/768/1024/1280/1440px; mobile data sections |
| `security.spec.ts` | 5 | security headers (preview server); security headers in build output; hostile input is rendered inert (XSS) | Served headers and CSP, `dist/public/_headers` parity, three XSS cases |
| `store-promo.spec.ts` | 1 | store promo gallery | Five Play promo images in order, with copy, alt text and dimensions |
| `voice.spec.ts` | 14 | voice playback and Ask Daymark | Narration toggle/end/language/stop, playback failure, unsupported recognition, privacy note, intent answers, lifecycle |
| `weather-alerts.spec.ts` | 7 | weather alerts | Absence, severity/timing, narration and intent layer, location changes; 320px layout waits for animations before axe |
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
| `support/animations.ts` | `expectAnimationsSettled(page)`: retrying `expect.poll` over `document.getAnimations()` that resolves when no animation is running or pending; used before axe colour scans instead of a fixed sleep. |
| `support/locality-worker.ts` | `LocalityWorkerProbe`: installs an `addInitScript` wrapper around `window.Worker` to record locality-worker messages; `waitForResult()` retries until a `{type:'result'}` message arrives. Used to replace fixed sleeps in `locality.spec.ts`. |
| `support/rng.test.ts` | 14 Vitest tests: determinism, ranges, seed resolution, generated payloads, frozen canonical fixtures. |
| `support/awaits.test.ts` | 12 Vitest tests: invocation-specific scanner cases plus a full scan of `specs/` and `pages/` for un-invoked/un-awaited Playwright matchers and actions. |
| `support/eslint-guard.test.ts` | 4 Vitest tests: runs the real ESLint config over `tests/e2e/lint-fixtures/`, asserts both rules are errors with `ignoreVoid: false`, that every invalid fixture reports its rule, and that the valid control is clean. |

The `tests/e2e/lint-fixtures/` directory (`floating-click`, `floating-goto`,
`floating-matcher`, `floating-multiline-assertion`, `floating-poll`,
`floating-void`, `misused-promise-callback`, `valid-async`) is test data for the
ESLint guard only: it is excluded from `lint:e2e`, but typechecked by
`tsconfig.e2e.json` and linted by the guard test through the ESLint API.

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
5. **Await every Playwright action and assertion; do not outrun the page.** Two
   static checks enforce the awaiting half — type-aware ESLint
   (`lint:e2e`: floating promises and promise misuse) and the invocation
   scanner in `support/awaits.test.ts` (un-invoked matcher references) — and
   Playwright's runtime assertions enforce it at execution. When a step depends
   on timing, wait on an observable signal rather than a duration; see
   [Waiting policy](#waiting-policy).
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
10. **Typecheck and lint your test code.** `pnpm --filter @workspace/weather-app
    run typecheck` includes `tsconfig.e2e.json`, and
    `pnpm --filter @workspace/weather-app run lint:e2e` applies the async-safety
    rules.
11. **Do not add a fixed sleep for readiness.** Prefer a retrying assertion,
    `expect.poll`, a request-log wait or a harness event. A bounded negative
    observation window is permitted only under the five conditions in
    [Waiting policy](#waiting-policy); leave a comment explaining what would
    have happened if the app were wrong.

## Waiting policy

Daymark E2E tests should wait on **observable state**, not on elapsed time. The
policy is deliberately narrow because a fixed sleep is the usual source of both
slow suites and intermittent failures.

### Preferred

- Playwright's auto-retrying assertions: `await expect(locator).toBeVisible()`,
  `toHaveText`, `toHaveCount`, `toHaveAttribute`, … These poll the DOM/state
  until the expectation holds or the assertion timeout expires.
- `expect.poll` for a value the page exposes indirectly (request counts,
  worker messages, animation state, geometry).
- Request-log/response signals: `page.waitForResponse`, or polling
  `requests.geocoding()` / `requests.forecast()` from the shared fixtures.
- Deterministic harness events: `geo.resolve`/`geo.fail`, `speech.emitResult`/
  `emitRecognitionEnd`, `LocalityWorkerProbe.waitForResult()`,
  `expectAnimationsSettled()`.
- Controlled route delays for timing scenarios: `api.delayForecast(...)`,
  `api.locality(..., { delay })`, the `locations()` Paris delay and the
  `geo.timed(...)` harness. These deliberately control when a response/fix is
  delivered; they are inputs, not guesses.

### Permitted exception: bounded negative observation window

A fixed `waitForTimeout` is allowed only when **all five** conditions hold:

1. The test proves something does **not** happen (absence of a request, a stale
   response not applied, etc.).
2. No reliable event or completion signal exists for that "did not happen" case.
3. The operation's delay is **controlled by the test** (a mocked route/harness
   with a known duration), so the window can be reasoned about.
4. The window comfortably covers that delay (and any debounce), with margin.
5. A comment explains what would have happened if the app (or guard) were wrong,
   so a future reader knows what the window is protecting.

If any condition is missing, use one of the preferred signals or add an
observable hook to the harness instead of widening the sleep.

### Not permitted

- Sleeping because the page "might not be ready" before interacting or asserting.
- An arbitrary wait before a click or before starting a new action.
- Using elapsed time in place of an available observable state.
- Repeatedly raising timeouts or sleep durations to push a flaky test through.

### Fixed-wait inventory

Verified against the code on this branch. "Removed" means a previous fixed wait
was replaced by an observable signal; "retained justified window" means the
bounded negative window above still exists; "controlled test delay" means the
duration is an intentional test input rather than a guess.

| File — test/helper | Duration | Behaviour under test | Observable signal exists? | Disposition |
| --- | --- | --- | --- | --- |
| `specs/accessibility.spec.ts` — axe scan | 300 ms `waitForTimeout` | Entrance/layout animations settled before the colour scan | Yes — `document.getAnimations()` running/pending | Removed → `expectAnimationsSettled()` (retrying poll) |
| `specs/weather-alerts.spec.ts` — 320px a11y | 200 ms `waitForTimeout` | Animations settled before the axe scan | Yes — same | Removed → `expectAnimationsSettled()` |
| `specs/locality.spec.ts` — LOW-confidence suppression | 800 ms `waitForTimeout` | Worker lookup finished and produced a low-confidence match while the UI stayed generic | Yes — worker `{type:'result'}` message | Removed → `LocalityWorkerProbe.waitForResult()` |
| `specs/locality.spec.ts` — search supersedes pending lookup | 1500 ms `waitForTimeout` | Stale worker result arrives after Paris is selected and must be ignored | Yes — worker result message; dataset delay is mocked (1200 ms) | Removed → worker-result probe |
| `specs/location-search.spec.ts` — latest query wins (before Tokyo) | 300 ms `waitForTimeout` | Debounced Paris geocoding request really started | Yes — request log | Removed → `expect.poll` over `requests.geocoding()` |
| `specs/location-search.spec.ts` — latest query wins (after Tokyo) | 600 ms `waitForTimeout` | Aborted Paris response does not overwrite Tokyo | No — aborted/stale path has no completion event | Retained justified window (covers the 500 ms Paris stub delay) |
| `specs/geolocation.spec.ts` — search while geolocation pending | 500 ms `waitForTimeout` | Stale location fix is silently ignored, not applied | No — ignored path emits no signal | Retained justified window (a generous multiple of the mocked round-trip) |
| `specs/randomised-data.spec.ts` — query shorter than 2 chars | 500 ms `waitForTimeout` | No geocoding request and no results panel appear | No — asserting absence | Retained justified window (twice the 250 ms search debounce) |
| `support/mocks.ts` — `RouteOptions.delay` | per-call ms (test input) | HTTP timing/latency scenarios | n/a — controlled input | Controlled test delay |
| `support/mocks.ts` — `locations()` Paris | 500 ms | Stale-search in-flight delay | n/a — controlled input | Controlled test delay |
| `support/geolocation.ts` — `timed()` | 10 ms timer, outcome compared with the app's timeout option | Device fix vs. app timeout flow | n/a — controlled input | Controlled test delay |
| `specs/**` — `api.locality(..., { delay })`, `api.delayForecast(...)` | 600–1500 ms | Loading, refresh and stale-request scenarios | n/a — controlled input | Controlled route delay |
| `support/network.ts` `waitForHostname`, `support/animations.ts`, `support/locality-worker.ts`, and specs that poll (`pwa`, `weather-core`, `weather-sections`, `location-search`, `store-promo`) | No fixed duration; default timeout (typically 5 s) | Retry until the observable state appears | Yes | Retrying `expect.poll` — preferred |
| `playwright.config.ts` | 30 s test, 5 s expect, 30 s webServer | Safety ceilings | n/a | Configuration, not a wait; do not raise to hide flakes |

There is no `setInterval` in the suite and no custom polling interval: retrying
polls use the library's backoff (optionally with a timeout/message).

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
| `lint:e2e` reports `no-floating-promises` or `no-misused-promises` | A Playwright promise is un-awaited, or an async function is used where a sync callback is expected | `await` the call, or restructure the callback; do not hide it with `void` (rejected by `ignoreVoid: false`) or an `eslint-disable` |
| `eslint-guard.test.ts` fails | A rule was disabled/reconfigured, the parser project changed, or the fixtures drifted | Re-run `lint:e2e`; keep both rules as errors with `ignoreVoid: false`; keep `tests/e2e/lint-fixtures/` excluded from the CLI target but linted by the guard test |
| A new timing problem tempts you to add a sleep | No observable signal chosen yet | Use the [Waiting policy](#waiting-policy); only assert absence with a documented bounded window under the five conditions |

For timing, follow the [Waiting policy](#waiting-policy): retrying assertions,
`expect.poll`, request-log waits, harness events and controlled route delays
first; a bounded negative observation window only under the five documented
conditions. Avoid `test.skip`/`test.fixme`/`.only`; CI forbids the latter and
skipped tests silently reduce coverage.

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
- which layer produced it (typecheck / `lint:e2e` / Vitest / Playwright) and the
  counts from that run — `--list` results are inventory, not execution evidence;
- for failures, the full test title, the `random-seed` attachment JSON and the
  error output.

## Related documents

- [Testing overview](TESTING.md)
- [Testing architecture](TESTING-ARCHITECTURE.md)
- [Architecture and the Capacitor migration](architecture/capacitor-migration.md)
- [Android production readiness](release/android-production-readiness.md)
