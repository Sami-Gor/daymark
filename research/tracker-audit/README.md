# Android weather app tracker audit — data and generator

Supporting files for the public report
[`docs/research/android-weather-app-tracker-audit.md`](../../docs/research/android-weather-app-tracker-audit.md).

## What is here

| File | Purpose |
|---|---|
| `raw.json` | The dataset. One object per application: package, version, report date, tracker list with Exodus category tags, permission list, and the counts derived from them. |
| `make_card.py` | Generates `audit-card.png` from `raw.json`. |
| `audit-card.png` | 1080 × 1350 share card. Byte-identical to the output of `make_card.py`. |
| `validate.py` | Recomputes every published figure from `raw.json` and the Daymark source, and fails if any no longer reproduces. |
| `SOURCES.md` | Per-application Exodus links, report dates, exclusions, and the Daymark source references. |

## What this is not

Daymark is **not** in `raw.json` and was **not** scanned by Exodus. Its row in the
report is a source inspection of the Android manifest and the JavaScript dependency
list, labelled as such in the report and in `SOURCES.md`. `validate.py` checks that
claim against the repository files rather than against the scan data.

## Validate

```bash
cd research/tracker-audit
python3 validate.py
```

It checks, from `raw.json` itself:

- 20 applications and 20 unique package ids;
- 141 aggregate tracker detections;
- median 4.5 (mean of the 10th and 11th ascending counts);
- 17 applications declaring `ACCESS_ADSERVICES_AD_ID`;
- 19 declaring `ACCESS_BACKGROUND_LOCATION`;
- Met Office at 35 declared permissions;
- every per-app `tracker_count` equalling its tracker list length;
- Daymark absent from the scan, and its manifest declaring 5 permissions with no
  advertising-ID or background-location permission;
- no advertising/analytics SDK in Daymark's declared dependencies;
- the PNG being 1080 × 1350.

Exit status is non-zero on any failure, so it can run in CI.

## Regenerate the card

```bash
cd research/tracker-audit
python3 make_card.py        # writes audit-card.png, 1080x1350
```

Requires Python 3 and Pillow. `make_card.py` loads macOS system fonts from
`/System/Library/Fonts/Supplemental/` (Georgia Bold, Arial, Arial Bold); on another
platform, point `F` at equivalents. With the macOS fonts the output is byte-identical
to the committed PNG — that is how the committed image was verified.

The card sorts applications by tracker count descending (ties by name) and appends
Daymark. Its headline figures, the Daymark/Met Office permission comparison and the
"trackers are code signatures, not proof of activity" footer all come from `raw.json`
or are fixed strings in the generator — never from hand-edited pixels.

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
