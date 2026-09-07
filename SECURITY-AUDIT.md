# Daymark Weather App — Security Audit

**Date:** 2026-09-07
**Scope:** Full repository at `/Users/m1/Desktop/Weather-App`, commit `b73b11e` plus current uncommitted working-tree state (the local-validation changes to `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and the mockup registry described in §2).
**Method:** Static review of all source, configuration, build scripts, lockfile, and full git history; `pnpm audit` (read-only); production-bundle inspection. No code was modified; nothing was installed or upgraded.
**Auditor note:** Every finding below is tied to file/line evidence. Where static inspection cannot reach (deployed headers, CORS behavior of third parties, runtime permission UX), the required runtime test is stated explicitly.

---

## 1. Executive summary

**Daymark is, today, a small and unusually clean attack surface.** The deployed product is a fully client-side React SPA that talks only to Open-Meteo over HTTPS, stores nothing, has no accounts, no cookies of its own, no analytics, and no backend in the request path. Full-history secret scanning came back clean. No XSS sink, no dynamic code execution, no prototype-pollution sink, and no command-injection surface exists in shipped code. The production bundle was inspected and contains no dev tooling, no unused component code, and no embedded secrets.

**There are no Critical or High findings for the app as currently deployed.** The realistic risks are forward-looking: the things that will matter when the app is published on the open web and packaged for Google Play:

1. **No Content-Security-Policy or security headers are configured anywhere** (DAYMARK-SEC-001) — acceptable today, must-fix before public deployment.
2. **Geolocation is requested automatically on first load** without a user gesture, and coordinates are transmitted unrounded to three Open-Meteo hosts (DAYMARK-SEC-002) — a privacy-UX issue with Google Play Data Safety implications, not a vulnerability.
3. **A complete but unused backend stack** (Express, PostgreSQL/Drizzle, OpenAPI client, Replit connectors SDK) and **~40 unused frontend dependencies** remain in the workspace. None are reachable in production, but every unused package is unaudited attack surface and all current `pnpm audit` advisories (11, none exploitable) live in exactly these dev/unused chains (DAYMARK-SEC-005–008).
4. **The Replit scaffolding is correctly gated** — dev banners/cartographer/error overlays are verified absent from the production bundle — but deployment metadata and placeholder branding ("built on Replit") leak origin details worth cleaning (DAYMARK-SEC-012, §12).

**Recommended packaging path for Google Play: PWA + Trusted Web Activity (TWA).** It adds no JavaScript bridge, no native storage, and no exported components — by far the smallest attack surface for an app that is already a pure client SPA. Details and requirements in §11.

**Backend recommendation:** the unused Express/Postgres/OpenAPI stack should eventually be deleted, not hardened. There is no security reason for a proxy in front of Open-Meteo today (§10, §4).

---

## 2. Scope and methodology

### What was reviewed (all 204 tracked files inventoried)

| Area | Items reviewed |
|---|---|
| Client app | `artifacts/weather-app/src/**` (App.tsx 1012 lines read in full, error-boundary, not-found, main.tsx, all 50 shadcn `ui/*` files pattern-scanned), `index.html`, `index.css`, `vite.config.ts`, `package.json` |
| Mockup sandbox | `src/App.tsx`, `mockupPreviewPlugin.ts`, `vite.config.ts`, generated registry |
| API server | `src/app.ts`, `index.ts`, `routes/*`, `lib/logger.ts`, `build.mjs`, `package.json`, `.replit-artifact/artifact.toml` |
| Shared libs | `lib/db/**` (Drizzle schema/config), `lib/api-spec/**` (OpenAPI + Orval), `lib/api-client-react/**` (custom-fetch ~430 lines), `lib/api-zod/**` |
| Tooling | `scripts/**`, `post-merge.sh`, `.replit`, `.replitignore`, `.npmrc`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `.env.example`, all three `artifact.toml` files |
| VCS | Full git history (10 commits) pattern-scanned for secrets; hooks and `core.hooksPath` checked |
| Build output | `dist/public/assets/*.js` inspected for dev-tooling leakage, tree-shaking effectiveness, and unsafe-HTML sinks |
| Dependencies | `pnpm audit` (11 advisories) + manual review of overrides, catalog, and install scripts |

### Not covered (requires runtime or platform access)

- Response headers actually served by the deployment host (nothing is deployed yet from this repo state).
- Open-Meteo's real-world behavior under malformed responses, and PurpleAir CORS behavior (feature not implemented).
- Replit platform-side security (account, deploy pipeline, database provisioning) — out of scope.
- `.zcode/plans/` session notes (gitignored; covered by the repo-wide secret scan — no matches; not reviewed line-by-line).

---

## 3. Application architecture

### Packages and their role

| Package | Purpose | Status |
|---|---|---|
| `artifacts/weather-app` | **The product.** React 19 + Vite 7 + TS SPA. Open-Meteo client. | Active, deployed as **static files** (`artifact.toml`: `serve = "static"`, `publicDir = artifacts/weather-app/dist/public`, SPA rewrite to `index.html`) |
| `artifacts/api-server` | Express 5 scaffold: single `GET /api/healthz`, pino logging | **Unused by the frontend.** Has its own production run config, but nothing calls it |
| `artifacts/mockup-sandbox` | Design-tool component preview server (`/__mockup`) with a file-watching codegen plugin | Dev-only; must never ship |
| `lib/db` | Drizzle ORM + `pg` pool; schema file is a template with **zero tables** | Unused (`@workspace/db` declared by api-server, never imported) |
| `lib/api-spec` | OpenAPI 3.1 spec (health endpoint only) + Orval codegen config | Dev-time codegen only |
| `lib/api-client-react` | Orval-generated react-query client + generic `customFetch` | Unused — declared in weather-app deps, never imported |
| `lib/api-zod` | Orval-generated Zod schemas | Used only by api-server's health route |
| `scripts` | `hello.ts` placeholder | Trivial |

### Entry points

1. **Browser → static SPA** (`/`, any path rewritten to `index.html`). The only production entry point.
2. Browser → `geocoding-api.open-meteo.com`, `api.open-meteo.com` (×2 distinct calls), `air-quality-api.open-meteo.com`, `fonts.googleapis.com`/`fonts.gstatic.com`.
3. Dev-only: Vite dev servers (ports from `PORT` env), Express dev server, Orval CLI, drizzle-kit CLI.
4. Replit-agent automation: `scripts/post-merge.sh` (runs on post-merge: `pnpm install --frozen-lockfile` + `pnpm --filter db push`).

### Environment variables (complete inventory)

| Variable | Read where | Sensitivity |
|---|---|---|
| `PORT` | all three vite configs, api-server `index.ts` | none (routing) |
| `BASE_PATH` | weather-app + mockup-sandbox vite configs → Vite `base` | none |
| `REPL_ID`, `NODE_ENV` | vite configs — gate Replit dev plugins | none (verified compiled out of prod bundle) |
| `LOG_LEVEL`, `NODE_ENV` | api-server logger | none |
| `DATABASE_URL` | `lib/db` (throws if missing) | **would be a credential** — no value exists anywhere; package unused |
| `VITE_PURPLEAIR_API_KEY` | **documented in `.env.example` only — no code reads it** | would ship in the JS bundle if used client-side (see DAYMARK-SEC-010) |

No `.env` file exists on disk. `.env`/`.env.*` are gitignored with `!.env.example` whitelist.

### Third-party services

- **Open-Meteo** (3 hosts: forecast, air-quality, geocoding) — free, keyless, HTTPS. All calls are read-only GETs built with `URLSearchParams` (correctly encoded everywhere).
- **Google Fonts** — CSS + font files (see DAYMARK-SEC-011).
- **PurpleAir** — documented, not implemented.

### Build/install scripts and hooks

- `onlyBuiltDependencies` allow-list: `@swc/core`, `esbuild`, `msw`, `unrs-resolver`; plus (uncommitted, added during local validation) `allowBuilds: esbuild: true` — see the cleanup note in §8.
- api-server `build.mjs` (esbuild bundler config — large `external` list, no code execution beyond bundling).
- **No git hooks** (`.git/hooks` contains only samples; `core.hooksPath` unset). `post-merge.sh` is invoked by Replit's agent config, not by git.
- No generated code is executed at runtime except the mockup registry (dev tool only).

---

## 4. Data flow and trust boundaries

```
                        ┌────────────────────────── TRUST BOUNDARY A ─────────────────────────┐
                        │  Build machine (dev laptop / Replit)                                │
                        │   npm registry ──→ pnpm install (minimumReleaseAge: 1440,           │
                        │                     allow-listed build scripts, frozen lockfile)    │
                        │   vite build ──→ dist/public  (static, no secrets embedded)         │
                        └───────────────────────────────┬─────────────────────────────────────┘
                                                        │ publish
                                                        ▼
┌─────────────┐   HTTPS GET /   ┌──────────────────────────────────┐
│   Browser   │◄────────────────┤  Static host (Replit autoscale,  │  TB-B: user ↔ static host
│  (untrusted │                 │  headers NOT yet configured —    │       (host is trusted to
│   input)    │                 │  DAYMARK-SEC-001)                │        serve correct app)
└──┬───┬───┬──┘                 └──────────────────────────────────┘
   │   │   │  HTTPS GET + coords in query string
   │   │   ├──────────────────────────► api.open-meteo.com/v1/forecast        (weather, 7d)
   │   │   ├──────────────────────────► api.open-meteo.com/v1/forecast        (micro-climate, ukmo)
   │   ├──────────────────────────────► air-quality-api.open-meteo.com        (AQI, 3d)
   │                                    TB-C: browser ↔ Open-Meteo (UNTRUSTED responses)
   └──────────────────────────────────► geocoding-api.open-meteo.com          (reverse geocode)
                                        TB-D: browser ↔ Google Fonts          (CSS + woff2)
```

**Trust boundary summary**

| Boundary | Direction | Data crossing | Trust stance |
|---|---|---|---|
| A: registry → build | inbound code | all dependencies | semi-trusted, mitigated by lockfile + release-age policy |
| B: user ↔ host | bidirectional | SPA assets | host trusted; user input untrusted (but app accepts almost none — no forms, no URL params read) |
| C: browser ↔ Open-Meteo | inbound data | JSON weather/air/geo payloads | **untrusted** — currently blind-cast (DAYMARK-SEC-003) |
| D: browser ↔ Google Fonts | inbound | CSS/fonts | untrusted but render-only; no SRI possible with the CSS API |

Key observation: **the app reads nothing attacker-controlled from its own URL** — wouter is used only for base-path routing, there are no query-parameter readers, no forms, and no storage. The only user-influenced inputs are the geolocation coordinates (device-controlled) and data returned by Open-Meteo. This is why the client XSS surface is effectively nil.

---

## 5. Privacy / data inventory

Complete inventory of user data collected, stored, processed, or transmitted:

| Data | Collected | Stored | Transmitted to | Lifetime |
|---|---|---|---|---|
| **Device coordinates** (browser Geolocation API) | Yes — automatically on first load (`App.tsx:895` → `findMe(true)`), and on button press (`App.tsx:933`, `:961`) | **No** — React state + one in-memory Map only | Open-Meteo ×3 hosts, **in URL query strings**, unrounded (`App.tsx:120-137, 151-158, 874`) | Request lifetime; micro-climate cache entry 15 min, keyed to coords rounded to 3 decimals (`App.tsx:147`) |
| **Place name** (from Open-Meteo reverse geocode or fallbacks "London"/"Your location") | Derived | No | none (rendered only) | Session |
| **Unit preference (°C/°F)** | User toggle | **No** — not persisted (resets on reload) | none | Session |
| Anything else | **No.** No localStorage/sessionStorage/IndexedDB (verified by scan and bundle), no app cookies (the only `document.cookie` is in unused shadcn `sidebar.tsx` — not bundled), no analytics, no logging SDK, no service worker, no crash reporter | | | |

**Geolocation specifics (evidence):**

- Requested **without user gesture on first load**: `useEffect(() => { findMe(true); }, [findMe])` (`App.tsx:895`).
- Options: `enableHighAccuracy: false, maximumAge: 300000, timeout: 5000` (`App.tsx:888-892`) — good defaults; cached position reused up to 5 min.
- **Denied/unavailable behavior:** silent fallback to London with no error when `useFallback=true` (initial load, `App.tsx:869`); explicit error message + retry on manual button (`App.tsx:884-887`). This is graceful, but see DAYMARK-SEC-002: a user who denies gets London weather with no explanation on first visit.
- Coordinates are **never** placed in the page URL, logs (there are none), or analytics (there is none). They do appear in Open-Meteo request URLs — visible to the browser history of network tools but not stored by the app.
- Reverse geocoding sends the same coords with `count=1&language=en` (`App.tsx:874`).
- **Approximate location would be sufficient** for every feature in the app (weather/AQI/UV at neighborhood scale; the micro-climate card itself rounds to ~110 m and labels itself "not block-level precision", `App.tsx:804`). `enableHighAccuracy: false` already biases away from GPS, but the browser may still hand over precise coordinates; client-side rounding to 2 decimals (~1.1 km) before transmission is a cheap minimization step (recommended in DAYMARK-SEC-002).

**Google Play Data Safety implications (for the future Android release):**

- Declare: **Location → Precise location — Collected, shared? No — transmitted to a third party (Open-Meteo) for app functionality, ephemeral, not stored.** Under Play policy, data sent off-device but not retained by the developer is "collected" (transmitted) but "not shared" in the partner-sharing sense if Open-Meteo acts as a processor; the conservative and accurate declaration is "Collected: precise/approximate location; Purpose: app functionality; Not shared; Ephemeral."
- If coordinates are rounded client-side before transmission (recommended), **Approximate location** becomes the accurate declaration, and the Play "location permission" prominence requirements get easier.
- No other Play-relevant data types exist today (no identifiers, no analytics, no ads).

**Android location note:** in a TWA, the geolocation permission prompt is issued by the embedded Chrome against the web origin and delegated via Digital Asset Links; no Android location permission is declared in the app. In a native wrapper (Capacitor/RN) you would declare Android location permissions and inherit Play's foreground-location policy review — a meaningful extra compliance burden (§11).

---

## 6. Threat model (STRIDE)

Assets: **A1** user location coordinates; **A2** user trust/brand (serving correct weather data); **A3** build pipeline integrity; **A4** (future) Play signing key / store listing; **A5** PurpleAir key, if ever introduced.

| # | Threat (STRIDE) | Attacker → path | Impact | Current protection | Mitigation |
|---|---|---|---|---|---|
| T1 | **Tampering/Spoofing:** malicious or compromised Open-Meteo response (API compromise, DNS hijack, hostile network MITM) serves crafted JSON | Garbage/NaN values rendered; `Date.parse` confusion; **script injection is blocked by React escaping** (no HTML sinks exist) | Low–Med: wrong weather shown, possible unhandled exception caught by ErrorBoundary | HTTPS; React auto-escaping; extensive `Number.isNaN`/`undefined` guards; ErrorBoundary | Zod (already in workspace, unused) to validate responses (DAYMARK-SEC-003); HSTS |
| T2 | **Spoofing/MITM:** network attacker on hostile Wi-Fi | Strip/replace API responses | Same as T1 | All requests HTTPS-only by construction | HSTS on host; nothing else needed |
| T3 | **Spoofing (UI):** malicious site iframes the app (clickjacking) to trick a user into pressing "Use my location" | Permission still gated by browser origin — attacker gains at most a click on a visible page | Low (browser gates the actual sensitive grant) | None configured | `frame-ancestors 'none'` with the CSP (DAYMARK-SEC-001) |
| T4 | **Supply chain (Tampering/Elevation):** compromised npm package gains build-time execution | Steal env/source at build; poison the shipped bundle | High if it happens | `minimumReleaseAge: 1440`, `minimumReleaseAgeExclude` limited to `@replit/*`, `onlyBuiltDependencies` allow-list, frozen lockfile, no secrets in build env | Keep CI audit gate; prune unused deps (SEC-006/007); Renovate + SBOM (P2/P3) |
| T5 | **DoS (client):** Open-Meteo outage or rate-limit | App shows error state | Low (cosmetic) | Air-quality failure already tolerated (`App.tsx:138-143`); micro-climate failure cached as null for 15 min | Request timeout (SEC-004); no action on rate limits — Open-Meteo throttles per IP, free tier, no key to protect |
| T6 | **Information disclosure:** user's precise coordinates over-collected | Not an attacker — over-collection risk | Privacy only | Nothing stored, nothing logged | Client-side rounding (SEC-002 fix); approximate-only declaration for Play |
| T7 | **Elevation via dev server:** DNS rebinding against a running Vite dev server (`allowedHosts: true`, `0.0.0.0`) | Remote site reaches `http://localhost:PORT` while developer browses | Low–Med: source read via dev-server endpoints (fs.strict limits file access to root) | fs.strict; dev-only | Accepted dev risk; don't run dev server on untrusted networks (SEC-009) |
| T8 | **Compromised dev machine / Replit account** | Push malicious build; `post-merge.sh` runs `pnpm install` + `db push` automatically in the agent flow | High (full control) | Replit platform controls (out of scope) | 2FA on Replit; eventually move CI to GitHub Actions where approvals are explicit (P3) |
| T9 | **Stolen build credentials (future Android)** | Attacker signs a malicious update as Daymark | Critical (if native) | TWA: Play App Signing keeps key in Google's care | Choose TWA (§11); never commit keystore (none exists yet) |
| T10 | **Malicious app on same device** | Read Daymark's stored location | None | Nothing is stored; TWA data lives in Chrome's per-origin sandbox, not backed up | Nothing needed; re-evaluate only if native storage is added |

Explicitly **rejected as unrealistic**: XSS via API data (no sink — verified in source and bundle); prototype pollution (no merge/recursive-assign into objects); ReDoS (only literal/small regexes, e.g. `/^\/preview\/(.+)$/` in the dev-only sandbox and `/\/$/` trims); SQLi (no DB tables, no queries); SSRF (no server); insecure randomness (no security-relevant randomness generated); `eval`/`new Function` (zero hits in source; bundle contains only React internals).

---

## 7. Confirmed vulnerabilities

**None at Critical or High severity for the shipped client.** The findings below are the complete list of issues confirmed by static evidence, ordered by severity. Anything without a realistic exploitation path is labeled hardening or informational rather than a vulnerability.

---

### DAYMARK-SEC-001
**Title:** No Content-Security-Policy or security headers configured anywhere
**Severity:** Medium (deployment blocker, not an exploitable bug today)
**Confidence:** High
**CWE:** CWE-693 (Protection Mechanism Failure)
**OWASP:** A05:2021 Security Misconfiguration
**Affected file(s):** `artifacts/weather-app/index.html` (no CSP meta), `artifacts/weather-app/.replit-artifact/artifact.toml` (static serving config with no header directives), no host/CDN config in repo
**Exact code location:** `index.html:1-24` — `<head>` contains charset, viewport, SEO/OG tags, Google Fonts links; no CSP, no `Permissions-Policy`; `artifact.toml` `[services.production]` defines only `build/serve/publicDir/rewrites`
**Description:** The static output ships with zero response-header hardening. The app's defense currently rests entirely on React's output escaping. A CSP is the single control that would contain the blast radius of any future XSS-class bug (e.g., introduced via a compromised dependency in the bundle) and is the standard baseline for a public site.
**Evidence:** `grep -rn "Content-Security" artifacts/` → no matches; `index.html` read in full; `artifact.toml` read in full.
**Realistic attack scenario:** A future dependency of the bundle gains an XSS gadget → without CSP there is no second line of defense; script runs same-origin, can read geolocation-consent state of the origin and re-request location. With a strict CSP the gadget is largely neutralized.
**Impact:** Loss of defense-in-depth; also enables framing (clickjacking, T3) and MIME/referrer leakage.
**Current protections:** React escaping; no inline scripts in the bundle output (module script only); `rel="noreferrer"` on the one external link.
**Recommended fix:** Serve the header set in §13 at the host/CDN; add `frame-ancestors 'none'`, `Permissions-Policy: geolocation=(self)`. Not implementable in the repo today because the static host is Replit-managed — configure at the serving layer or move to a host with header control (Cloudflare Pages/Netlify/nginx).
**Difficulty:** Low–Medium (depends on host capability)
**Regression risk:** Medium if CSP is made strict immediately (Google Fonts + Open-Meteo must be allow-listed; start with report-only).
**How to verify:** `curl -sI https://<deploy-url>/ | grep -i content-security`; browser DevTools → no CSP violations on load and with location granted; securityheaders.com grade check.

---

### DAYMARK-SEC-002
**Title:** Geolocation prompted automatically on first load; coordinates transmitted unrounded
**Severity:** Low (privacy best-practice violation, not a vulnerability)
**Confidence:** High
**CWE:** CWE-200 (Information Exposure — design review)
**OWASP:** A01-related privacy concern / OWASP Privacy Top 10 (P1)
**Affected file(s):** `artifacts/weather-app/src/App.tsx`
**Exact code location:** `App.tsx:895` (`useEffect(() => { findMe(true); }, [findMe])` — prompt on mount); `App.tsx:120-137, 151-158` (coords embedded in query strings via `String(place.latitude)`); `App.tsx:872-892` (`getCurrentPosition` options)
**Description:** The browser location prompt fires on first render, before the user has expressed intent — the pattern Chrome's own UX research associates with higher denial rates, and the pattern Google Play's "obvious purpose" guidance targets for the packaged app. Coordinates are forwarded at full device precision to three Open-Meteo hosts, though every feature works at neighborhood precision (the app itself says "not block-level precision", `App.tsx:804`).
**Evidence:** Code cited above; permission-denied path verified (`App.tsx:869` silent London fallback; `App.tsx:884-887` error on manual attempt).
**Realistic attack scenario:** None directly. Aggregate exposure: users' precise coordinates transit to (and are processed by) a third party at full precision where two decimals would serve identically; and the premature prompt trains users to reflexively deny location — degrading the product.
**Impact:** Privacy over-collection; higher permission-denial rate; heavier Data Safety declaration on Play than necessary.
**Current protections:** `enableHighAccuracy:false`, 5-min position cache, graceful deny handling, no persistence of any kind.
**Recommended fix:** (1) Request location only from the explicit "Use my location" button; render London (or nothing) until then. (2) Round coordinates to 2 decimals (~1.1 km) before any transmission — `latitude.toFixed(2)`. (3) When denying on first load, show a one-line hint rather than a silent default.
**Difficulty:** Low
**Regression risk:** Low (UX behavior change only; keep the manual button path identical).
**How to verify:** Browser test with fresh profile: no prompt until button press; observe network requests (coords ≤ 2 decimals); Play pre-launch report for permission UX once packaged.

---

### DAYMARK-SEC-003
**Title:** External API responses trusted via blind type-cast, no runtime validation
**Severity:** Low
**Confidence:** High
**CWE:** CWE-20 (Improper Input Validation)
**OWASP:** A03:2021 Injection (data-integrity class; not injectable today)
**Affected file(s):** `artifacts/weather-app/src/App.tsx`
**Exact code location:** `App.tsx:113-117` — `async function getJson<T>(url): Promise<T> { ...; return response.json() as Promise<T>; }` — all five call sites (`:129, :139, :161, :875`) inherit the unvalidated cast
**Description:** Whatever JSON Open-Meteo returns is asserted to match hand-written interfaces. The component code defends well at point-of-use (extensive `?? defaults`, `Number.isNaN` checks, bounded `slice`/`Math.min` rendering), so a malformed or malicious response degrades to display errors or a caught exception — not XSS or memory-unsafety. This is defense-in-depth, not an open hole: today's exploit path requires compromising Open-Meteo or MITMing TLS, and even then React escaping blocks script execution.
**Evidence:** Only guard is `response.ok`; interfaces at `App.tsx:41-109` are compile-time only. Ironically the workspace already contains a generated Zod schema layer (`lib/api-zod`) — unused by the client.
**Realistic attack scenario:** T1 (compromised API/network): a response like `{"current":{"time":123}}` or `{"daily":{"time":[null,null,…]}}` produces NaN dates/garbage strings in the UI; worst case an uncaught throw inside a component → ErrorBoundary catches it (`main.tsx:10-15`), so the user sees a broken widget, nothing worse.
**Impact:** Data-integrity/availability of the UI under a hostile or broken API; no confidentiality/integrity loss beyond wrong numbers.
**Current protections:** `response.ok` check; pervasive optional-chaining and NaN guards; ErrorBoundary; `.slice(0, n)` bounds on all rendered arrays.
**Recommended fix:** Validate once at the boundary with Zod (schemas already exist in `lib/api-zod` patterns to copy); reject or degrade per-section on failure.
**Difficulty:** Medium (schemas must mirror the payload; hours/days arrays)
**Regression risk:** Low–Medium (over-strict schemas could reject valid Open-Meteo responses; test against live API).
**How to verify:** Unit tests feeding malformed payloads (missing fields, wrong types, huge arrays) through the parser; integration test with mocked fetch (msw is already an allowed-build dependency).

---

### DAYMARK-SEC-004
**Title:** Outbound fetches have no timeout or abort
**Severity:** Low (availability/UX)
**Confidence:** High
**CWE:** CWE-1088 (Synchronous Access of Remote Resource without Timeout)
**OWASP:** A04:2021 Insecure Design
**Affected file(s):** `artifacts/weather-app/src/App.tsx`
**Exact code location:** `App.tsx:114` (`await fetch(url)` with no `AbortSignal`), used by `fetchWeather`/`fetchMicroClimate`/reverse geocode; the only timeout in the location path is the geolocation one (`App.tsx:891`)
**Description:** A hung TLS connection leaves the loading skeleton up indefinitely (browser default fetch timeout is minutes). No retry storm risk exists (one request per user action; no auto-retry loop), so this is a UX/resilience gap, not a DoS vector against Open-Meteo.
**Evidence:** `getJson` cited; `requestId` guard (`App.tsx:845, 850`) correctly prevents stale-response races.
**Realistic attack scenario:** Hostile network (captive portal) black-holes `api.open-meteo.com` → user sees an endless spinner instead of the error card.
**Impact:** Availability of the UI; no data exposure.
**Current protections:** Error card on HTTP errors and rejects; stale-request guard.
**Recommended fix:** `AbortSignal.timeout(10000)` (baseline-supported) passed into `fetch`; treat as error path.
**Difficulty:** Low
**Regression risk:** Low (slow networks may now surface an error card with retry — acceptable).
**How to verify:** Unit test with a never-resolving fetch mock asserting the timeout fires; manual test with a black-hole proxy.

---

### DAYMARK-SEC-005
**Title:** Express scaffold uses permissive defaults (wildcard CORS, no helmet, no rate limiting, unused cookie-parser)
**Severity:** Informational (code is not reachable in the deployed product; would be High if ever exposed publicly as-is)
**Confidence:** High
**CWE:** CWE-942 (Permissive Crossdomain Policy), CWE-693
**OWASP:** A05:2021 Security Misconfiguration
**Affected file(s):** `artifacts/api-server/src/app.ts`, `artifacts/api-server/package.json`
**Exact code location:** `app.ts:23` — `app.use(cors());` (reflects any origin); `app.ts:24-25` — `express.json()` / `express.urlencoded()` without explicit size limits (Express 5 default 100 kB applies); `app.ts:21-34` — no helmet, no rate limit; `package.json` declares `cookie-parser` (`^1.4.7`) which `app.ts` never imports
**Description:** The scaffold's only route is `GET /api/healthz` with no data and no CORS-sensitive behavior, so nothing is exploitable today. The finding is that the configured defaults are "open by default" and would become real issues the moment real endpoints (cookies, user data) are added.
**Evidence:** Full source read (app.ts 37 lines; routes/health.ts validates output through `HealthCheckResponse.parse` — good).
**Realistic attack scenario:** Team later adds `/api/search` with cookies → wildcard CORS lets any website read responses with credentials disabled (still limited), and no rate limit allows trivial abuse.
**Impact:** None today; future privilege/integrity exposure if grown carelessly.
**Current protections:** pino logger **redacts** `authorization`/`cookie` headers (`lib/logger.ts:9-13` — good); zod on the one response; no secrets; server not referenced by frontend.
**Recommended fix:** Decision point (see §10): **remove** the backend stack (preferred — no product need exists), or if kept, add helmet, explicit `cors({ origin })`, `express.json({ limit: '16kb' })`, cookie-parser removal, and rate limiting before any non-health route.
**Difficulty:** Low (removal) / Medium (hardening)
**Regression risk:** Low either way (nothing depends on it).
**How to verify:** After removal: `pnpm -r --filter '@workspace/api-server' run build` fails-by-absence and `grep -r api-server artifacts/weather-app/src` stays empty. After hardening: automated header/CORS tests.

---

### DAYMARK-SEC-006
**Title:** Unused backend/database/API-client scaffolding and `@replit/connectors-sdk` widen supply-chain and maintenance surface
**Severity:** Low (hardening)
**Confidence:** High
**CWE:** CWE-1104 (Use of Unmaintained Third-Party Components) — surface-area class
**OWASP:** A06:2021 Vulnerable and Outdated Components
**Affected file(s):** root `package.json` (`@replit/connectors-sdk` dependency), `artifacts/api-server/**`, `lib/db/**`, `lib/api-client-react/**`, `lib/api-zod/**`, `lib/api-spec/**`, weather-app `package.json` (`@workspace/api-client-react` dep never imported)
**Exact code location:** verified unused by import scan: `grep -rn "connectors-sdk" {artifacts,lib,scripts}/src…` → 0 hits; `grep -rn "@workspace/db" artifacts/api-server/src` → 0 hits; `grep -rn "api-client-react" artifacts/weather-app/src` → 0 hits
**Description:** The entire server half of the workspace exists for a product that turned out client-only. It contributes 11 of the workspace's advisories-adjacent dependency chains (`express→qs`, `drizzle-kit→esbuild/tsx`, `orval→fast-uri/js-yaml/brace-expansion`), two install-capable native packages, a `DATABASE_URL` credential convention nobody needs, and cognitive load on every future audit.
**Evidence:** import scans above; `lib/db/src/schema/index.ts` contains zero table definitions (template comments only); api-server's own `artifact.toml` notes `# TODO - should be excluded from preview`.
**Realistic attack scenario:** A future advisory in `pg`/`express`/`orval` chains fires while nobody remembers these packages are unused; either it ships unpatched (if the packages are ever revived) or burns audit time forever.
**Impact:** Ongoing supply-chain exposure + audit noise; no direct exploitability in the shipped product.
**Current protections:** None needed — isolated from the client build.
**Recommended fix:** Delete `artifacts/api-server`, `lib/db`, `lib/api-client-react`, `lib/api-zod`, `lib/api-spec`, `scripts/post-merge.sh`'s `db push` line, root `@replit/connectors-sdk`, and the weather-app's `@workspace/api-client-react` dependency — **or** explicitly adopt the backend in replit.md. Do not leave it ambiguous.
**Difficulty:** Low
**Regression risk:** Low (client has no imports into any of it — verified).
**How to verify:** `pnpm install && pnpm build && pnpm typecheck` green after removal; bundle hash unchanged or smaller; audit count drops (see §8).

---

### DAYMARK-SEC-007
**Title:** ~40 unused runtime dependencies in weather-app, including deprecated `recharts`
**Severity:** Low (maintenance/supply-chain)
**Confidence:** High
**CWE:** CWE-1104
**OWASP:** A06:2021
**Affected file(s):** `artifacts/weather-app/package.json`
**Exact code location:** dependencies declared but never imported by `src/` (verified by import scan + bundle inspection): the full Radix set (`@radix-ui/react-accordion` … `react-toggle-group`), `framer-motion`, `recharts`, `embla-carousel-react`, `react-day-picker`, `react-hook-form`, `@hookform/resolvers`, `date-fns`, `react-icons`, `sonner`, `next-themes`, `vaul`, `cmdk`, `input-otp`, `zod` (client), `class-variance-authority`, plus dev-only Replit plugins that are correctly excluded from the prod bundle. `recharts@^2.15.2` resolves to **2.15.4, which npm marks deprecated** (confirmed by the pnpm install warning).
**Description:** These exist because the shadcn/ui template scaffolds all 50 components. Tree-shaking keeps them out of the bundle (verified: `dist` JS has 0 hits for `sidebar_state`; only card/toaster/tooltip code present), but they still get **installed** (supply-chain exposure at install time) and **resolved** (a compromised new major could still be pulled by a future import).
**Evidence:** bundle greps; `pnpm install` deprecation warning; import scan.
**Realistic attack scenario:** Same class as SEC-006 but client-side: future advisory or malicious release in any of ~40 packages that are never used.
**Impact:** Install-time supply-chain exposure; maintenance noise.
**Current protections:** release-age policy and lockfile (§8).
**Recommended fix:** Run `npx shadcn`-style pruning or manually remove unused deps; regenerate `components/ui` to only the components actually imported (card, toaster, tooltip + toast/use-toast hooks). Add eslint `no-unused-vars`/`import/no-extraneous-dependencies` when lint is introduced.
**Difficulty:** Low–Medium (verify each; re-run build)
**Regression risk:** Low if build+typecheck+smoke test after pruning.
**How to verify:** `pnpm why <pkg>` empty for each removed package; bundle rebuilds; UI smoke test.

---

### DAYMARK-SEC-008
**Title:** 11 known vulnerabilities in the dependency tree — all in dev-time or unused-server chains, none reachable from the shipped bundle
**Severity:** Classified per item below (no shipped-product vulnerability)
**Confidence:** High (audit) / Medium (exploitability reasoning is static)
**CWE:** per advisory; OWASP A06:2021
**Affected file(s):** `pnpm-lock.yaml` (current, with uncommitted darwin-arm64 additions)
**Exact code location / evidence:** `pnpm audit` (2026-09-07): **8 high, 2 moderate, 1 low**

| Advisory | Package | Severity | Chain | Reachability classification |
|---|---|---|---|---|
| GHSA-7p8r-x3mc-p8w7, GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, (+1 host-confusion) | `fast-uri` <3.1.6 (SSRF/host confusion) | High ×5 | `lib/api-spec → orval → @scalar/openapi-parser → ajv` | **Maintenance** — codegen CLI parses only the repo's own `openapi.yaml`, never untrusted URLs |
| GHSA-rgw5-rvv9-x895 | `brace-expansion` 4.x <5.0.9 (DoS) | High | `orval → typedoc → minimatch` | **Maintenance** — dev-time, trusted input |
| GHSA-5p4m-2wfm-xmqj | `js-yaml` 4.x <4.3.1 (quadratic CPU) | High | `orval` | **Maintenance** — same |
| GHSA-2v37-7h3g-55p8 | `nanoid` <3.3.18 (infinite loop with size 0) | High | `vite → postcss` (6 paths) | **Maintenance** — build tool, size never attacker-controlled |
| GHSA-4mjr-xmp4-gh2g + isBuffer DoS | `qs` ≤6.15.3 (2× moderate) | Moderate | `api-server → express → body-parser` | **Latent** — only exploitable if the unused server is ever deployed and receives hostile query strings (ties to SEC-005) |
| GHSA-g7r4-m6w7-qqqr | `esbuild` 0.27.3 <0.28.1 (arbitrary file read, **Windows dev server**) | Low | `drizzle-kit`, `vite` (34 paths) | **Dev-only, Windows-only** — this repo develops on macOS/Replit linux; note the workspace pins `esbuild: 0.27.3` deliberately (override comment: avoids older vulnerable drizzle-kit esbuild) |

**Description/Impact:** None of these packages appear in `artifacts/weather-app/dist/public/assets/*.js` (the shipped bundle) — verified. The "high" count is therefore misleading at a glance: the vulnerable code never executes in production.
**Current protections:** lockfile + `minimumReleaseAge`; the deliberate `esbuild: "0.27.3"` override trades one low dev-only advisory for the drizzle-kit chain.
**Recommended fix:** When convenient (P2): `pnpm update` of `orval`, `vite`, `express` chains clears fast-uri/js-yaml/brace-expansion/nanoid/qs without breaking changes; re-run audit. If the backend is deleted (SEC-006), qs and its advisories disappear outright.
**Difficulty:** Low
**Regression risk:** Low–Medium (orval majors can change generated output — re-run codegen diff).
**How to verify:** `pnpm audit` → 0 (or only the accepted esbuild dev finding); `pnpm --filter @workspace/api-spec run codegen` diff reviewed.

---

### DAYMARK-SEC-009
**Title:** Vite dev/preview servers disable host validation and bind all interfaces
**Severity:** Low (dev-only)
**Confidence:** High
**CWE:** CWE-346 (Origin Validation Error)
**OWASP:** A05:2021
**Affected file(s):** `artifacts/weather-app/vite.config.ts`, `artifacts/mockup-sandbox/vite.config.ts`
**Exact code location:** weather-app `vite.config.ts:69-74` — `host: '0.0.0.0', allowedHosts: true` (and `preview` block `:75-78`); mockup-sandbox equivalents
**Description:** `allowedHosts: true` disables Vite's Host-header origin check, so a remote attacker who can make a victim's browser request `http://<victim-LAN-IP>:PORT` (classic DNS-rebinding pattern) can talk to the dev server. `fs.strict: true` limits file reads to the project root, which prevents arbitrary-file read; exposure is the dev app itself plus HMR-driven code execution of repo code (which the attacker doesn't control). Required by Replit's proxy architecture (the dev server must accept Replit's domain), so it cannot simply be removed.
**Evidence:** config cited; both servers require `PORT`/`BASE_PATH` explicitly, so they never run by accident without config.
**Realistic attack scenario:** Developer runs `pnpm dev` on café Wi-Fi → another client on the LAN loads the dev app directly; negligible data risk (no secrets in dev), mild annoyance/drive-by framework for phishing the developer.
**Impact:** Low. Dev-time only; production build is static and unaffected.
**Current protections:** `fs.strict`; explicit env gates; Replit dev containers are typically firewalled.
**Recommended fix:** Accept and document; or scope to `allowedHosts: ['.replit.dev', 'localhost']` if Replit's proxy allows (verify at runtime on Replit before committing).
**Difficulty:** Low (with runtime verification on Replit)
**Regression risk:** Medium if Replit's proxy needs wildcard hosts — verify first.
**How to verify:** `curl -H 'Host: evil.example' http://localhost:$PORT/` on dev server before/after; confirm Replit workspace preview still loads.

---

### DAYMARK-SEC-010
**Title:** `VITE_`-prefixed variables are, by design, embedded in the public bundle — no consumer code or key exists today, and PurpleAir must never be added naively
**Severity:** Informational (design guard-rail; no current exposure)
**Confidence:** High
**CWE:** CWE-798 (Use of Hard-coded Credentials — class warning)
**OWASP:** A05:2021
**Affected file(s):** `.env.example:8-10`; future micro-climate code
**Exact code location:** `.env.example` documents `VITE_PURPLEAIR_API_KEY` as "Optional … enables the nearest-real-sensor PM2.5 comparison" — but `grep -rn "PURPLEAIR\|import.meta.env" artifacts/weather-app/src` shows **no code reads it** (only `import.meta.env.BASE_URL` and `.DEV` are used)
**Description:** Anything under `VITE_` is inlined into the shipped JS and readable by every visitor. The audit confirms no such value ships today (bundle grepped: no key-shaped strings; `.env` does not exist). The risk is the roadmap: the documented plan is to call PurpleAir **directly from the browser with this key**, which publishes a quota-bearing credential to the world the moment it's set.
**Evidence:** stated above.
**Realistic attack scenario:** Key added → scraped from the published bundle within hours by key-scrapers → PurpleAir quota exhausted or billed.
**Impact:** Future credential exposure/abuse; no current impact.
**Current protections:** `.env` gitignored (`.gitignore:40-43`); empty placeholder only.
**Recommended fix:** Before wiring PurpleAir: either keep the micro-climate "nearby sensor" row fed by Open-Meteo only (current behavior), or route the key through a tiny worker/edge proxy; alternatively accept a free-tier key being public and rate-limit-spend it, with rotation documented. Never place a write-scoped or paid key under `VITE_`.
**Difficulty:** Low (documentation/decision now; proxy later if needed)
**Regression risk:** None.
**How to verify:** Bundle grep for the key value post-build if ever introduced; quota monitoring on PurpleAir dashboard.

---

### DAYMARK-SEC-011
**Title:** Google Fonts loaded from third-party origins (CSS in `index.html` + `@import` in CSS) — privacy, availability, and CSP cost
**Severity:** Informational (hardening)
**Confidence:** High
**CWE:** CWE-359 (Exposure of Private Personal Information — user IP to third party)
**OWASP:** A06:2021 / privacy
**Affected file(s):** `artifacts/weather-app/index.html:16-18`, `artifacts/weather-app/src/index.css:1`
**Exact code location:** as cited — two separate font families are pulled (Inter via `index.html`, Fraunces/DM Mono/Plus Jakarta Sans via CSS `@import`), so the CSS import plus the link tags produce requests to `fonts.googleapis.com` (which sees every visitor's IP/UA) and `fonts.gstatic.com`.
**Description:** Third-party font loading leaks visitor IPs to Google, adds an availability dependency outside your control, cannot use Subresource Integrity (the CSS API serves rotating content), and forces two allow-listed origins in any future CSP.
**Evidence:** file lines cited; no SRI attributes present (and none possible for this endpoint class).
**Realistic attack scenario:** Not an attack — a privacy/compliance dependency: Google observes every Daymark visit; a Google outage changes Daymark's typography; a compromise of the fonts CDN is a supply-chain vector into the page (CSS-only exfiltration is possible in principle).
**Impact:** Low privacy/availability.
**Current protections:** `preconnect` hints (performance only); `crossorigin` on gstatic.
**Recommended fix:** Self-host the four families via `@fontsource/*` packages (already pnpm-managed, no new runtime origin); drop both remote references. Then CSP can be `'self'` + Open-Meteo only.
**Difficulty:** Low
**Regression risk:** Low (font rendering identical; check licen­sing files included).
**How to verify:** Network tab shows zero third-party requests on load; visual diff of type rendering.

---

### DAYMARK-SEC-012
**Title:** No PWA manifest or service worker; offline behavior undefined; Replit placeholder branding in metadata
**Severity:** Informational (capability/brand, relevant to the Play roadmap)
**Confidence:** High
**CWE:** CWE-693 (missing protection/capability class)
**OWASP:** A05:2021
**Affected file(s):** `artifacts/weather-app/public/` (only `favicon.svg`, `robots.txt`), `artifacts/weather-app/index.html:6-14`
**Exact code location:** no `manifest.webmanifest`, no service-worker registration anywhere in `src/`; `index.html:7` title "Weather App" with description "Weather App — built on Replit. Update this description to reflect the app." and OG/Twitter tags repeating it
**Description:** Three separate issues in one: (1) no manifest/SW means the app can't be installed as a PWA, which the TWA packaging path (§11) requires; (2) no SW means no offline shell and no cache-control story of our own; (3) shipping "built on Replit" placeholder text discloses origin stack details and looks unfinished. The `robots.txt` and metadata themselves are harmless.
**Evidence:** directory listing and file contents as cited.
**Realistic attack scenario:** None directly; the metadata leak is reconnaissance flavor ("this stack is a Replit template") rather than a vulnerability.
**Impact:** Blocks Play packaging; minor info disclosure; brand.
**Current protections:** n/a.
**Recommended fix:** Add `manifest.webmanifest` (name "Daymark", icons incl. maskable, `display: standalone`, theme colors), register a minimal offline-shell service worker (or explicitly defer offline), rewrite title/description/OG tags.
**Difficulty:** Low–Medium (SW is the only fiddly part; can ship manifest-first)
**Regression risk:** Low; SW caching bugs are the classic regression — start network-first.
**How to verify:** Lighthouse PWA audit; `npx @bubblewrap/cli doctor` when TWA work starts; manual read of rendered `<head>`.

---

### DAYMARK-SEC-013
**Title:** Replit agent auto-runs `pnpm install --frozen-lockfile && pnpm --filter db push` on post-merge
**Severity:** Informational (dev-hygiene)
**Confidence:** High
**CWE:** CWE-359/CWE-778 class (automation without explicit approval)
**OWASP:** A08:2021 Software and Data Integrity Failures (process-level)
**Affected file(s):** `.replit` `[postMerge]`, `scripts/post-merge.sh`
**Exact code location:** `.replit:14-17` — `path = "scripts/post-merge.sh", timeoutMs = 20000`; script contents: `pnpm install --frozen-lockfile` then `pnpm --filter db push` (applies Drizzle schema straight to the database)
**Description:** Two automations worth knowing about: installs are correctly frozen (good — no drift), but `db push` mutates a database with no human gate and `--force` variant exists in `lib/db/package.json` (`push-force`). With **zero tables defined** this is currently a no-op, but it's an accident waiting for a schema to exist. All of it becomes moot if the backend is removed (SEC-006).
**Evidence:** files cited.
**Realistic attack scenario:** A merged branch with a half-written schema auto-pushes destructive changes to the dev database without review.
**Impact:** Dev-data integrity; none in production.
**Current protections:** `--frozen-lockfile`; timeout.
**Recommended fix:** Remove the `db push` line, or gate it behind an explicit workflow; delete with SEC-006 if backend goes.
**Difficulty:** Trivial
**Regression risk:** None for the client.
**How to verify:** Replit post-merge run log shows install only.

---

## 8. Dependency and supply-chain findings

(Per-finding detail in SEC-006/007/008; this section summarizes the posture.)

**Strong protections already in place (evidence-based, keep them):**
- `pnpm-workspace.yaml` `minimumReleaseAge: 1440` — no package younger than 24 h can be installed; exclude-list is tight (`@replit/*`, `stripe-replit-sync`).
- `onlyBuiltDependencies` allow-list — only `@swc/core`, `esbuild`, `msw`, `unrs-resolver` may run install scripts; everything else's postinstall is blocked. This is a first-class supply-chain control.
- `pnpm-lock.yaml` committed; `post-merge.sh` uses `--frozen-lockfile`; root `preinstall` enforces pnpm and deletes foreign lockfiles.
- `.npmrc` contains **no registry override and no auth token** (verified — only `auto-install-peers=false`, `strict-peer-dependencies=false`).
- Version pinning strategy: catalog ranges (`^`) + lockfile — reproducible installs; majors are opt-in. Reasonable.

**Findings summary:**
- 11 advisories, **none shipped** (SEC-008 table): fast-uri×5 / brace-expansion / js-yaml / nanoid (high, dev-tooling chains through `orval` and `vite→postcss`), qs×2 (moderate, unused express server), esbuild (low, Windows-only dev server).
- **Confirmed vulnerability:** none in shipped code.
- **Security hardening:** prune unused server stack (SEC-006) and unused client deps (SEC-007); CI audit gate.
- **Maintenance:** deprecated `recharts@2.15.4`; advisory updates in dev chains.
- Nothing here is "old ⇒ vulnerable": e.g., the deliberate `esbuild: "0.27.3"` pin is a *mitigation* (the override comment documents avoiding drizzle-kit's older esbuild), and wouter 3.3.5 / pino 9.14 / drizzle-orm 0.45 are current and have no advisories.

**Dependency confusion / typosquatting review:** all packages resolve to the canonical npm registry (no custom registry in `.npmrc`); workspace packages use the `@workspace/*` scope with `workspace:*` protocol (never resolved from the registry — immune to confusion); no look-alike names spotted among the 470 lockfile entries reviewed in aggregate; `@replit/*` packages are the only org-scoped trust exception (documented in the exclude-list comment).

**Cleanup note (current working tree):** the uncommitted `pnpm-workspace.yaml` change from the local-validation session added `allowBuilds: esbuild: true` alongside the existing `onlyBuiltDependencies: [esbuild, …]`. Having both keys is redundant at best; consolidate to `onlyBuiltDependencies` and verify on Replit linux that `ERR_PNPM_IGNORED_BUILDS` doesn't return, before committing.

---

## 9. Web/browser security

| Control | Status | Notes |
|---|---|---|
| CSP | **Absent** | SEC-001; §13 config provided |
| `frame-ancestors` / clickjacking | **Unprotected** | part of SEC-001; realistic impact low (T3) but trivially fixed with the CSP |
| `X-Content-Type-Options` | Not configured | include in §13 set |
| `Referrer-Policy` | Not configured | browser default (`strict-origin-when-cross-origin`) already prevents coordinate leakage via referrer to Open-Meteo/Google (coords are never in the page URL — verified) |
| `Permissions-Policy` | Absent | should declare `geolocation=(self)` and disable unused powerful features |
| HTTPS | Yes by construction | every request in source is `https://` (scan found zero cleartext URLs); static hosts terminate TLS |
| HSTS | Not configured | host-level; include in §13 |
| CORS | n/a client-side | no `Access-Control-*` requests; relevant only to unused server (SEC-005) |
| SRI | n/a today | single same-origin bundle; becomes relevant if fonts stay remote (they can't take SRI — self-host instead, SEC-011) |
| Cache control | Not configured | static assets are content-hashed (`index-*.js`) → `immutable`; `index.html` should be `no-cache`; host-level |
| Service worker / PWA | None | SEC-012 |
| Browser storage | **None used** | verified: no localStorage/sessionStorage/IndexedDB/cookies in app code or bundle; the one `document.cookie` (shadcn sidebar) is not bundled |
| Output encoding | React JSX throughout | zero `dangerouslySetInnerHTML` in app code; bundle `__html` occurrences are React internals (verified); the dev-only sandbox `chart.tsx` sink is constants-only and tree-shaken |
| External links | 1 total | `open-meteo.com` with `rel="noreferrer"` (`App.tsx:978`) — safe |
| Open redirects | None | no redirect code exists; `BASE_URL` is build-time constant |

---

## 10. Backend security (unused stack, reviewed for the removal/hardening decision)

**Reviewed:** `app.ts` (middleware chain: pino-http → wildcard `cors()` → `express.json()` → `urlencoded`), health route (zod-validated response — good pattern), logger (redacts `authorization`/`cookie` — good), `build.mjs` (esbuild bundle with pinned esbuild 0.27.3), `index.ts` (requires `PORT`), Drizzle config (requires `DATABASE_URL`, zero tables), OpenAPI spec (health only), generated clients (react-query + zod; `customFetch` is a well-written generic fetch wrapper with bearer-token hook support — dead code, but no flaws found in it: correct header merging, no URL injection surface, JSON/BOM handling sound).

**Cookies:** none used anywhere (cookie-parser declared but unimported). **Request-size limits:** Express defaults (100 kB JSON) — acceptable for health-only. **Error handling:** no global error handler middleware → Express 5 default handler; health route can't fail interestingly. **Logging:** pino with redaction, URL query strings stripped in the request serializer (`app.ts:12` `req.url?.split("?")[0]` — good: would prevent coordinate leakage into logs if this server ever proxied the weather APIs). **Health endpoint:** no rate limit, but it's static and cheap. **Database:** pool from `DATABASE_URL`; no migrations directory; `drizzle-kit push` is the only schema path (see SEC-013). **Generated API clients:** not imported by anything shipped.

**Decision: remove rather than harden.** The client works entirely against Open-Meteo; there is **no security reason for a backend proxy today** — no secrets to hide (Open-Meteo is keyless; PurpleAir is the only future key and §SEC-010 covers its options), no CORS problem (Open-Meteo sends permissive CORS by design), no abuse problem that a proxy would solve better than Open-Meteo's own per-IP limits. A proxy would add: a server to patch, a DoS surface, a logging surface for coordinates (the exact data we minimize), and deploy complexity. Revisit only if a paid/secret-keyed API is adopted, in which case a minimal edge function — not this Express stack — is the right tool.

---

## 11. Android / Google Play security

### Option analysis

**A. PWA + TWA (Trusted Web Activity) — RECOMMENDED for Daymark**

- **Attack surface:** smallest possible. No JavaScript bridge, no native code of ours, no exported activities beyond Digital Asset Links' single `LauncherActivity` from androidx.browser. The app runs in Chrome's rendering stack with Chrome's sandbox and update cadence.
- **WebView security / mixed content:** TWA uses Chrome Custom Tabs (real Chrome), `usesCleartextTraffic` effectively false for our all-HTTPS app; no `WebView.setJavaScriptEnabled` misconfigurations possible because we ship no WebView.
- **Geolocation:** the geolocation prompt is issued by Chrome against the web origin; delegation requires `assetlinks.json` with the signing cert fingerprint. No Android location permission is declared → none of Play's foreground-location policy review applies. This is the single biggest compliance win vs. wrappers.
- **Deep links / intents:** none required; the TWA handles only its own origin. `intent`-filter surface is minimal by default with Bubblewrap output.
- **Storage/backups:** data lives in Chrome's per-origin profile; not included in Android `adb backup` of our (nonexistent) app data. Nothing to leak — consistent with the app storing nothing (§5).
- **Debug vs release:** Bubblewrap builds release-signed via Play App Signing; the upload key never ships. No signing material should ever enter this repo (none exists — verified).
- **Play Integrity:** available to TWAs via the Play Integrity API through the (future) backend or via attested web-only checks; more relevant once accounts/abuse exist. Low priority for a keyless weather client.
- **Prerequisites Daymark currently lacks (SEC-012):** manifest, icons/maskable icons, and ideally a minimal service worker; `assetlinks.json` at `/.well-known/`.

**B. Capacitor/WebView wrapper**

- Adds a JS bridge (`@capacitor/core` + plugins) — every bridge handler is a potential confused-deputy; requires plugin vetting, `androidScheme: 'https'`, tight `server.allowNavigation`, and disables for `androidx.WebView` file access. Geolocation now needs the Android permission flow + Play location declaration. Backups must be explicitly excluded via `android:allowBackup=false` + backup rules once any native storage exists. **More surface for zero product benefit over TWA.** Choose only if native plugins (e.g., background sync) become a requirement.

**C. React Native / Expo**

- Largest rewrite and largest runtime; bridge/native-module ecosystem is the classic supply-chain and memory-safety exposure area; same Android permission/declaration burdens as Capacitor. Expo's defaults are decent (no cleartext by default, Hermes), but the cost is unjustified for a single-screen client-side app.

### Android-specific checklist for the recommended path (future work, not now)

1. Generate app via Bubblewrap against the deployed HTTPS origin; enroll Play App Signing.
2. Host `/.well-known/assetlinks.json` with the release fingerprint; verify with `npm i -g @bubblewrap/cli && bubblewrap doctor`.
3. Confirm `usesCleartextTraffic` is absent/false in the generated manifest (Bubblewrap default) — network security config not needed since no cleartext and no user CAs override.
4. Play Data Safety form per §5 (Location — collected/ephemeral/functionality; nothing else).
5. Verify in the pre-launch report: geolocation prompt fires from the TWA and is denied-graceful (SEC-002 fix makes this a good experience).
6. Ensure no secrets in the bundle before upload (`grep` the built JS for the PurpleAir key pattern if ever introduced — SEC-010).
7. Android logcat: TWA logs nothing of ours; keep it that way (no `console` payloads with coords — currently the app logs nothing).

---

## 12. Replit-specific findings

**Verified safe (compiled out of production):** the gated dev plugins —

```ts
// weather-app/vite.config.ts:50-56 (same in mockup-sandbox)
...(process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined
  ? [cartographer(...), devBanner()]
  : []),
```

— and `@replit/vite-plugin-runtime-error-modal` (plugin list, `:47`). Bundle inspection: `REPL_ID` → **0 occurrences** in `dist/public/assets/*.js`; no dev-banner/cartographer strings. `main.tsx:10-15` deliberately routes caught errors away from the dev overlay. `error-boundary.tsx:50` shows error messages **only** when `import.meta.env.DEV`. Conclusion: **keep these plugins; they are correctly dev-only and are real productivity tools.**

**Should be removed or rewritten before/with public launch:**

| Item | Where | Action |
|---|---|---|
| "built on Replit" placeholder meta/OG text | `index.html:7-14` | rewrite (SEC-012) |
| `artifact.toml` TODO + api-server production service | `artifacts/api-server/.replit-artifact/artifact.toml:2` (`# TODO - should be excluded from preview`) and whole file | resolved by SEC-006 removal |
| `post-merge.sh` auto `db push` | `.replit:14-17` | remove line (SEC-013) |
| `@replit/connectors-sdk` | root `package.json` | remove (unused, SEC-006) |
| Linux-x64-only native overrides | `pnpm-workspace.yaml:77+` | keep — now includes darwin-arm64 for local dev (uncommitted); they shrink install surface on the deploy platform |
| `.replit`, `.replitignore`, `replit.md` | root | keep while on Replit; replit.md is template boilerplate — fill "Where things live" as documentation hygiene, no secrets inside |
| Mockup sandbox production service entry | `mockup-sandbox/.replit-artifact/artifact.toml` (`/__mockup`) | dev-only by design; ensure the production deployment never includes it (it is a separate artifact, not part of weather-app's static output — verified `dist/public` contains only the app) |

No Replit telemetry endpoints, tokens, or account identifiers were found anywhere in the repo or the bundle.

---

## 13. Recommended security headers (do not implement yet)

Serve at the host/CDN for the SPA origin (values assume SEC-011 self-hosted fonts; if fonts stay remote, add `https://fonts.googleapis.com` to `style-src` and `https://fonts.gstatic.com` to `font-src`):

```
Content-Security-Policy:
  default-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  form-action 'none';
  object-src 'none';
  script-src 'self';
  style-src 'self';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self' https://api.open-meteo.com https://air-quality-api.open-meteo.com https://geocoding-api.open-meteo.com;
  manifest-src 'self';
  upgrade-insecure-requests
  (roll out as Content-Security-Policy-Report-Only first)

Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), camera=(), microphone=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cache-Control: (assets) public, max-age=31536000, immutable
Cache-Control: (index.html) no-cache
```

Notes: no `script-src 'unsafe-inline'` is needed (bundle is a single module script — verified); `frame-ancestors 'none'` subsumes `X-Frame-Options: DENY`; `connect-src` already anticipates the PurpleAir addition (add `https://api.purpleair.com` only via the SEC-010 decision). Static inspection cannot confirm what the Replit host will actually emit — the first runtime task after deploy is `curl -I` on the production URL.

---

## 14. Remediation roadmap

### P0 — Must fix before public deployment

| Priority | Finding | Severity | Effort | Security value | Recommended timing |
|---|---|---|---|---|---|
| P0 | SEC-001 CSP + security headers at host (§13, report-only → enforce) | Medium | Med | High — only missing defense-in-depth on the public origin | At deployment setup |
| P0 | SEC-002a Move geolocation behind explicit user action | Low | Low | Med — permission UX + Play readiness | Before launch |
| P0 | SEC-002b Round coordinates (2 dp) before transmission | Low | Low | Med — data minimization | Before launch |
| P0 | SEC-012 Rewrite "built on Replit" metadata; add manifest (+icons) | Info | Low | Low–Med (brand + TWA prerequisite) | Before launch |
| P0 | Verify serving headers post-deploy (`curl -I`) | — | Trivial | Gate for SEC-001 | Deployment day |

### P1 — Must fix before Google Play release

| Priority | Finding | Severity | Effort | Security value | Recommended timing |
|---|---|---|---|---|---|
| P1 | SEC-012b Minimal offline-shell service worker (network-first) | Info | Med | Med (stale-cache risk control) | TWA prep |
| P1 | SEC-004 fetch timeouts (`AbortSignal.timeout`) | Low | Low | Med (UX resilience) | TWA prep |
| P1 | SEC-010 PurpleAir decision recorded: no `VITE_` secret or documented public-key acceptance | Info | Low | Med (prevents future credential leak) | Before any sensor feature |
| P1 | SEC-003 Zod validation of API responses (schemas exist in `lib/api-zod` to mirror) | Low | Med | Med (T1 containment) | TWA prep |
| P1 | Play Data Safety form per §5; assetlinks + signing per §11 | — | Low | Compliance | Submission prep |

### P2 — Recommended production hardening

| Priority | Finding | Severity | Effort | Security value | Recommended timing |
|---|---|---|---|---|---|
| P2 | SEC-006 Delete unused backend/lib stack + connectors-sdk (or formally adopt) | Low | Low–Med | Med — removes ~all current audit findings | Next quiet week |
| P2 | SEC-007 Prune unused client deps (incl. deprecated recharts) | Low | Med | Med — install-time surface | With SEC-006 |
| P2 | SEC-008 Update dev-chain advisories (orval/vite/express) | Maint. | Low | Low | Same PR |
| P2 | CI gate: `pnpm audit --audit-level high` + `pnpm build` on PR | — | Low | Med (permanent) | With CI setup |
| P2 | SEC-011 Self-host fonts, drop Google origins | Info | Low | Low–Med (privacy + CSP shrink) | With SEC-001 enforcement |
| P2 | Consolidate `allowBuilds`/`onlyBuiltDependencies` (uncommitted change note, §8) | — | Trivial | Low | Before next commit |

### P3 — Long-term improvements

| Priority | Finding | Severity | Effort | Security value | Recommended timing |
|---|---|---|---|---|---|
| P3 | SEC-005 (if backend ever revived): helmet, scoped CORS, limits — otherwise moot | Info | Med | Cond. | Only if backend adopted |
| P3 | SEC-009 Scope Vite `allowedHosts` (after Replit runtime verification) | Low | Low | Low | Whenever touching dev config |
| P3 | eslint + typescript-eslint strict, `no-restricted-imports` for ui kit | — | Med | Med (prevents regressions) | With CI |
| P3 | Renovate/Dependabot + SBOM (CycloneDX) + CodeQL | — | Med | Med | Post-launch |
| P3 | Replit 2FA / move CI off agent automations | — | Low | Med (T8) | Post-launch |
| P3 | Play Integrity evaluation if accounts ever exist | — | Med | Cond. | Only with backend |

---

## 15. Verification / testing plan

| Fix | Test type | Concrete verification |
|---|---|---|
| SEC-001 headers | Browser + curl | `curl -sI https://<prod>/` shows §13 set; securityheaders.com A grade; DevTools console clean on load; clickjack test page cannot frame the app; CSP report endpoint (if used) empty for a week before enforcement |
| SEC-002 geolocation UX | Browser tests (fresh profiles) | No prompt on load; prompt only on button; denied → helpful message; verify request URLs show ≤2-decimal coords via DevTools → Network |
| SEC-003 response validation | Unit + integration | Vitest: feed malformed/oversized/hostile payloads (types flipped, arrays of null, 10⁶-element arrays) through the parser → degrade, never crash; msw-based integration mocking all four endpoints with contract-violating bodies |
| SEC-004 timeout | Unit + manual | Fake never-resolving `fetch` asserts 10 s abort → error card; manual black-hole test via `pfctl`/proxy |
| SEC-005/006 backend removal | Build/typecheck + grep | `pnpm build && pnpm typecheck` green; `pnpm why express pg orval` → package not found; bundle unchanged |
| SEC-007 dep pruning | Build + smoke + audit | `pnpm why <removed>` empty; UI smoke test passes; `pnpm audit` count drops |
| SEC-008 updates | Codegen diff + audit | `pnpm --filter @workspace/api-spec run codegen` produces no unexpected diffs; audit → 0 (or documented accepted dev-only) |
| SEC-009 dev hosts | curl abuse test | `curl -H 'Host: evil.example' http://localhost:$PORT/` → 403/blocked; Replit preview still works (runtime verification on Replit required before committing the change) |
| SEC-010 secret guard | Static analysis in CI | Grep CI step: built JS must not match `[A-Z_]*API_KEY\s*=\s*['"][^'"]+` patterns; bundle-size diff on any new `connect-src` |
| SEC-011/012 fonts+manifest+SW | Lighthouse + browser | Lighthouse PWA installable; zero third-party requests; SW network-first verified by serving stale HTML and checking update flow; offline → cached shell + clear error card |
| Dependency scans (permanent) | CI | `pnpm audit --audit-level high` as a required check; Dependabot/Renovate PRs reviewed with the §8 classification rubric (shipped vs dev-chain) |
| Static analysis (permanent) | CI | `tsc --build` strict (already green); add eslint security rules; CodeQL javascript query pack |
| Android/TWA | Play tooling | `bubblewrap doctor`; pre-launch report permission checks; manual: deny location in TWA → graceful fallback; verify assetlinks 200s from `https://<origin>/.well-known/assetlinks.json` |
| Manual abuse testing (launch week) | Manual | Rate-mash the locate button (expect: no request storm — one in-flight guarded by `requestId`); tamper responses with DevTools overrides (expect: degraded UI, no script exec); test with location spoofed to null-island coords |

---

## TOP 10 HIGHEST-VALUE SECURITY IMPROVEMENTS

Ranked by genuine risk reduction per unit of effort, based on the evidence above:

1. **Deploy the §13 header set with a CSP (`frame-ancestors 'none'`, `connect-src` allow-list) — SEC-001.** The one missing structural control on the public origin; contains any future XSS-class bug regardless of its source.
2. **Delete the unused backend stack, generated clients, connectors-sdk, and post-merge `db push` — SEC-006/013.** Removes every latent server-side finding (incl. both `qs` moderates) and a credential convention in one sweep.
3. **Prune the ~40 unused client dependencies and replace deprecated recharts — SEC-007.** Cuts install-time supply-chain exposure to roughly a third of its current size.
4. **Move geolocation behind the explicit button and round coordinates to 2 dp before transmission — SEC-002.** Real data minimization, better permission UX, and an easier, truthful Play Data Safety declaration.
5. **Add fetch timeouts (`AbortSignal.timeout(10s)`) — SEC-004.** Ten minutes of spinner on a hostile network becomes a handled error.
6. **Validate Open-Meteo responses with Zod at the boundary — SEC-003.** Converts "hostile API response" from UI corruption to a clean degradation path; schemas already exist in the workspace.
7. **CI gates: `pnpm audit --audit-level high` + build on every PR — §8/P2.** Makes the supply-chain policy (release-age, allow-listed builds) enforceable instead of aspirational, with the shipped-vs-dev-chain classification rubric from §8.
8. **Record the PurpleAir key decision before the sensor feature is built — SEC-010.** Prevents the single most likely future credential leak in this codebase.
9. **Manifest + minimal service worker + real metadata (drop "built on Replit") — SEC-012.** Required for the TWA path, fixes the origin-disclosure placeholder, and starts the cache-control story.
10. **Self-host the Google Fonts — SEC-011.** Eliminates third-party visibility into every visit and lets the CSP shrink to `'self'` + Open-Meteo only.

---

*End of audit. No files were modified during this review; the report is the sole output. Findings reflect the repository state at commit `b73b11e` + the uncommitted local-validation changes described in §2 and §8.*
