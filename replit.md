# Daymark

A client-side weather app: current conditions, hourly/daily forecast, UV, air quality, and a hyperlocal micro-climate comparison, powered by Open-Meteo.

## Run & Operate

- `pnpm --filter @workspace/weather-app run dev` — run the weather app (Vite dev server, http://localhost:5173; Replit injects its own `PORT`/`BASE_PATH`)
- `pnpm run typecheck` — typecheck all packages
- `pnpm run build` — typecheck + build all packages
- Local build defaults to `PORT=5173 BASE_PATH=/` when env vars are absent (Replit injects its own values)
- No backend, database, or server env vars required — the app calls Open-Meteo directly from the browser

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite 7 + Tailwind CSS 4, wouter router, TanStack Query provider
- Data: Open-Meteo APIs (forecast, air quality, geocoding) — direct browser calls, no key required
- Optional env (documented, not yet consumed): `VITE_PURPLEAIR_API_KEY`

## Where things live

- `artifacts/weather-app` — the Daymark app; all UI and weather logic in `src/App.tsx`, theme in `src/index.css`
- `artifacts/mockup-sandbox` — component design sandbox for redesign mockups (dev-only, never deployed)
- `scripts/` — workspace tooling placeholder; `scripts/post-merge.sh` refreshes installs on merge

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
