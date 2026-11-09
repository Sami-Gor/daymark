# Testing Daymark

This is the short guide for working on Daymark's tests. It covers the layers
that exist, how to run them, and what they do **not** prove. For file-by-file
detail see [TESTING-REFERENCE.md](TESTING-REFERENCE.md); for the design of the
Playwright suite see [TESTING-ARCHITECTURE.md](TESTING-ARCHITECTURE.md).

The suite is regression evidence for a solo-maintained, client-only app. A green
run means the asserted behaviour still holds at the commit you tested — it is
not a release approval.

## Layers at a glance

| Layer | Command | Current size | What it protects |
| --- | --- | --- | --- |
| TypeScript | `pnpm --filter @workspace/weather-app run typecheck` | app source + all of `tests/e2e` | Type errors in app code and Playwright code |
| ESLint (async safety) | `pnpm --filter @workspace/weather-app run lint:e2e` | 2 rules, scoped to `tests/e2e/**/*.ts` | Un-awaited promises and async-callback misuse in the Playwright suite |
| Vitest | `pnpm --filter @workspace/weather-app run test` | **266 tests in 20 files** | Weather/validation/privacy logic, seeded-RNG helpers and two async-safety guards |
| Playwright | `pnpm --filter @workspace/weather-app run test:e2e` | **164 tests in 19 spec files** | Rendering and behaviour of the built app in Chromium, with mocked Open-Meteo traffic |

Before this refactor the browser suite was one 2,867-line file with 153 tests;
it is now 19 focused specs. The 11 additional Playwright tests are randomised,
boundary and invalid-input coverage. The 30 additional Vitest tests cover the
seeded randomisation helpers (14), the invocation scanner (12) and the ESLint
guard (4).

## Current inventory

| Area | Spec files | Tests |
| --- | ---: | ---: |
| Core weather and hero | 5 | 43 |
| Location, geolocation and locality | 3 | 33 |
| Platform: responsive, mobile, accessibility, PWA | 4 | 23 |
| Content: i18n, privacy, security, store promo | 4 | 33 |
| Voice and severe-weather alerts | 2 | 21 |
| Randomised and boundary data | 1 | 11 |
| **Total (Playwright)** | **19** | **164** |

The per-file table, suite names and support/page-object inventory are in
[TESTING-REFERENCE.md](TESTING-REFERENCE.md#spec-files).

## Prerequisites

- **Node 24** (the CI-tested runtime; Node 20+ generally works) and **pnpm
  12.3.4**, which the repository enforces.
- Dependencies installed from the repo root: `pnpm install --frozen-lockfile`.
- Playwright's Chromium binary:
  `pnpm --filter @workspace/weather-app exec playwright install chromium`.
- A production build before running Playwright. The config starts
  `vite preview` itself; it does not build for you, and `security.spec.ts` also
  reads `dist/public/_headers`.

## Run everything

From the repository root:

```bash
pnpm install --frozen-lockfile

# Type-check app source and the Playwright suite (tsconfig + tsconfig.e2e.json)
pnpm --filter @workspace/weather-app run typecheck

# Type-aware async safety for the Playwright suite (ESLint)
pnpm --filter @workspace/weather-app run lint:e2e

# Vitest: unit tests, E2E support helpers, invocation scanner, ESLint guard
pnpm --filter @workspace/weather-app run test

# Build the production bundle the browser suite serves
pnpm --filter @workspace/weather-app run build

# Playwright: starts and stops `vite preview` on port 5177
pnpm --filter @workspace/weather-app run test:e2e
```

You do not need to start a server yourself for the browser tests. If a server is
already listening on the configured port, Playwright reuses it locally (not in
CI), which can mask a stale `dist/` — rebuild when in doubt.

## Run one spec, one group or one seed

```bash
# One spec file
pnpm --filter @workspace/weather-app exec playwright test specs/voice.spec.ts

# One describe/test group by title
pnpm --filter @workspace/weather-app exec playwright test specs --grep "voice"

# One test by title
pnpm --filter @workspace/weather-app exec playwright test specs --grep "renders the rain cue"

# A different preview port (useful for parallel local runs)
E2E_PORT=5191 pnpm --filter @workspace/weather-app run test:e2e

# Explore a different set of randomised data
DAYMARK_E2E_SEED=12345 pnpm --filter @workspace/weather-app run test:e2e
```

Every Playwright test gets a seed derived from its title, so rerunning the same
test reproduces the same generated data automatically. Failures print and attach
`random-seed`; see the [failure reproduction
procedure](TESTING-REFERENCE.md#seeded-randomisation-and-failure-reproduction)
for the exact semantics of `DAYMARK_E2E_SEED`.

## Async safety and waits

E2E async safety has three complementary layers, none of which is a complete
proof:

1. **Invocation scanner** (`tests/e2e/support/awaits.test.ts`, Vitest): catches
   un-invoked matcher references such as `expect(locator).toBeVisible;` — the
   original defect — plus un-awaited matcher/action calls in `specs/` and
   `pages/`. It is a line-based heuristic.
2. **Type-aware ESLint** (`pnpm --filter @workspace/weather-app run lint:e2e`):
   `no-floating-promises` (with `ignoreVoid: false`) and `no-misused-promises`
   across all of `tests/e2e`. Only those two rules are enabled; it is not
   general lint.
3. **Playwright runtime assertions**: auto-retrying `expect`/`expect.poll`
   assertions fail with a clear timeout when the expected state never appears.

For timing, prefer an observable signal (retrying assertion, `expect.poll`,
request log, harness event or controlled route delay). Three deliberately
bounded negative observation windows remain, each commented and justified
because the test asserts that something does **not** happen; see the [fixed-wait
inventory](TESTING-REFERENCE.md#fixed-wait-inventory) and the [waiting
policy](TESTING-REFERENCE.md#waiting-policy). Fixed readiness sleeps should not
be added.

## What the browser suite covers

- First paint, loading/error/retry states, unit conversion and the hero day cue
- Hourly temperature, rain timeline, 3-day forecast, UV, air quality, humidity,
  dew point, sun times and the regional comparison
- Location search, geolocation flows (deferred/timeout/denied) and offline
  locality naming
- Responsive layout from 320px to 1440px, mobile touch targets and axe-core
  accessibility checks
- PWA service-worker lifecycle, security headers and hostile-input (XSS)
  handling
- Voice controls with stubbed speech playback/recognition, severe-weather
  alerts and the English/French/Spanish interface
- Privacy storage limits and the public privacy-policy pages (EN/FR/ES)

## What it does not cover

- **Chromium only.** There is one Chromium project; Safari, Firefox, Edge and
  the Android WebView are not exercised.
- **Mocked network.** Open-Meteo, air quality, geocoding and the locality
  dataset are stubbed in every test. The suite does not test live providers,
  provider changes, rate limits or the deployed site.
- **No real device behaviour.** Geolocation, speech synthesis and speech
  recognition are harnesses. The suite does not exercise Android permissions,
  GNSS hardware, a physical microphone, bundled Kokoro audio or speech-accuracy
  quality.
- **Not comprehensive lint.** ESLint is scoped to `tests/e2e` and enables only
  the two async-safety rules; it is not a repo-wide style or bug lint.
- **Not release evidence.** It does not verify signing, Play Console state,
  production deployment or a release build. Separate release checks apply.

## CI

`.github/workflows/ci.yml` installs with a frozen lockfile, then runs typecheck,
`lint:e2e`, build, Vitest and Playwright in that order. The build step sets
`PORT` and `BASE_PATH`; the browser-test step sets `CI=1` (no focused tests
allowed, no server reuse). See
[TESTING-REFERENCE.md](TESTING-REFERENCE.md#environment-variables) for every
supported environment variable.

## Related documents

- [Testing reference: commands, inventory, conventions](TESTING-REFERENCE.md)
- [Testing architecture: page objects, fixtures, randomisation](TESTING-ARCHITECTURE.md)
- [Architecture and the Capacitor migration](architecture/capacitor-migration.md)
