# Applying the research to Daymark

This page separates controls documented in the repository from recommendations that should be verified during future reviews. It is not a claim that every control has undergone an independent security audit.

## Controls documented in the repository

| Area | Current documented approach | Where to inspect |
|---|---|---|
| Location consent | Geolocation is requested only after the user chooses **Use my location**; coordinates are rounded to two decimal places before transmission | [README privacy approach](../../README.md#privacy-approach); app geolocation code and tests |
| Data minimization | No Daymark-operated backend, accounts, ads, analytics, or telemetry are described; app does not persist location/search history, transcripts, or weather responses | [README architecture](../../README.md#architecture); [SECURITY.md](../../SECURITY.md) |
| Network boundary | Open-Meteo is the documented weather and geocoding provider; responses are parsed with Zod and fetches use timeouts | [SECURITY.md](../../SECURITY.md); artifacts/weather-app/src/lib/weather.ts |
| Hosted web security | Repository documents a restrictive Content Security Policy and related response headers in the hosted web/PWA configuration | artifacts/weather-app/public/_headers; [SECURITY.md](../../SECURITY.md) |
| Offline caching | Service worker caches the app shell; weather responses are not cached by the app/service worker | artifacts/weather-app/public/sw.js; [SECURITY.md](../../SECURITY.md) |
| Android permissions | Security policy documents coarse/fine location for user-initiated geolocation, microphone for speech input, and no background location | [SECURITY.md](../../SECURITY.md); artifacts/weather-app/android |
| Secrets and signing | Security policy says signing material is gitignored and no secrets ship in client/native artifacts | [SECURITY.md](../../SECURITY.md) |

These are repository-documented statements. They should be kept aligned with the implementation as it changes. The hosted web security headers do not automatically apply to the Android WebView; the native shell must be assessed in its own context.

## Prioritized review checklist

Use this as a repeatable review, not as a claim that all checks have passed.

### Baseline

- [ ] Confirm the only location request path remains explicit user action; add or maintain a regression test.
- [ ] Verify coordinate rounding happens before every outbound location request, including future endpoints and error/reporting paths.
- [ ] Review all network origins and response schemas when adding a provider or endpoint.
- [ ] Keep API credentials out of client code, bundled assets, logs, and commits.
- [ ] Review Android manifest permissions and every exported activity, service, receiver, and content provider. Export only components that need to be externally callable, with appropriate permissions.
- [ ] Review native bridge methods for strict input validation and minimal exposed functionality.
- [ ] Audit dependency changes and transitive packages; remove dependencies that are no longer needed.
- [ ] Ensure logs, crash reports, and diagnostics do not contain precise coordinates, speech text, or other sensitive user data.
- [ ] Check that privacy-policy statements still match actual behavior and third-party data flows.
- [ ] Keep release signing material and credentials outside version control; document the release and patch process.

### Before a release or material architecture change

- [ ] Inspect the built web bundle and Android manifest, not only source code, for unexpected permissions, origins, trackers, and secrets.
- [ ] Run the existing unit, browser, type-check, and production-build checks.
- [ ] Review the Content Security Policy and security headers against the actual deployed build and host.
- [ ] Test privacy-sensitive flows on a physical Android device as well as in browser/emulator tests where practical.
- [ ] Revisit third-party provider policies and speech-recognition/TTS behavior; platform providers may process data under their own terms.
- [ ] Record the date, commit, test commands, results, and any limitations for a meaningful security review.

## Proportionate controls

Daymark does not need security controls simply to sound sophisticated. Controls should follow its actual architecture and threat model. Given the documented client-only design, the highest-value priorities are location minimization, limited permissions, controlled network origins, careful native bridge/component boundaries, dependency hygiene, and accurate disclosure of third-party processing.

Do not claim that Daymark is “unhackable,” “fully private,” or “audited” unless there is evidence that supports the exact wording. A useful public claim is specific and verifiable—for example, that geolocation is requested only after user action and coordinates are rounded before transmission—provided the code and tests continue to prove it.
