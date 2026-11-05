# Testing architecture

How the Playwright suite is structured after the QA-recommendations refactor,
and why. Commands and per-file counts live in
[TESTING-REFERENCE.md](TESTING-REFERENCE.md); the newcomer overview is
[TESTING.md](TESTING.md).

## What changed

The suite was one 2,867-line `tests/e2e/app.spec.ts` with 153 tests and locally
duplicated stubs. It is now 19 feature-focused specs (164 tests) using a shared
page-object layer and fixtures. The 11 extra tests are new randomised,
boundary and invalid-input coverage.

The refactor implements six recommendations from the QA review:

| # | Recommendation | Where it lives now |
| --- | --- | --- |
| 1 | Introduce page objects instead of inline selectors | `tests/e2e/pages/*.page.ts`, exposed by `support/fixtures.ts` |
| 2 | Split the monolithic spec by feature | `tests/e2e/specs/*.spec.ts` (19 files); `app.spec.ts` removed |
| 3 | Share setup instead of copy-pasted stubs | `support/fixtures.ts` auto fixtures + `support/{mocks,test-data,network,speech,geolocation}.ts`; spec-level `beforeEach` where navigation is common |
| 4 | Replace vague suite names with descriptive ones | Renamed `describe` suites: old `functional` split into `weather dashboard` / `geolocation flow`; `clean card redesign` → `live weather cards`; `useful bits` → `weather details (humidity and dew point)`; `UV simplification` → `UV forecast and protection window`; `security headers (preview environment)` → `security headers (preview server)`, and similar renames in every spec |
| 5 | Fix the missing `await` and prevent regressions | Fixed in `specs/weather-core.spec.ts`; static guard `support/awaits.test.ts` runs in the normal Vitest layer |
| 6 | Add seeded randomisation instead of fixed-only data | `support/rng.ts`, `support/test-data.ts`, `specs/randomised-data.spec.ts` |

## Directory layout

```text
artifacts/weather-app/
├── playwright.config.ts           # testDir tests/e2e, testMatch **/*.spec.ts, Chromium, preview server
├── tsconfig.e2e.json              # type-check config for tests/e2e
├── vitest.config.ts               # includes src/**/*.test.ts and tests/e2e/support/**/*.test.ts
└── tests/e2e/
    ├── specs/                     # 19 *.spec.ts files — only Playwright collects these
    │   ├── weather-core.spec.ts
    │   ├── weather-cards.spec.ts
    │   ├── weather-sections.spec.ts
    │   ├── weather-refresh.spec.ts
    │   ├── weather-alerts.spec.ts
    │   ├── day-cue.spec.ts
    │   ├── location-search.spec.ts
    │   ├── geolocation.spec.ts
    │   ├── locality.spec.ts
    │   ├── responsive.spec.ts
    │   ├── mobile-layout.spec.ts
    │   ├── accessibility.spec.ts
    │   ├── pwa.spec.ts
    │   ├── multilingual.spec.ts
    │   ├── privacy.spec.ts
    │   ├── security.spec.ts
    │   ├── randomised-data.spec.ts
    │   ├── store-promo.spec.ts
    │   └── voice.spec.ts
    ├── pages/                     # page objects only (no test data, no network setup)
    │   ├── dashboard.page.ts
    │   ├── weather-sections.page.ts
    │   ├── location-search.page.ts
    │   ├── voice-controls.page.ts
    │   ├── weather-alerts.page.ts
    │   ├── privacy-policy.page.ts
    │   └── store-promo.page.ts
    └── support/                   # shared harnesses + Vitest unit tests
        ├── fixtures.ts            # exported test/expect and all fixtures
        ├── mocks.ts               # ApiMocks network stubs
        ├── test-data.ts           # canonical fixtures + generated scenarios
        ├── rng.ts                 # seeded PRNG + seed resolution
        ├── network.ts             # RequestLog, BrowserLog
        ├── speech.ts              # SpeechHarness
        ├── geolocation.ts         # GeolocationHarness
        ├── rng.test.ts            # Vitest (14 tests)
        └── awaits.test.ts         # Vitest (7 tests)
```

`testMatch` is `**/*.spec.ts`, so support `.test.ts` files are invisible to
Playwright and run under Vitest. `tsconfig.e2e.json` type-checks everything
under `tests/e2e`; the package `typecheck` script runs it after the app config.

## Page object model

**Design.** One page object per app area, constructed with the Playwright
`Page`, with locators defined once in the constructor and behaviour-focused
methods on top. The split is:

| Page object | Owns | Does not own |
| --- | --- | --- |
| `DashboardPage` | Header/brand, unit toggle, language select, location controls, hero (city/date/temperature/day cue), loading/error/retry/toast, page geometry | Weather data sections, search internals, voice |
| `WeatherSectionsPage` | Temperature, rain, details, sun, forecast-pair, UV, air and micro-climate sections; value queries and assertions used by the specs | Hero, header, network setup |
| `LocationSearchPage` | Combobox input/status/results/options, selection, keyboard interaction and search helpers | Geocoding stubs, weather payloads |
| `VoiceControlsPage` | "Hear today" and Ask Daymark controls, their state and panel/error content | Speech API stubs (that is the `speech` fixture) |
| `WeatherAlertsPage` | Alert section/list, per-hazard cards and their content locators | Risk-engine input data |
| `PrivacyPolicyPage` | `/privacy`, `/fr/privacy`, `/es/privacy` copy, links, language switcher | Policy text expectations (in `test-data.ts`) |
| `StorePromoPage` | `/store-preview` gallery images, titles, captions, dimensions | Promo copy fixtures (in `test-data.ts`) |

**Rules the suite follows.**

1. A test never selects app DOM directly when the owning page object already
   exposes it. If a selector is needed repeatedly, add a locator or method to
   the page object instead of copying it into a spec. Selecting a child of an
   exposed locator (e.g. `sections.uvPanel.locator('.uv-badge')`) is fine when
   the page object intentionally exposes the container.
2. Locators live in the constructor; methods express user intent (`open()`,
   `searchAndSelect()`, `selectUnit()`, `expectAlert()`), not implementation
   detail.
3. Page objects may contain assertions when the assertion is the reusable
   contract (`expectReady()`, `expectTemperature()`, `expectRainValues()`,
   `expectLoaded()`, `expectAlert()`). They never install routes, seed RNG or
   create contexts.
4. `page.evaluate` in a spec is allowed for one-off geometry, scroll and
   build-output checks that a page object would only wrap 1:1. It is not a
   licence to bypass the POM for normal UI interaction.
5. The objects stay area-sized. `WeatherSectionsPage` is the largest because
   the "sections below the hero" really are one cohesive area; it is not an
   everything-object (no hero, no search, no voice).

## Fixture graph

`support/fixtures.ts` extends the base Playwright test. Specs import only from
there:

```text
                    ┌──────────────────────────────┐
                    │ test = base.extend(...)      │
                    └──────────────┬───────────────┘
                                   │
   auto fixtures (run before every test body)
   ├── seed ──────────────► random            (per-test seeded PRNG)
   ├── api ───────────────► ApiMocks(page)    (canonical Open-Meteo + locality stubs)
   ├── requests ──────────► RequestLog(page)  (request observation)
   └── browserLog ────────► BrowserLog(page)  (console + page errors)
                                   │
   on-demand fixtures
   ├── dashboard / sections / search / voice / alerts / privacy / promo
   │        └── each wraps the same Page in its page object
   ├── geo ───────────────► GeolocationHarness(page)
   └── speech ────────────► SpeechHarness(page)
            options: speechPlaybackFails (default false),
                     speechRecognitionSupported (default true)
```

Why this ordering matters:

- `api` is `auto`, so the canonical mocks exist before any test navigates. A
  test that needs different data registers a later route (see below) and then
  navigates.
- `seed` is `auto`; `random` depends on it. Every test therefore has a stable
  seed whether or not it uses randomness, and failures can attach it.
- `speech` and `geo` are requested explicitly because their `addInitScript`
  stubs must be installed before the app's first render. A `beforeEach` that
  needs them lists them in its arguments; fixture setup order guarantees the
  scripts are installed before that hook navigates.
- `speech` options are Playwright options, so a suite can model a degraded
  environment with one line:
  `test.use({ speechPlaybackFails: true })` or
  `test.use({ speechRecognitionSupported: false })`.

Route precedence is "last registered wins" in Playwright, which gives the
override-before-navigation convention:

```ts
test('renders a wet day', async ({ api, dashboard }) => {
  await api.forecast(wetForecast); // registered after the canonical default
  await dashboard.open();          // first navigation sees the override
});
```

## Shared setup policy

Use `beforeEach` only when **every** test in that `describe` needs the same
setup and the setup can run before the test body. Current uses:

- `specs/weather-core.spec.ts` — `dashboard.open()` for the canonical-forecast
  sub-suite; `speech` + `open()` for the hero-action suite.
- `specs/pwa.spec.ts` — `open()` before the single service-worker test.

`accessibility.spec.ts` deliberately does **not** use a hook: the axe test calls
`page.emulateMedia({ reducedMotion: 'reduce' })` and `dashboard.open()` inline,
because reduced motion should not leak into the pinch-zoom test.

Keep per test:

- **Viewport size.** It must be set before the first render, and different
  tests need different widths (`responsive.spec.ts`, `mobile-layout.spec.ts`).
- **Network payloads and failures.** Only the tests that need bad data should
  install a bad-data route; a shared failing route would make the suite
  unreadable and order-dependent.
- **Fixture options** (`test.use` is scoped to a `describe`, not a single
  test — put it in a nested `describe` for the degraded case, as
  `voice.spec.ts` does).
- **One-off harness setup** (a specific geolocation timing, a speech result).
- **Environment emulation for a single test**, such as reduced motion in the axe
  test; a hook would apply it to the whole suite.

Everything else — canonical mocks, request/browser logs, seed, random — is an
auto fixture and needs no setup line.

## Isolation guarantees

- Playwright creates a fresh `BrowserContext` and `Page` for every test, so
  localStorage, cookies, caches, service workers and route handlers do not leak
  between tests.
- All routes are registered on the test's own page via `ApiMocks`; there is no
  global interceptor.
- Specs contain no module-level mutable state. Test-order independence is part
  of the contract; `--repeat-each`, `--shuffle` and running one spec in
  isolation are all valid.
- Randomness is per-test (seed derives from the title path), so no test consumes
  another test's stream.
- Tests that need the browser's own permission emulation create a dedicated
  context/page (`geolocation.spec.ts` does this for the granted/denied cases)
  instead of changing the shared page.
- The default viewport is 1280×800 from `playwright.config.ts`; a test that
  changes it owns that change for its own page only.

## Randomisation strategy

The goal is variation between runs/tests **without** losing reproducibility:

1. `hashString` (FNV-1a 32-bit) turns a stable test identifier into a seed.
   `resolveSeed(titlePath)` uses the joined title path; with
   `DAYMARK_E2E_SEED` set it uses `hash(rawOverride + '::' + title)` so each
   test still gets a distinct stream.
2. `createSeededRandom` (mulberry32) produces the stream; `randomFloat`,
   `randomInt` and `randomItem` keep generated values in realistic ranges.
3. `generateWeatherScenario` + `buildForecastForScenario` /
   `buildAirForScenario` build payloads from the **frozen canonical fixtures**,
   so deterministic regression data is never mutated and generated data is new
   coverage rather than a replacement.
4. The `seed` fixture annotates every test with `random-seed`; on failure it
   logs the resolved seed and whether it came from the title or
   `DAYMARK_E2E_SEED`, and attaches JSON with `{ seed, envSeed, titlePath }`.
   Rerunning the same test in the same environment reproduces the data.
5. Boundary and invalid-input cases use explicit fixed values (`-50`, `0`,
   `100`, `null`, malformed payloads) rather than random ones; randomisation is
   for realistic variation, not for finding boundaries.

`support/rng.test.ts` pins these properties (determinism, distinct streams,
ranges, frozen fixtures) in the unit layer, so a change to the PRNG or seed
policy fails fast without a browser.

## Async-await guard

The original defect was an assertion with no invocation/await
(`expect(...).toBeVisible;`), which silently never runs. Two layers prevent it
returning:

1. **The fix.** The corresponding test in `specs/weather-core.spec.ts` now uses
   `await expect(dashboard.currentTemperature).toBeVisible()` with a comment
   marking it as the regression guard.
2. **The static guard.** `support/awaits.test.ts` parses `specs/` and `pages/`
   and reports:
   - un-awaited Playwright matchers (`toBeVisible`, `toHaveText`,
     `toContainText`, `toHaveAttribute`, …), including matchers on the
     following lines of a multiline `expect`;
   - un-awaited `expect.poll`;
   - un-awaited async page/context actions (`click`, `fill`, `goto`, `route`,
     `evaluate`, …), while ignoring event subscriptions such as
     `page.on('request', …)` and synchronous assertions on plain values.

   It runs in the normal Vitest layer (`pnpm --filter @workspace/weather-app
   run test`), so CI fails on a new violation. Its own six unit cases verify
   the scanner against true and false positives; a seventh scans the real E2E
   sources.

Limits: it is a line-based heuristic, not a TypeScript type-aware checker. It
does not scan `support/` and cannot prove the absence of every async mistake —
but it catches the class of defect that prompted the recommendation, cheaply
and with no extra tooling.

## Extending the suite

To add a browser test:

1. Pick the existing spec file for the feature area; only create a new spec if
   the area is genuinely new.
2. Import from `../support/fixtures` and request the page objects/fixtures you
   need (a new locator usually belongs in a page object first).
3. Register any network override through `api` **before** navigation; use
   `support/test-data.ts` for payloads instead of inline objects when the data
   is reused.
4. Use the seeded `random` only when realistic variation adds value; keep
   boundary/invalid cases explicit.
5. Await every action and assertion, keep no module-level state, name the
   `describe` after the behaviour.
6. Check the inventory, then run the file, then typecheck:

   ```bash
   cd artifacts/weather-app
   pnpm exec playwright test specs/<file>.spec.ts --list
   pnpm exec playwright test specs/<file>.spec.ts
   pnpm --filter @workspace/weather-app run typecheck
   ```

7. If you add a support helper with logic, add a Vitest test beside it in
   `support/*.test.ts` — not a Playwright spec.

## Deliberate boundaries

Some checks intentionally stay outside the page-object abstraction: served
security headers and `dist/public/_headers` parity read the filesystem/preview
response, responsive widths use raw geometry (`documentElement.scrollWidth`),
and the service-worker test drives the browser APIs directly. Wrapping those in
page objects would add indirection without reuse.

## Related documents

- [Testing overview](TESTING.md)
- [Testing reference](TESTING-REFERENCE.md)
- [Architecture and the Capacitor migration](architecture/capacitor-migration.md)
