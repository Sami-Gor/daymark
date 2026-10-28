# Daymark

A client-side weather app: current conditions, hourly/daily forecast, UV, air quality, a UK-only micro-climate comparison, location search, a forecast-derived severe-weather risk layer, and optional voice (*Hear today* / *Ask Daymark*) with English/French/Spanish. Weather and place search use Open-Meteo.

## Run & Operate

- `pnpm --filter @workspace/weather-app run dev` — run the weather app (Vite dev server, http://localhost:5173; Replit injects its own `PORT`/`BASE_PATH`)
- `pnpm run typecheck` — typecheck all packages
- `pnpm run build` — typecheck + build all packages
- Local build defaults to `PORT=5173 BASE_PATH=/` when env vars are absent (Replit injects its own values)
- No backend, database, or server env vars required — the app calls Open-Meteo directly from the browser

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite 7 + Tailwind CSS 4, wouter router
- Data: Open-Meteo APIs (forecast, air quality, geocoding) — direct browser calls, no key required
- i18n: typed EN/FR/ES dictionaries in `src/locales/` (no i18n dependency); web voice uses browser Web Speech APIs, while Android uses local Kokoro for English output and system TTS for French/Spanish
- Optional env (documented, not yet consumed): `VITE_PURPLEAIR_API_KEY`

## Where things live

- `artifacts/weather-app` — the Daymark app; UI in `src/App.tsx` + `src/components/weather/`, weather logic and location-safe time helpers in `src/lib/weather.ts`, forecast-risk engine in `src/lib/weather-alerts.ts`, intent/response layer in `src/lib/weather-intents.ts`, browser speech adapters in `src/lib/voice-*.ts`, translations in `src/locales/`, theme in `src/index.css`
- `artifacts/weather-app/public` — PWA assets: `manifest.webmanifest`, `sw.js` (app-shell cache; build injects hashed assets via the `swPrecache` plugin in `vite.config.ts`), icons, favicon
- `artifacts/mockup-sandbox` — component design sandbox for redesign mockups (dev-only, never deployed)
- `scripts/` — workspace and post-merge helpers; `scripts/post-merge.sh` refreshes installs on merge

## Architecture decisions

- The web/PWA is a static client-side app; weather and geocoding requests go directly from the client to Open-Meteo.
- Android production builds use Capacitor with bundled local assets; the root `android/` directory is only the legacy TWA rollback project.
- Android English narration uses bundled local Kokoro; Android French/Spanish use system TTS. Web narration uses browser speech synthesis.

## Product

Client-only weather for any searched location: current conditions with plain-English advice, hourly/3-day forecasts, UV with a sun-protection window, US AQI, a UK-only micro-climate comparison, forecast-derived severe-weather risks (not official warnings), and optional voice in English, French or Spanish.

## Gotchas

- **Replit hosting does not automatically apply the repo's security headers.**
  `artifacts/weather-app/public/_headers` (Cloudflare Pages/Netlify format) ships
  with the build and carries the canonical CSP / HSTS / Permissions-Policy set.
  Replit static hosting ignores it — before deploying via Replit, configure those
  exact headers at the serving platform (or deploy `dist/public` to a host that
  reads `_headers`).
- Local/preview builds default to `PORT=5173 BASE_PATH=/` when env vars are absent (Replit injects its own values)
- `pnpm audit` may still report advisories in dev-only tooling (e.g. esbuild via vite); none of these packages ship in the production bundle

## Pointers

- See `README.md` (Local development) and `pnpm-workspace.yaml` for the workspace structure, TypeScript setup, and package details
