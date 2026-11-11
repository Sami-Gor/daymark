#!/usr/bin/env bash
#
# Positive and negative tests for the sherpa-onnx AAR integrity gate .
#
# Each case stages a copy of the committed AAR and its pinned digest in work/,
# runs :verifySherpaAar from the standalone Gradle project next to this script,
# and asserts both the exit status and a case-specific message. The committed
# artifact and pin are never modified: every mutation happens on a copy.
#
# The release-only wiring is asserted with --dry-run against tasks named like
# the ones the Android Gradle plugin creates.
#
# Usage:
#   artifacts/weather-app/android/tools/sherpa-aar-integrity/run-tests.sh
#
# Environment:
#   OUT_DIR   directory for the per-case Gradle logs (default: ./out)
#   GRADLEW   Gradle launcher to use (default: ../../gradlew)
#
# Exit status is 0 only when every case behaves as expected.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="$(cd "$HERE/../.." && pwd)"
GRADLEW="${GRADLEW:-$ANDROID_DIR/gradlew}"
LIB_DIR="$ANDROID_DIR/daymark-voice/libs"
PIN="$ANDROID_DIR/daymark-voice/sherpa-aar.sha256"
WORK="$HERE/work"
OUT_DIR="${OUT_DIR:-$HERE/out}"

if [ ! -x "$GRADLEW" ]; then
  echo "error: Gradle launcher not found or not executable: $GRADLEW" >&2
  exit 2
fi
if [ ! -f "$PIN" ]; then
  echo "error: pin file not found: $PIN" >&2
  exit 2
fi

AAR_NAME="$(awk '!/^[[:space:]]*#/ && NF == 2 { print $2; exit }' "$PIN")"
AAR_SHA="$(awk '!/^[[:space:]]*#/ && NF == 2 { print $1; exit }' "$PIN")"
if [ -z "${AAR_NAME:-}" ] || [ -z "${AAR_SHA:-}" ]; then
  echo "error: could not read the AAR name and digest from $PIN" >&2
  exit 2
fi
AAR_SRC="$LIB_DIR/$AAR_NAME"
if [ ! -f "$AAR_SRC" ]; then
  echo "error: committed AAR not found: $AAR_SRC" >&2
  exit 2
fi

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
ZERO_SHA="$(printf '0%.0s' $(seq 1 64))"

PASS=0
FAIL=0
FAILED_CASES=""

reset_work() {
  rm -rf "$WORK"
  mkdir -p "$WORK/aar"
}

stage_aar() {
  cp "$AAR_SRC" "$WORK/aar/$AAR_NAME"
}

stage_pin() {
  cp "$PIN" "$WORK/sherpa-aar.sha256"
}

# run_case <name> <expected: ok|fail> <pattern> <gradle args...>
# A pattern starting with '!' must NOT appear in the output.
run_case() {
  local name="$1"
  local expectation="$2"
  local pattern="$3"
  shift 3

  local log="$OUT_DIR/test-$name.log"
  ( cd "$HERE" && "$GRADLEW" --console=plain "$@" ) >"$log" 2>&1
  local status=$?

  local problems=""
  if [ "$expectation" = "ok" ] && [ "$status" -ne 0 ]; then
    problems="expected success, got exit $status"
  elif [ "$expectation" = "fail" ] && [ "$status" -eq 0 ]; then
    problems="expected failure, got exit 0"
  fi

  if [ "${pattern#!}" != "$pattern" ]; then
    local forbidden="${pattern#!}"
    if grep -Fq -- "$forbidden" "$log"; then
      problems="${problems:+$problems; }output unexpectedly contains: $forbidden"
    fi
  else
    if ! grep -Fq -- "$pattern" "$log"; then
      problems="${problems:+$problems; }output does not contain: $pattern"
    fi
  fi

  if [ -n "$problems" ]; then
    FAIL=$((FAIL + 1))
    FAILED_CASES="$FAILED_CASES $name"
    echo "FAIL $name: $problems (log: $log)"
  else
    PASS=$((PASS + 1))
    echo "pass $name"
  fi
}

echo "== sherpa-onnx AAR integrity gate tests =="
echo "AAR:  $AAR_SRC"
echo "pin:  $PIN"
echo "logs: $OUT_DIR"
echo

# 1. The committed artifact and pin pass.
reset_work
stage_aar
stage_pin
run_case "pass-committed-aar" ok "integrity verified" :verifySherpaAar

# 2. A single flipped byte fails the gate.
reset_work
stage_aar
stage_pin
printf '\101' | dd of="$WORK/aar/$AAR_NAME" bs=1 seek=1000 conv=notrunc status=none
run_case "fail-mutated-aar" fail "SHA-256 mismatch" :verifySherpaAar

# 3. A missing AAR fails closed.
reset_work
stage_pin
run_case "fail-missing-aar" fail "missing (expected at" :verifySherpaAar

# 4. A wrong pinned digest fails.
reset_work
stage_aar
printf '%s  %s\n' "$ZERO_SHA" "$AAR_NAME" >"$WORK/sherpa-aar.sha256"
run_case "fail-wrong-digest" fail "SHA-256 mismatch" :verifySherpaAar

# 5. A malformed digest in the pin fails before any comparison.
reset_work
stage_aar
printf 'not-a-digest  %s\n' "$AAR_NAME" >"$WORK/sherpa-aar.sha256"
run_case "fail-malformed-digest" fail "not a 64-character hex SHA-256 digest" :verifySherpaAar

# 6. An empty pin (comments only) fails closed instead of verifying nothing.
reset_work
stage_aar
printf '# no pins here\n' >"$WORK/sherpa-aar.sha256"
run_case "fail-empty-pin" fail "refuses to run without a pin" :verifySherpaAar

# 7. A missing pin fails closed.
reset_work
stage_aar
run_case "fail-missing-pin" fail "pin file is missing" :verifySherpaAar

# 8. A missing AAR directory fails with an actionable message.
reset_work
stage_pin
rm -rf "$WORK/aar"
run_case "fail-missing-aar-dir" fail "AAR directory is missing" :verifySherpaAar

# 9. A pin that points outside the AAR directory is rejected.
reset_work
stage_aar
printf '%s  nested/%s\n' "$AAR_SHA" "$AAR_NAME" >"$WORK/sherpa-aar.sha256"
run_case "fail-path-in-pin" fail "must be a file name inside" :verifySherpaAar

# 10. Release builds depend on the gate (AGP task names, created after apply).
reset_work
stage_aar
stage_pin
run_case "pass-release-wiring" ok "verifySherpaAar" assembleRelease --dry-run
run_case "pass-release-wiring-prerelease" ok "verifySherpaAar" preReleaseBuild --dry-run
run_case "pass-release-wiring-package" ok "verifySherpaAar" packageReleaseAar --dry-run

# 11. Debug builds and JVM unit tests are not wired to the gate.
reset_work
stage_aar
stage_pin
run_case "pass-debug-not-wired" ok "!verifySherpaAar" preDebugBuild testDebugUnitTest lintDebug --dry-run

# 12. The gate always re-runs: a second invocation on unchanged inputs is not
#     reported as UP-TO-DATE (it executes and re-verifies the bytes).
reset_work
stage_aar
stage_pin
( cd "$HERE" && "$GRADLEW" --console=plain :verifySherpaAar ) >"$OUT_DIR/test-idempotent-first.log" 2>&1
( cd "$HERE" && "$GRADLEW" --console=plain :verifySherpaAar ) >"$OUT_DIR/test-idempotent-second.log" 2>&1
second_status=$?
if [ "$second_status" -eq 0 ] && grep -Fq "integrity verified" "$OUT_DIR/test-idempotent-second.log" \
    && ! grep -Fq "UP-TO-DATE" "$OUT_DIR/test-idempotent-second.log"; then
  PASS=$((PASS + 1))
  echo "pass idempotent-rerun"
else
  FAIL=$((FAIL + 1))
  FAILED_CASES="$FAILED_CASES idempotent-rerun"
  echo "FAIL idempotent-rerun: second run did not re-verify (log: $OUT_DIR/test-idempotent-second.log)"
fi

"$GRADLEW" --stop >/dev/null 2>&1 || true

echo
echo "== summary: $PASS passed, $FAIL failed =="
if [ "$FAIL" -ne 0 ]; then
  echo "failed cases:$FAILED_CASES"
  exit 1
fi
