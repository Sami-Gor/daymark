# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security problems.

Use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-reviewing/privately-reporting-a-security-vulnerability) on this repository (Security → Report a vulnerability) if enabled. Otherwise, open a security advisory draft or contact the repository owner through their GitHub profile.

Please include a description, reproduction steps, and affected file paths where possible. Reports are handled in good faith; coordinated disclosure is appreciated.

## Scope

The scope is this repository's code as deployed from `artifacts/weather-app/dist/public` — a static, client-side PWA. Issues in third-party services (e.g. Open-Meteo itself) or in hosting-platform configuration outside this repository are out of scope, though misconfigurations shipped *in* this repository (e.g. the `_headers` file) are in scope.

## Security posture

Daymark is deliberately minimal:

- **Client-only** — no backend, database, accounts, or sessions; nothing to breach server-side
- **Minimal supply chain** — 11 runtime dependencies, lockfile-pinned, with a minimum-release-age install policy
- **Runtime validation** — every Open-Meteo response is parsed through Zod schemas at a single network boundary; malformed data degrades gracefully
- **Bounded requests** — all external fetches carry a 10-second timeout
- **Privacy by default** — geolocation only on explicit user action; coordinates rounded to ~1 km precision before transmission; nothing persisted in browser storage; no analytics or cookies
- **Strict CSP** — `default-src 'none'`, `script-src 'self'`, `connect-src` limited to this origin and the three Open-Meteo hosts; no `unsafe-eval` (production header set ships in `artifacts/weather-app/public/_headers`)
- **Service worker isolation** — caches the same-origin app shell only; Open-Meteo traffic is never intercepted or cached

## Supported versions

The default branch (`main`) is supported. There are no tagged releases yet; fixes apply to the tip of `main`.
