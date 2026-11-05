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
| Vitest | `pnpm --filter @workspace/weather-app run test` | **257 tests in 19 files** | Weather/validation/privacy logic, seeded-RNG helpers and the async-await guard |
| Playwright | `pnpm --filter @workspace/weather-app run test:e2e` | **164 tests in 19 spec files** | Rendering and behaviour of the built app in Chromium, with mocked Open-Meteo traffic |

Before this refactor the browser suite was one 2,867-line file with 153 tests;
it is now 19 focused specs. The 11 additional Playwright tests are randomised,
boundary and invalid-input coverage. The 21 additional Vitest tests cover the
seeded randomisation helpers (14) and the async-await guard (7).

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

# Vitest: unit tests, E2E support helpers, async-await guard
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
- **Not release evidence.** It does not verify signing, Play Console state,
  production deployment or a release build. Separate release checks apply.

## CI

`.github/workflows/ci.yml` installs with a frozen lockfile, then runs typecheck,
build, Vitest and Playwright in that order. The build step sets `PORT` and
`BASE_PATH`; the browser-test step sets `CI=1` (no focused tests allowed, no
server reuse). See [TESTING-REFERENCE.md](TESTING-REFERENCE.md#environment-variables)
for every supported environment variable.

## Related documents

- [Testing reference: commands, inventory, conventions](TESTING-REFERENCE.md)
- [Testing architecture: page objects, fixtures, randomisation](TESTING-ARCHITECTURE.md)
- [Architecture and the Capacitor migration](architecture/capacitor-migration.md)
