#!/usr/bin/env bash
# Regenerate or verify a SHA-256 evidence manifest for a reviewable bundle.
#
# Why this exists (defect A4): the round 4 evidence manifest
# archive/reports/round4-b-evidence-20261118/SHA256SUMS.txt went stale after
# plans-lib.sh was fixed (it still recorded 73520f6e...), listed files that did
# not exist in its directory, omitted the regeneration log, and contained a
# self-entry whose hash can never be correct. This tool makes the manifest a
# reproducible artifact instead of a hand-maintained snapshot:
#   * it is generated from the actual bytes (never edited by hand);
#   * it lists every regular file under the bundle root, so omissions fail;
#   * it never lists itself (self-hash is impossible);
#   * --check fails on a missing/stale/tampered manifest and prints a diff.
#
# Usage:
#   ./refresh-evidence-manifest.sh [--check] [--name NAME] DIR
#
# Default NAME is SHA256SUMS. --check exits 0 when current, 1 when stale/missing.
set -euo pipefail

CHECK=0
NAME=SHA256SUMS
DIR=""

usage() { sed -n '2,22p' "$0"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1; shift ;;
    --name) NAME=$2; shift 2 ;;
    -h|--help) usage ;;
    -*) die "unknown option: $1" ;;
    *) DIR=$1; shift ;;
  esac
done

[ -n "$DIR" ] || die "DIR is required"
[ -d "$DIR" ] || die "not a directory: $DIR"
case "$NAME" in
  */*|.|..) die "--name must be a plain file name" ;;
esac

DIR=$(cd "$DIR" && pwd -P)
MANIFEST="$DIR/$NAME"
TMP=$(mktemp "${TMPDIR:-/tmp}/evidence-sums.XXXXXX") || die "mktemp failed"
trap 'rm -f "$TMP"' EXIT

# Every regular file under the bundle root, excluding the manifest itself, in a
# stable C-locale order. (Bundles are text/evidence trees; no .git directories
# are expected. Excluding .git keeps the tool usable on a checkout.)
(
  cd "$DIR"
  find . -type f ! -name "$NAME" ! -path './.git/*' -print | LC_ALL=C sort
) > "$TMP.list" || die "file enumeration failed"

COUNT=0
: > "$TMP"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if [ ! -f "$DIR/$f" ]; then die "listed path disappeared: $f"; fi
  # Hash with a path relative to the bundle root so the manifest is portable
  # (shasum -c must work from $DIR, not just on the machine that wrote it).
  ( cd "$DIR" && shasum -a 256 "$f" ) >> "$TMP"
  COUNT=$((COUNT + 1))
done < "$TMP.list"
rm -f "$TMP.list"

if [ "$COUNT" = 0 ]; then
  die "no files found under $DIR (refusing to write an empty manifest)"
fi
# Guard against a stale manifest listing itself.
if [ -f "$MANIFEST" ] && grep -q -E "[[:space:]]\./$NAME$" "$MANIFEST" 2>/dev/null; then
  if [ "$CHECK" = 1 ]; then
    echo "STALE: $NAME lists itself (self-hash is impossible)" >&2
    exit 1
  fi
fi
if grep -q -E "[[:space:]]\./$NAME$" "$TMP" 2>/dev/null; then
  die "internal error: generated manifest lists itself"
fi

if [ "$CHECK" = 1 ]; then
  if [ ! -f "$MANIFEST" ]; then
    echo "STALE: manifest missing: $MANIFEST" >&2
    echo "run: $0 $DIR (without --check) to regenerate it" >&2
    exit 1
  fi
  if cmp -s "$TMP" "$MANIFEST"; then
    echo "OK: $NAME is current ($COUNT files)"
    exit 0
  fi
  echo "STALE: $MANIFEST does not match the current tree ($COUNT files)" >&2
  echo "--- differences (generated vs recorded; - expected, + recorded) ---" >&2
  diff -u "$MANIFEST" "$TMP" 2>/dev/null | sed -n '1,80p' >&2 || true
  exit 1
fi

mv -f "$TMP" "$MANIFEST" || die "cannot write manifest: $MANIFEST"
trap - EXIT
echo "WROTE: $MANIFEST ($COUNT files)"
