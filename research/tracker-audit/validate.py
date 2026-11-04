#!/usr/bin/env python3
"""Validate the tracker-audit dataset and every figure published in the report.

Every expected number below is a *claim* that must be reproduced from the data.
This script computes each metric from `raw.json` (and, for Daymark, from the
Android manifest in this repository) and fails if a claim no longer holds.

Usage:
    python3 validate.py           # human-readable output
    python3 validate.py --quiet   # only the failure lines and summary
"""
from __future__ import annotations

import json
import re
import statistics
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw.json"
CARD = HERE / "audit-card.png"
MANIFEST = HERE.parents[1] / "artifacts/weather-app/android/app/src/main/AndroidManifest.xml"
PACKAGE_JSON = HERE.parents[1] / "artifacts/weather-app/package.json"
TRACKER_SDK_MARKERS = ("firebase", "crashlytics", "admob", "appsflyer", "sentry",
                       "mixpanel", "amplitude", "facebook", "onesignal", "adjust")

# Published claims. These are expectations, not the source of truth: the
# computed values below come from the dataset.
CLAIM = {
    "applications": 20,
    "aggregate_detections": 141,
    "median": 4.5,
    "ad_id_apps": 17,
    "background_location_apps": 19,
    "met_office_permissions": 35,
    "daymark_permissions": 5,
    "card_width": 1080,
    "card_height": 1350,
}

failures: list[str] = []
checks = 0


def check(label: str, actual, expected, quiet: bool) -> None:
    global checks
    checks += 1
    ok = actual == expected
    if not ok:
        failures.append(f"{label}: computed {actual!r}, published {expected!r}")
    if not quiet or not ok:
        print(f"{'PASS' if ok else 'FAIL'}  {label}: {actual!r}")


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as fh:
        header = fh.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"{path} is not a PNG")
    return struct.unpack(">II", header[16:24])


def manifest_permissions(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return sorted(set(re.findall(r'<uses-permission[^>]*android:name="([^"]+)"', text)))


def main() -> int:
    quiet = "--quiet" in sys.argv
    apps = json.loads(RAW.read_text(encoding="utf-8"))

    counts = [a["tracker_count"] for a in apps]
    packages = [a["package"] for a in apps]

    check("applications in dataset", len(apps), CLAIM["applications"], quiet)
    check("unique package ids", len(set(packages)), CLAIM["applications"], quiet)
    check("aggregate tracker detections", sum(counts), CLAIM["aggregate_detections"], quiet)
    check("median trackers per app", statistics.median(counts), CLAIM["median"], quiet)

    ad_id = [a for a in apps if "ACCESS_ADSERVICES_AD_ID" in a.get("permissions", [])]
    check("apps declaring advertising-ID access", len(ad_id), CLAIM["ad_id_apps"], quiet)

    bg = [a for a in apps if "ACCESS_BACKGROUND_LOCATION" in a.get("permissions", [])]
    check("apps declaring background location", len(bg), CLAIM["background_location_apps"], quiet)

    # Per-app consistency: the count must equal the length of the tracker list.
    mismatched = [a["package"] for a in apps if a["tracker_count"] != len(a.get("trackers", []))]
    check("per-app counts match tracker lists", mismatched, [], quiet)

    met = next((a for a in apps if a["app"] == "Met Office"), None)
    check("Met Office declared permissions", met["permission_count"] if met else None,
          CLAIM["met_office_permissions"], quiet)

    # Daymark is intentionally absent from the scan; its row is a source inspection.
    check("Daymark absent from Exodus dataset",
          any("daymark" in p.lower() for p in packages), False, quiet)

    if MANIFEST.exists():
        perms = manifest_permissions(MANIFEST)
        check("Daymark declared permissions (manifest)", len(perms), CLAIM["daymark_permissions"], quiet)
        ad_perm = [p for p in perms if p.endswith("AD_ID")]
        check("Daymark advertising-ID permission", ad_perm, [], quiet)
        bg_perm = [p for p in perms if p.endswith("ACCESS_BACKGROUND_LOCATION")]
        check("Daymark background-location permission", bg_perm, [], quiet)
    else:
        failures.append(f"Daymark manifest not found at {MANIFEST}")
        print(f"FAIL  Daymark manifest not found at {MANIFEST}")

    # The published Daymark figure is a dependency/manifest inspection, so it has
    # no Exodus tracker row. Assert it from the declared dependencies instead.
    if PACKAGE_JSON.exists():
        deps = json.loads(PACKAGE_JSON.read_text(encoding="utf-8")).get("dependencies", {})
        hits = sorted(d for d in deps if any(m in d.lower() for m in TRACKER_SDK_MARKERS))
        check("Daymark tracker SDKs in declared dependencies", hits, [],
              quiet)
    else:
        failures.append(f"Daymark package.json not found at {PACKAGE_JSON}")
        print(f"FAIL  Daymark package.json not found at {PACKAGE_JSON}")

    if CARD.exists():
        width, height = png_size(CARD)
        check("share card width", width, CLAIM["card_width"], quiet)
        check("share card height", height, CLAIM["card_height"], quiet)
    else:
        failures.append(f"share card not found at {CARD}")
        print(f"FAIL  share card not found at {CARD}")

    print()
    if failures:
        print(f"{len(failures)} FAILURE(S) across {checks} checks:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"OK: {checks} checks passed; every published figure reproduces from the dataset.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
