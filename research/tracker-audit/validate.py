#!/usr/bin/env python3
"""Validate the tracker-audit dataset and every figure published in the report.

Every expected number below is a *claim* that must be reproduced from the data.
This script computes each metric from `raw.json` and, for Daymark, from the
Android manifest, build configuration and declared dependencies at the published
**v2.0.0 git tag** (extracted with `git show`, never from the working tree). It
fails if a claim no longer holds, or if the tag/file cannot be read.

The Daymark figures describe the verified v2.0.0 release source/AAB, not an
independently verified Play-served bundle.

Usage:
    python3 validate.py           # human-readable output
    python3 validate.py --quiet   # only the failure lines and summary
"""
from __future__ import annotations

import json
import re
import statistics
import struct
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
RAW = HERE / "raw.json"
CARD = HERE / "audit-card.png"

# The Daymark reference row is pinned to the published release tag. Validating
# the working tree instead would silently describe whatever branch is checked
# out (main is the V1 line, which still declares five permissions).
TAG = "v2.0.0"
TAGGED_MANIFEST = "artifacts/weather-app/android/app/src/main/AndroidManifest.xml"
TAGGED_BUILD_GRADLE = "artifacts/weather-app/android/app/build.gradle"
TAGGED_PACKAGE_JSON = "artifacts/weather-app/package.json"

EXPECTED_DAYMARK_PERMISSIONS = [
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.INTERNET",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.RECORD_AUDIO",
]
TRACKER_SDK_MARKERS = ("firebase", "crashlytics", "admob", "appsflyer", "sentry",
                       "mixpanel", "amplitude", "facebook", "onesignal", "adjust")

# Published claims. These are expectations, not the source of truth: the
# computed values below come from the dataset and the tagged Daymark source.
CLAIM = {
    "applications": 20,
    "aggregate_detections": 141,
    "median": 4.5,
    "ad_id_apps": 17,
    "background_location_apps": 19,
    "met_office_permissions": 35,
    "daymark_permissions": 4,
    "daymark_version_code": 2,
    "daymark_version_name": "2.0.0",
    "daymark_package": "io.github.sami_gor.daymark",
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


def git_show(repo_root: Path, revision_path: str) -> str:
    """Return a file's contents at a git revision, or fail with a clear message."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_root), "show", revision_path],
            capture_output=True,
            text=True,
        )
    except OSError as exc:
        raise RuntimeError(
            f"cannot run git to read {revision_path!r}: {exc}. "
            f"The Daymark figures are pinned to tag {TAG!r}."
        ) from exc
    if proc.returncode != 0:
        detail = proc.stderr.strip() or f"git show exited {proc.returncode}"
        raise RuntimeError(
            f"cannot read {revision_path!r} from tag {TAG!r} ({detail}); "
            f"the published Daymark figures are pinned to tag {TAG!r}. "
            "Fetch tags (git fetch --tags) or check the checkout."
        )
    return proc.stdout


def manifest_permissions(text: str) -> list[str]:
    return sorted(set(re.findall(r'<uses-permission[^>]*android:name="([^"]+)"', text)))


def tag_file(label: str, path_in_tag: str) -> str | None:
    """Extract one file from the pinned tag, or record a loud failure."""
    try:
        return git_show(REPO_ROOT, f"{TAG}:{path_in_tag}")
    except RuntimeError as exc:
        failures.append(str(exc))
        print(f"FAIL  {label}: {exc}")
        return None


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

    # Daymark is intentionally absent from the scan; its row is a source
    # inspection, pinned to the v2.0.0 release tag.
    check("Daymark absent from Exodus dataset",
          any("daymark" in p.lower() for p in packages), False, quiet)

    manifest_text = tag_file(f"Daymark manifest at tag {TAG}", TAGGED_MANIFEST)
    if manifest_text is not None:
        perms = manifest_permissions(manifest_text)
        check("Daymark declared permissions (v2.0.0 tagged manifest)", len(perms),
              CLAIM["daymark_permissions"], quiet)
        check("Daymark declared permission set (v2.0.0 tagged manifest)", perms,
              EXPECTED_DAYMARK_PERMISSIONS, quiet)
        check("Daymark fine-location permission (v2.0.0 tagged manifest)",
              [p for p in perms if p.endswith(".ACCESS_FINE_LOCATION")], [], quiet)
        check("Daymark background-location permission (v2.0.0 tagged manifest)",
              [p for p in perms if p.endswith(".ACCESS_BACKGROUND_LOCATION")], [], quiet)
        check("Daymark advertising-ID permission (v2.0.0 tagged manifest)",
              [p for p in perms if p.endswith(".AD_ID")], [], quiet)

    gradle_text = tag_file(f"Daymark build.gradle at tag {TAG}", TAGGED_BUILD_GRADLE)
    if gradle_text is not None:
        version_code = re.search(r"\bversionCode\s+(\d+)", gradle_text)
        check("Daymark versionCode (v2.0.0 tagged build.gradle)",
              int(version_code.group(1)) if version_code else None,
              CLAIM["daymark_version_code"], quiet)
        version_name = re.search(r'\bversionName\s+"([^"]+)"', gradle_text)
        check("Daymark versionName (v2.0.0 tagged build.gradle)",
              version_name.group(1) if version_name else None,
              CLAIM["daymark_version_name"], quiet)
        namespace = re.search(r'\bnamespace\s*=\s*"([^"]+)"', gradle_text)
        check("Daymark package id (v2.0.0 tagged build.gradle)",
              namespace.group(1) if namespace else None,
              CLAIM["daymark_package"], quiet)

    # The published Daymark figure is a dependency/manifest inspection, so it has
    # no Exodus tracker row. Assert it from the tagged declared dependencies too.
    package_json_text = tag_file(f"Daymark package.json at tag {TAG}", TAGGED_PACKAGE_JSON)
    if package_json_text is not None:
        deps = json.loads(package_json_text).get("dependencies", {})
        hits = sorted(d for d in deps if any(m in d.lower() for m in TRACKER_SDK_MARKERS))
        check("Daymark tracker SDKs in declared dependencies (v2.0.0 tagged package.json)",
              hits, [], quiet)

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
