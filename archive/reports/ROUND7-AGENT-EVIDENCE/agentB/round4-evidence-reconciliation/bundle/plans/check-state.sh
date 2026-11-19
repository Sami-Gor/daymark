#!/usr/bin/env bash
# Classify a working tree as a consistent Plan A (new) state, a consistent
# Plan B (old) state, or an inconsistent/hazard state. Read-only.
#
# Usage:
#   ./check-state.sh [--repo DIR] [--staging DIR] [--expect new|old|any|mixed]
#                    [--include-negative] [--with-archives]
#
# Exit 0 = state matches --expect (default any), 1 = mismatch, 2 = usage error.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/parakeet-pins.env"
. "$HERE/plans-lib.sh"

REPO=$REPO_ROOT
STAGING=$STAGING_DIR
EXPECT=any
INCLUDE_NEGATIVE=0
WITH_ARCHIVES=0

usage() { sed -n '2,12p' "$0"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift 2 ;;
    --staging) STAGING=$2; shift 2 ;;
    --expect) EXPECT=$2; shift 2 ;;
    --include-negative) INCLUDE_NEGATIVE=1; shift ;;
    --with-archives) WITH_ARCHIVES=1; shift ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd shasum
require_cmd grep

PINS=$(pins_state "$REPO")
STAGED=$(staged_class "$STAGING")

STATE=inconsistent
if [ "$PINS" = new ] && [ "$STAGED" = new ]; then STATE=plan-a
elif [ "$PINS" = old ] && [ "$STAGED" = old ]; then STATE=plan-b
elif [ "$PINS" = old ] && [ "$STAGED" = new ]; then STATE=hazard-staged-new-pinned-old
elif [ "$PINS" = new ] && [ "$STAGED" = old ]; then STATE=hazard-pinned-new-staged-old
fi

echo "== Plan state =="
echo "repo            $REPO"
echo "staging         $STAGING"
echo "pins_state      $PINS"
echo "staged_state    $STAGED"
echo "overall_state   $STATE"
echo

echo "== pin literal counts (six files, exact expected values) =="
pins_table "$REPO"
echo

echo "== staged files =="
staged_report "$STAGING"
echo

if [ "$INCLUDE_NEGATIVE" = 1 ]; then
  echo "== negative worktree staging (informational; not modified by either plan) =="
  echo "negative_staging $NEGATIVE_STAGING_DIR"
  echo "negative_staged_state $(staged_class "$NEGATIVE_STAGING_DIR")"
  echo
fi

if [ "$WITH_ARCHIVES" = 1 ]; then
  check_archives
  echo
fi

RESULT=1
case "$EXPECT" in
  any) RESULT=0 ;;
  new) if [ "$STATE" = plan-a ]; then RESULT=0; fi ;;
  old) if [ "$STATE" = plan-b ]; then RESULT=0; fi ;;
  mixed) if [ "$STATE" != plan-a ] && [ "$STATE" != plan-b ]; then RESULT=0; fi ;;
  *) die "invalid --expect value: $EXPECT" ;;
esac

if [ "$RESULT" = 0 ]; then
  echo "RESULT: state matches expectation ($EXPECT)"
else
  echo "RESULT: state does NOT match expectation ($EXPECT)"
fi
exit "$RESULT"
