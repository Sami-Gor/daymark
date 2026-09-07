# Daymark

A calm, privacy-conscious weather PWA built with React, Vite, TypeScript, and [Open-Meteo](https://open-meteo.com).

![Daymark on desktop](docs/images/daymark-desktop.png)

## Overview

Daymark answers one question well — *what's the sky doing?* — without dashboards, accounts, or tracking. It is a fully client-side app: your browser talks directly to the free Open-Meteo API, nothing is stored on any server, and location is only used when you ask for it.

## Features

- **Current weather** — temperature, feels-like, condition, and plain-English "umbrella?" / "sunglasses?" advice cards
- **Hourly outlook** — the next 12 hours with icons, temperatures, and rain chance
- **3-day forecast** — highs, lows, and precipitation per day
- **Sun on your skin** — current UV index with a protection range gauge, hourly UV strip, and a 3-day outlook
- **Air around you** — live US AQI with WHO/city comparison markers, pollutant breakdown (PM2.5, PM10, NO₂, O₃), and plain-English context
- **Your micro-climate** — a nearby high-resolution model grid point compared against the regional forecast
- **Dew point & comfort** — alongside humidity, because dew point is what your skin actually feels
- **°C / °F toggle**, graceful offline shell, and installable as an app (PWA)

## Interface

The design is editorial rather than dashboard-like — a serif-led hero with plain-English advice cards, matched forecast cards, and compact feature sections that each keep their own personality.

**Responsive, mobile-first** — the full page at 390px:

<details>
<summary><strong>View the full mobile page</strong></summary>

<p align="center"><img src="docs/images/daymark-mobile.png" width="320" alt="Daymark's full mobile layout at 390px"></p>

</details>

**Matched forecast pair** — the next five hours beside the 3-day outlook:

![Forecast cards](docs/images/daymark-forecast.png)

**Sun on your skin** — current UV with advice, today's peak, the next five hours, and a 3-day outlook:

![UV section](docs/images/daymark-uv.png)

**Air around you** — live AQI with plain-English context and pollutant readings:

![Air quality section](docs/images/daymark-air-quality.png)

## Tech stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org) + [Vite 7](https://vite.dev)
- [Tailwind CSS 4](https://tailwindcss.com) with a hand-written design layer (Fraunces, Plus Jakarta Sans, DM Mono — self-hosted)
- [Zod](https://zod.dev) for runtime validation of every API response
- [wouter](https://github.com/molefrog/wouter) for routing, [TanStack Query](https://tanstack.com/query) provider, [Radix](https://www.radix-ui.com) primitives
- pnpm workspaces; Vitest + Playwright for tests

## Architecture

Daymark is a **client-side single-page app + PWA**. There is:

- **No backend, no database, no server code** — the repository ships static files only
- **No user accounts, no analytics, no telemetry, no cookies**
- One workspace package that matters: `artifacts/weather-app` (plus `artifacts/mockup-sandbox`, a local-only design tool that is never deployed)

All weather logic lives in [`artifacts/weather-app/src/lib/weather.ts`](artifacts/weather-app/src/lib/weather.ts): typed Open-Meteo clients, permissive-but-strict Zod schemas at the network boundary, 10-second fetch timeouts, and the formatting/categorisation helpers. UI components live in `src/components/weather/`.

## Privacy approach

- **Geolocation is never requested on load.** The app opens on a default location (London) and only touches the Geolocation API when you press *Use my location*
- **Coordinates are rounded to 2 decimals (~1 km) before leaving your device**, then sent only to Open-Meteo endpoints
- **Nothing is persisted** — no localStorage, sessionStorage, IndexedDB, or cookies; location is used in-memory and discarded
- **No analytics or third-party trackers** — the only external requests are to the three Open-Meteo API hosts (plus the attribution link in the footer)
- Fonts are self-hosted; no CDN font requests

## Weather data source

All forecast, air-quality, and geocoding data comes from [Open-Meteo](https://open-meteo.com) — free for non-commercial use, no API key required. Daymark requests only what it renders and caches nothing on disk.

## PWA / offline behavior

Daymark installs as a standalone app (manifest + icons included). A minimal service worker caches the **app shell only** — HTML, hashed JS/CSS, fonts, and icons — so the app opens offline. Live weather always comes from the network: Open-Meteo responses are never cached, and a cold network shows a friendly error with retry rather than stale data. Updates follow network-first navigation with a versioned cache, so users are never trapped on an old build.

## Local development

Requires Node 20+ and [pnpm](https://pnpm.io):

```bash
pnpm install          # frozen lockfile enforced
pnpm --filter @workspace/weather-app run dev     # http://localhost:5173
```

Replit injects `PORT`/`BASE_PATH` in workspaces; locally they default sensibly (`5173`, `/`).

## Build

```bash
pnpm run build        # typecheck + build all packages
```

Output lands in `artifacts/weather-app/dist/public` — deploy it to any static host. `public/_headers` ships a production security-header set (CSP, HSTS, etc.) for hosts that honour it (Cloudflare Pages, Netlify); configure the same headers manually on hosts that don't.

## Test

```bash
pnpm --filter @workspace/weather-app run test         # Vitest unit suite (25 tests)
pnpm --filter @workspace/weather-app run test:e2e     # Playwright browser suite (23 tests)
```

The e2e suite runs against a production build served by `vite preview`, mocks Open-Meteo traffic, and covers function, responsive widths (320–1440), axe-core accessibility, geolocation privacy (including wire-level coordinate rounding), failure paths, the service worker, and the served security headers.

## Security

See [SECURITY.md](SECURITY.md). In short: minimal attack surface (11 runtime dependencies), every external response runtime-validated, a strict CSP (`default-src 'none'`, `script-src 'self'`), and no secrets anywhere in the client — there are none to leak.

## Project structure

```
artifacts/
  weather-app/            the app (React SPA + PWA)
    public/               manifest, service worker, icons, _headers
    src/lib/weather.ts    API boundary + Zod schemas + helpers
    src/components/       UI components
    src/fonts/            self-hosted fonts + licences
    tests/e2e/            Playwright suite
  mockup-sandbox/         local design sandbox (never deployed)
docs/                     README screenshots
scripts/                  workspace tooling
```

## Known limitations

- Unit preference (°C/°F) is not persisted across reloads
- The micro-climate comparison uses a UK model grid (UKV) — most meaningful in/around the UK
- Air-quality "nearby sensor" comparison is not yet wired to a sensor network; the regional forecast is shown
- The very first reload immediately after a service-worker update may briefly miss the offline shell (self-heals on the next reload)

## License

[MIT](LICENSE). Fonts are licensed under the SIL Open Font License 1.1 (see [`artifacts/weather-app/src/fonts/LICENSE.md`](artifacts/weather-app/src/fonts/LICENSE.md)). Weather data by [Open-Meteo](https://open-meteo.com) (CC BY 4.0 attribution requested for non-commercial use).

## Contributing

Issues and pull requests are welcome. Please keep the client-only architecture: no backend, no tracking, no new third-party network origins without discussion.
