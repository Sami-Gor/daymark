# Sources

The 20-app Exodus findings in the public report come from `raw.json`, which was produced by scraping Exodus Privacy report pages on 3–4 November 2026. Daymark is a separate reference row based on source inspection of the published `v2.0.0` release tag and its release AAB; it is not part of the Exodus dataset.

## Primary source

[Exodus Privacy](https://exodus-privacy.eu.org) — a non-profit that performs static
analysis of Android applications and publishes the trackers and permissions it finds
in each APK. The reports used here are the "latest report" pages at
`https://reports.exodus-privacy.eu.org/en/reports/<package>/latest/`, fetched with the
scraper described in `../README.md`.

Supporting pages: [report index](https://reports.exodus-privacy.eu.org) and the
[tracker catalogue](https://reports.exodus-privacy.eu.org/en/trackers/).

## Per-application records

Each row pins the snapshot by package, version string and report creation date. The
linked page is the *live* latest report and may have been regenerated since; the
version and date above are what this audit actually recorded.

| Application | Package | Version | Report created | Store | Exodus report |
|---|---|---|---|---|---|
| Transparent clock & weather | `com.droid27.transparentclockweather` | 9.17.0 | Oct. 6, 2026, 6:29 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.droid27.transparentclockweather/latest/) |
| The Weather Channel | `com.weather.Weather` | 16.21.1 | Sept. 11, 2026, 3:12 a.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.weather.Weather/latest/) |
| WeatherBug | `com.aws.android` | 6.7.0 | Sept. 3, 2026, 7:04 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.aws.android/latest/) |
| 1Weather | `com.handmark.expressweather` | 12.9.3 | Sept. 19, 2026, 1:29 a.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.handmark.expressweather/latest/) |
| Wunderground | `com.wunderground.android.weather` | 6.20.1 | Aug. 29, 2026, 4:57 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.wunderground.android.weather/latest/) |
| Meteored | `aplicacion.tiempo` | 8.12.8_free | Oct. 31, 2026, 12:52 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/aplicacion.tiempo/latest/) |
| MyRadar | `com.acmeaom.android.myradar` | 8.73.0 | Aug. 29, 2026, 9:21 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.acmeaom.android.myradar/latest/) |
| Weather&Radar | `de.wetteronline.wetterapp` | 2026.20 | Oct. 16, 2026, 5:58 a.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/de.wetteronline.wetterapp/latest/) |
| YoWindow | `yo.app.free` | 2.59.18 | Aug. 25, 2026, 11:12 a.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/yo.app.free/latest/) |
| Met Office | `uk.gov.metoffice.weather.android` | 3.69.0 | Oct. 28, 2026, 6:26 a.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/uk.gov.metoffice.weather.android/latest/) |
| AccuWeather | `com.accuweather.android` | 21.2.0 | Oct. 16, 2026, 5:29 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.accuweather.android/latest/) |
| Today Weather | `mobi.lockdown.weather` | 2.5.1 | Sept. 3, 2026, 7:01 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/mobi.lockdown.weather/latest/) |
| WeatherPro | `com.mg.android` | 5.6.13 | Oct. 6, 2026, 6:32 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.mg.android/latest/) |
| Windy.com | `com.windyty.android` | 51.3.2 | Oct. 19, 2026, 5:30 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.windyty.android/latest/) |
| RainViewer | `com.lucky_apps.RainViewer` | 7.21 | Sept. 14, 2026, 11:36 a.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.lucky_apps.RainViewer/latest/) |
| meteoblue | `com.meteoblue.droid` | Cirrus Uncinus 3.1.6 | Oct. 25, 2026, 9:14 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.meteoblue.droid/latest/) |
| Yr | `no.nrk.yr` | 6.7.0 | Oct. 20, 2026, 9:15 a.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/no.nrk.yr/latest/) |
| WarnWetter | `de.dwd.warnapp` | 5.4.2 | March 30, 2026, 11:47 a.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/de.dwd.warnapp/latest/) |
| Breezy Weather | `org.breezyweather` | 6.2.2_freenet | Aug. 26, 2026, 10:42 p.m. | F-Droid | [latest report](https://reports.exodus-privacy.eu.org/en/reports/org.breezyweather/latest/) |
| Pixel Weather | `com.google.android.apps.weather` | 1.1.20260716.979549101.release | Sept. 26, 2026, 6:11 p.m. | Google Play | [latest report](https://reports.exodus-privacy.eu.org/en/reports/com.google.android.apps.weather/latest/) |

**APK SHA-256:** not recorded for any of the 20 scanned applications. The original scrape captured report metadata only; no APK was downloaded or hashed. Hashes are therefore absent rather than omitted, and are not reconstructed here. (The separate Daymark row records the published release AAB hash above; that is not one of the Exodus-scanned APKs.)

**Version codes:** not recorded for the 20 scanned applications. Only the version name string was captured. (The Daymark row's `versionCode` comes from the tagged release build config.)

**Developer names:** not recorded in the dataset.

## Excluded candidates

| Application | Reason |
|---|---|
| BBC Weather | Newest Exodus report available was from October 2022 — too old to represent the shipped app. |
| CARROT Weather | Newest Exodus report available was from June 2023 — too old to represent the shipped app. |

Neither was excluded because it looked clean; both were excluded for staleness.

## Daymark reference row

Daymark was **not** scanned by Exodus. Its figures come from the published `v2.0.0` release source and AAB, not from the working tree or `main`:

- Tag: [`v2.0.0`](https://github.com/Sami-Gor/daymark/releases/tag/v2.0.0) → commit [`c371300b3908a8f9805078f26159ff1a44f6538a`](https://github.com/Sami-Gor/daymark/commit/c371300b3908a8f9805078f26159ff1a44f6538a).
- Tagged manifest: <https://github.com/Sami-Gor/daymark/blob/v2.0.0/artifacts/weather-app/android/app/src/main/AndroidManifest.xml> — exactly four `uses-permission` entries: `INTERNET`, `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`. No `ACCESS_FINE_LOCATION`, no advertising-ID and no background-location permission. The tagged build config is `versionCode 2`, `versionName "2.0.0"`, package `io.github.sami_gor.daymark`. For history, V1 (`versionCode 1`) declared five permissions including `ACCESS_FINE_LOCATION`.
- Tagged dependencies: <https://github.com/Sami-Gor/daymark/blob/v2.0.0/artifacts/weather-app/package.json> — 12 declared JavaScript runtime dependencies. No recognised advertising, analytics, crash-reporting or attribution SDK was identified in the manifest and these dependencies by source inspection. Daymark was not subjected to an Exodus APK scan.
- Release AAB: `app-release.aab` (published `v2.0.0` release asset) SHA-256 `55366377d50c00dfc53e8bc2e049ec298cd5c087e2de0db2eb8353b182f771b4`.

**Caveat:** these permissions describe the **verified `v2.0.0` release AAB/source, not an independently verified Play-served bundle**. They do not establish that Google Play currently serves that AAB, or that its Play-served permission display matches it; the Play bundle discrepancy is tracked separately and must not be equated with the GitHub AAB.

Anyone re-checking the Daymark row must repeat it against the `v2.0.0` tag/commit (the validator does this with `git show`), because both the manifest and the release can change. `main` is still the V1 line and declares five permissions, so an inspection of the working tree would describe the wrong version.

## Dataset provenance

- Collection script: `scrape_exodus.py` (authoring copy, not committed here). It fetches
  each package's latest report, parses the app name, version, report date, tracker list
  with category tags, and the permission list.
- Politeness: no browser User-Agent, 2-second delay between requests, two retries.
- Aggregation and the CSV/standalone chart were produced by `build.py` (authoring copy).
- The committed `raw.json` is the unmodified scraper output, minus nothing.

## Known gaps

1. Permission **names** are a subset of each app's declared count (Exodus reports a total
   badge and names only some entries). Counts are reliable; name lists are illustrative.
2. At least 17 reports explicitly list `ACCESS_ADSERVICES_AD_ID` in the recovered permission names. It was not listed for WarnWetter, Breezy Weather and Pixel Weather, but the incomplete names do not establish whether those three declare it; no full manifest dump was retained.
3. WarnWetter's report is from 30 March 2026, older than the rest of the sample.
4. No APK hashes, version codes or developer names were captured.

Corrections: open an issue or a pull request against the report and the change will be
dated. Re-running the scrape produces a new snapshot with new figures — it does not
retroactively correct this one.
