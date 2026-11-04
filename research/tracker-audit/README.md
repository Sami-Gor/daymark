# Android weather app tracker audit — data and generator

Supporting files for the public report
[`docs/research/android-weather-app-tracker-audit.md`](../../docs/research/android-weather-app-tracker-audit.md).

## What is here

| File | Purpose |
|---|---|
| `raw.json` | The dataset. One object per application: package, version, report date, tracker list with Exodus category tags, permission list, and the counts derived from them. |
| `make_card.py` | Generates `audit-card.png` from `raw.json`. |
| `audit-card.png` | 1080 × 1350 share card generated from `raw.json`; pixel-level rendering may vary across systems. |
| `validate.py` | Recomputes every published figure from `raw.json` and the tagged `v2.0.0` Daymark source (manifest, build configuration and declared dependencies, extracted with `git`), and fails if any no longer reproduces or if the tag/file is unavailable. |
| `SOURCES.md` | Per-application Exodus links, report dates, exclusions, and the Daymark source references. |

## What this is not

Daymark is **not** in `raw.json` and was **not** scanned by Exodus. No recognised advertising, analytics, crash-reporting or attribution SDK was identified in Daymark's manifest and 12 declared JavaScript runtime dependencies at the published `v2.0.0` git tag (commit `c371300b3908a8f9805078f26159ff1a44f6538a`) by source inspection. Daymark was not subjected to an Exodus APK scan. Its row is a separate source inspection, not part of the Exodus results.

The Daymark permission figures describe the **verified `v2.0.0` release AAB/source, not an independently verified Play-served bundle**. They do not establish that Google Play currently serves that AAB or that its Play-served permission display matches it; that discrepancy is tracked separately.

## Validate

```bash
cd research/tracker-audit
python3 validate.py
```

It checks:

- 20 applications and 20 unique package ids;
- 141 aggregate tracker detections;
- median 4.5 (mean of the 10th and 11th ascending counts);
- at least 17 applications whose recovered Exodus permission names explicitly list `ACCESS_ADSERVICES_AD_ID` (the remaining three are not established as negatives);
- 19 declaring `ACCESS_BACKGROUND_LOCATION`;
- Met Office at 35 declared permissions;
- every per-app `tracker_count` equalling its tracker list length;
- Daymark absent from the scan, and its tagged `v2.0.0` manifest declaring exactly 4 permissions — `INTERNET`, `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` — with no `ACCESS_FINE_LOCATION`, advertising-ID or background-location permission;
- Daymark's tagged build config at `versionCode` 2 / `versionName` 2.0.0 and package id `io.github.sami_gor.daymark`;
- no recognised advertising, analytics, crash-reporting or attribution SDK identified in Daymark's manifest and 12 declared JavaScript runtime dependencies at the `v2.0.0` tag by source inspection;
- the PNG being 1080 × 1350.

The Daymark checks extract `AndroidManifest.xml`, `build.gradle` and `package.json` from tag `v2.0.0` with `git show` — never from the working tree — and fail loudly if the tag or file is unavailable. Exit status is non-zero on any failure, so it can run in CI.

## Daymark release pinning

The Daymark reference row is pinned to the published `v2.0.0` tag:

- Tag `v2.0.0` → commit `c371300b3908a8f9805078f26159ff1a44f6538a`.
- Tagged manifest: `INTERNET`, `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` — four permissions, with no `ACCESS_FINE_LOCATION`, advertising-ID or background-location permission.
- Tagged build config: `versionCode` 2, `versionName` 2.0.0, package `io.github.sami_gor.daymark`.
- Release AAB (`app-release.aab`, published `v2.0.0` release asset) SHA-256: `55366377d50c00dfc53e8bc2e049ec298cd5c087e2de0db2eb8353b182f771b4`.

V1 (`versionCode` 1) declared five permissions, including `ACCESS_FINE_LOCATION`; V2 removed it. The `main` branch still carries V1, so checking a manifest against the working tree describes the wrong release.

These permissions describe the **verified `v2.0.0` release AAB/source, not an independently verified Play-served bundle**. The Play-served bundle is not established here and must not be equated with the GitHub AAB.

## Regenerate the card

```bash
cd research/tracker-audit
python3 make_card.py        # writes audit-card.png, 1080x1350
```

Requires Python 3 and Pillow. `make_card.py` loads macOS system fonts from
`/System/Library/Fonts/Supplemental/` (Georgia Bold, Arial, Arial Bold); on another
platform, point `F` at equivalents.

The card is generated from `raw.json`. Its content and layout are reproducible, but
the PNG may not be byte-identical across systems because font rendering can vary.
Font rasterisation and platform differences can change individual pixels even when
the underlying data and design are unchanged.

The card sorts applications by tracker count descending (ties by name) and appends
Daymark. Its headline figures, the Daymark 2.0.0/Met Office permission comparison and
the "trackers are code signatures, not proof of activity" footer all come from
`raw.json` or are fixed strings in the generator — never from hand-edited pixels. The
bottom permission line reads "Daymark 2.0.0 declares 4 permissions. The Met Office app
declares 35."

## Data gaps

- No APK SHA-256 hashes, Android version codes or developer names were captured.
- Permission **names** are a subset of each app's declared permission count.
- WarnWetter's report is from March 2026, older than the rest of the sample.
- The dataset is a snapshot; Exodus may publish newer reports at any time.

See `SOURCES.md` for the full list.

## Adding an application

Extend the scrape and re-run it — this produces a **new** snapshot. Recompute the
headline figures, update the report and the card, and re-run `validate.py`. Do not
append rows by hand: the script's consistency and aggregate checks assume the dataset
was produced in one collection run.

## Licence

Tracker data is derived from Exodus Privacy reports and remains subject to their
terms. Application names and package identifiers belong to their respective owners and
appear here for identification only. No APK binaries are included.
