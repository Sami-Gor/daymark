#!/usr/bin/env bash
#
# Positive and negative tests for the sherpa-onnx AAR integrity gate.
#
# The Gradle gate derives its inputs from the applying project only
# (<projectDir>/sherpa-aar.sha256 and <projectDir>/libs). The cases stage
# copies at the fixed paths of the standalone Gradle project next to this
# script and never modify the committed module artifact or pin. Additional
# cases prove that the legacy property overrides (-P flags and
# gradle.properties) are rejected and that the provisioning script reads the
# committed pin instead of a hardcoded digest.
#
# The release-only wiring is asserted with --dry-run against tasks named like
# the ones the Android Gradle plugin creates.
#
# Usage:
#   artifacts/weather-app/android/tools/sherpa-aar-integrity/run-tests.sh
#
# Environment:
#   OUT_DIR   directory for the per-case logs (default: ./out)
#   GRADLEW   Gradle launcher to use (default: ../../gradlew)
#
# Exit status is 0 only when every case behaves as expected.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="$(cd "$HERE/../.." && pwd)"
REPO="$(cd "$ANDROID_DIR/../../.." && pwd)"
GRADLEW="${GRADLEW:-$ANDROID_DIR/gradlew}"
MODULE_DIR="$ANDROID_DIR/daymark-voice"
LIB_DIR="$MODULE_DIR/libs"
PIN="$MODULE_DIR/sherpa-aar.sha256"
GRADLE_PROPERTIES="$ANDROID_DIR/gradle.properties"
FETCH_SCRIPT="$REPO/android/kokoro-poc/scripts/fetch-sherpa-onnx.sh"

# Fixed inputs of the standalone test project (the plugin has no overrides).
STAGE_PIN="$HERE/sherpa-aar.sha256"
STAGE_LIBS="$HERE/libs"
WORK="$HERE/work"
OUT_DIR="${OUT_DIR:-$HERE/out}"
TMP="$(mktemp -d)"

if [ ! -x "$GRADLEW" ]; then
  echo "error: Gradle launcher not found or not executable: $GRADLEW" >&2
  exit 2
fi
if [ ! -f "$PIN" ]; then
  echo "error: pin file not found: $PIN" >&2
  exit 2
fi
if [ ! -f "$FETCH_SCRIPT" ]; then
  echo "error: fetch script not found: $FETCH_SCRIPT" >&2
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

# Restores for cases that deliberately corrupt a tracked file. If the run is
# interrupted, put the originals back before exiting.
RESTORE_GRADLE_PROPERTIES=""
RESTORE_PIN=""
RESTORE_AAR=""
cleanup() {
  if [ -n "$RESTORE_GRADLE_PROPERTIES" ] && [ -f "$RESTORE_GRADLE_PROPERTIES" ]; then
    cp -p "$RESTORE_GRADLE_PROPERTIES" "$GRADLE_PROPERTIES" 2>/dev/null || true
  fi
  if [ -n "$RESTORE_PIN" ] && [ -f "$RESTORE_PIN" ]; then
    cp -p "$RESTORE_PIN" "$PIN" 2>/dev/null || true
  fi
  if [ -n "$RESTORE_AAR" ] && [ -f "$RESTORE_AAR" ]; then
    cp -p "$RESTORE_AAR" "$AAR_SRC" 2>/dev/null || true
  fi
  rm -rf "$STAGE_LIBS" "$STAGE_PIN" "$WORK" "$TMP"
}
trap cleanup EXIT

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

reset_work() {
  rm -rf "$STAGE_LIBS" "$WORK"
  mkdir -p "$STAGE_LIBS" "$WORK"
  rm -f "$STAGE_PIN"
}

stage_aar() {
  cp "$AAR_SRC" "$STAGE_LIBS/$AAR_NAME"
}

stage_pin() {
  cp "$PIN" "$STAGE_PIN"
}

check_result() {
  local name="$1"
  local status="$2"
  local expectation="$3"
  local pattern="$4"
  local log="$5"

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

# run_case <name> <expected: ok|fail> <pattern> <gradle args...>
# A pattern starting with '!' must NOT appear in the output.
run_case() {
  local name="$1"
  local expectation="$2"
  local pattern="$3"
  shift 3

  local log="$OUT_DIR/test-$name.log"
  ( cd "$HERE" && "$GRADLEW" --console=plain "$@" ) >"$log" 2>&1
  check_result "$name" "$?" "$expectation" "$pattern" "$log"
}

# run_cmd_case <name> <expected: ok|fail> <pattern> <dir> <command...>
run_cmd_case() {
  local name="$1"
  local expectation="$2"
  local pattern="$3"
  local dir="$4"
  shift 4

  local log="$OUT_DIR/test-$name.log"
  ( cd "$dir" && "$@" ) >"$log" 2>&1
  check_result "$name" "$?" "$expectation" "$pattern" "$log"
}

# assert_equal <name> <expected> <actual>
assert_equal() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    echo "pass $name"
  else
    FAIL=$((FAIL + 1))
    FAILED_CASES="$FAILED_CASES $name"
    echo "FAIL $name: expected '$expected', got '$actual'"
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
printf '\101' | dd of="$STAGE_LIBS/$AAR_NAME" bs=1 seek=1000 conv=notrunc status=none
run_case "fail-mutated-aar" fail "SHA-256 mismatch" :verifySherpaAar

# 3. A missing AAR fails closed.
reset_work
stage_pin
run_case "fail-missing-aar" fail "missing (expected at" :verifySherpaAar

# 4. A wrong pinned digest fails.
reset_work
stage_aar
printf '%s  %s\n' "$ZERO_SHA" "$AAR_NAME" >"$STAGE_PIN"
run_case "fail-wrong-digest" fail "SHA-256 mismatch" :verifySherpaAar

# 5. A malformed digest in the pin fails before any comparison.
reset_work
stage_aar
printf 'not-a-digest  %s\n' "$AAR_NAME" >"$STAGE_PIN"
run_case "fail-malformed-digest" fail "not a 64-character hex SHA-256 digest" :verifySherpaAar

# 6. An empty pin (comments only) fails closed instead of verifying nothing.
reset_work
stage_aar
printf '# no pins here\n' >"$STAGE_PIN"
run_case "fail-empty-pin" fail "refuses to run without a pin" :verifySherpaAar

# 7. A missing pin fails closed.
reset_work
stage_aar
run_case "fail-missing-pin" fail "pin file is missing" :verifySherpaAar

# 8. A missing AAR directory fails with an actionable message.
reset_work
stage_pin
rm -rf "$STAGE_LIBS"
run_case "fail-missing-aar-dir" fail "AAR directory is missing" :verifySherpaAar

# 9. A pin that points outside the AAR directory is rejected.
reset_work
stage_aar
printf '%s  nested/%s\n' "$AAR_SHA" "$AAR_NAME" >"$STAGE_PIN"
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

# 13. Cross-module dependency: the app release build must depend on the gate.
#     :app:preReleaseBuild is asserted unconditionally (a --dry-run does not
#     consume the Parakeet model); the full :app:assembleRelease graph is
#     asserted when the model assets are present.
reset_work
stage_aar
stage_pin
( cd "$ANDROID_DIR" && "$GRADLEW" --no-daemon --console=plain :app:preReleaseBuild --dry-run ) \
  >"$OUT_DIR/test-app-prerelease-graph.log" 2>&1
if [ $? -eq 0 ] && grep -Fq ":daymark-voice:verifySherpaAar" "$OUT_DIR/test-app-prerelease-graph.log"; then
  PASS=$((PASS + 1)); echo "pass cross-module-app-prerelease"
else
  FAIL=$((FAIL + 1)); FAILED_CASES="$FAILED_CASES cross-module-app-prerelease"
  echo "FAIL cross-module-app-prerelease: :app:preReleaseBuild does not depend on :daymark-voice:verifySherpaAar (log: $OUT_DIR/test-app-prerelease-graph.log)"
fi

( cd "$ANDROID_DIR" && "$GRADLEW" --no-daemon --console=plain :app:assembleRelease --dry-run ) \
  >"$OUT_DIR/test-app-release-graph.log" 2>&1
app_graph_status=$?
if [ $app_graph_status -eq 0 ]; then
  if grep -Fq ":daymark-voice:verifySherpaAar" "$OUT_DIR/test-app-release-graph.log"; then
    PASS=$((PASS + 1)); echo "pass cross-module-app-assembleRelease"
  else
    FAIL=$((FAIL + 1)); FAILED_CASES="$FAILED_CASES cross-module-app-assembleRelease"
    echo "FAIL cross-module-app-assembleRelease: graph has no :daymark-voice:verifySherpaAar (log: $OUT_DIR/test-app-release-graph.log)"
  fi
elif grep -Fq "The Parakeet model is missing" "$OUT_DIR/test-app-release-graph.log"; then
  echo "SKIP cross-module-app-assembleRelease: Parakeet model assets absent (run fetch-parakeet-assets.sh)"
else
  FAIL=$((FAIL + 1)); FAILED_CASES="$FAILED_CASES cross-module-app-assembleRelease"
  echo "FAIL cross-module-app-assembleRelease: dry-run did not configure (log: $OUT_DIR/test-app-release-graph.log)"
fi

( cd "$ANDROID_DIR" && "$GRADLEW" --no-daemon --console=plain :app:assembleDebug --dry-run ) \
  >"$OUT_DIR/test-app-debug-graph.log" 2>&1
if [ $? -eq 0 ] && ! grep -Fq ":daymark-voice:verifySherpaAar" "$OUT_DIR/test-app-debug-graph.log"; then
  PASS=$((PASS + 1)); echo "pass cross-module-app-debug-not-wired"
else
  FAIL=$((FAIL + 1)); FAILED_CASES="$FAILED_CASES cross-module-app-debug-not-wired"
  echo "FAIL cross-module-app-debug-not-wired"
fi

# 14. Legacy Gradle property overrides must not redirect the gate. The
#     attacker pin validates the attacker artifact, so the gate would pass if
#     it honoured the properties. The override keys must be rejected instead.
reset_work
stage_aar
stage_pin
ATTACKER="$WORK/attacker"
mkdir -p "$ATTACKER/libs"
cp "$AAR_SRC" "$ATTACKER/libs/$AAR_NAME"
printf '\101' | dd of="$ATTACKER/libs/$AAR_NAME" bs=1 seek=1000 conv=notrunc status=none
ATTACKER_SHA="$(sha256_of "$ATTACKER/libs/$AAR_NAME")"
printf '%s  %s\n' "$ATTACKER_SHA" "$AAR_NAME" >"$ATTACKER/sherpa-aar.sha256"

run_cmd_case "fail-property-override-pin" fail \
  "Unsupported sherpa-onnx AAR integrity override" "$ANDROID_DIR" \
  "$GRADLEW" --no-daemon --console=plain :daymark-voice:verifySherpaAar \
  -PsherpaAarPinFile="$ATTACKER/sherpa-aar.sha256"

run_cmd_case "fail-property-override-dir" fail \
  "Unsupported sherpa-onnx AAR integrity override" "$ANDROID_DIR" \
  "$GRADLEW" --no-daemon --console=plain :daymark-voice:verifySherpaAar \
  -PsherpaAarDir="$ATTACKER/libs"

run_cmd_case "fail-property-override-both" fail \
  "Unsupported sherpa-onnx AAR integrity override" "$ANDROID_DIR" \
  "$GRADLEW" --no-daemon --console=plain :daymark-voice:verifySherpaAar \
  -PsherpaAarDir="$ATTACKER/libs" \
  -PsherpaAarPinFile="$ATTACKER/sherpa-aar.sha256"

# 15. The same keys in the tracked gradle.properties are project properties
#     too. Gradle really loads them: append them to the real file, run the
#     gate, then restore the file and prove it is byte-identical.
cp -p "$GRADLE_PROPERTIES" "$TMP/gradle.properties.bak"
RESTORE_GRADLE_PROPERTIES="$TMP/gradle.properties.bak"
{
  printf '\n# temporary integrity-override test properties\n'
  printf 'sherpaAarDir=%s\n' "$ATTACKER/libs"
  printf 'sherpaAarPinFile=%s\n' "$ATTACKER/sherpa-aar.sha256"
} >>"$GRADLE_PROPERTIES"
run_cmd_case "fail-gradle-properties-override" fail \
  "Unsupported sherpa-onnx AAR integrity override" "$ANDROID_DIR" \
  "$GRADLEW" --no-daemon --console=plain :daymark-voice:verifySherpaAar
cp -p "$TMP/gradle.properties.bak" "$GRADLE_PROPERTIES"
RESTORE_GRADLE_PROPERTIES=""
assert_equal "pass-gradle-properties-restored" \
  "$(sha256_of "$TMP/gradle.properties.bak")" "$(sha256_of "$GRADLE_PROPERTIES")"

# 16. The provisioning script must read the committed pin, never a duplicate
#     hardcoded digest, and must fail closed on bad pins or artifacts.
run_cmd_case "pass-fetch-pin-source-accepts" ok "ok: using provisioned patched" \
  "$REPO" env -u SHERPA_ONNX_PATCHED_AAR_URL bash "$FETCH_SCRIPT"

cp -p "$AAR_SRC" "$TMP/aar.bak"
RESTORE_AAR="$TMP/aar.bak"
printf '\101' | dd of="$AAR_SRC" bs=1 seek=1000 conv=notrunc status=none
run_cmd_case "fail-fetch-tampered-aar" fail "checksum mismatch for provisioned" \
  "$REPO" env -u SHERPA_ONNX_PATCHED_AAR_URL bash "$FETCH_SCRIPT"
cp -p "$TMP/aar.bak" "$AAR_SRC"
RESTORE_AAR=""
assert_equal "pass-fetch-aar-restored" "$AAR_SHA" "$(sha256_of "$AAR_SRC")"

cp -p "$PIN" "$TMP/pin.bak"
RESTORE_PIN="$TMP/pin.bak"
rm -f "$PIN"
run_cmd_case "fail-fetch-missing-pin" fail "pin file is missing" \
  "$REPO" env -u SHERPA_ONNX_PATCHED_AAR_URL bash "$FETCH_SCRIPT"
cp -p "$TMP/pin.bak" "$PIN"

printf 'not-a-digest  %s\n' "$AAR_NAME" >"$PIN"
run_cmd_case "fail-fetch-malformed-pin" fail "64-character lowercase hex SHA-256 digest" \
  "$REPO" env -u SHERPA_ONNX_PATCHED_AAR_URL bash "$FETCH_SCRIPT"
cp -p "$TMP/pin.bak" "$PIN"

# A valid-format pin with a wrong digest: a hardcoded-digest implementation
# would still accept the correct artifact; a pin-reading implementation fails.
printf '%s  %s\n' "$ZERO_SHA" "$AAR_NAME" >"$PIN"
run_cmd_case "fail-fetch-pin-source-mismatch" fail "checksum mismatch for provisioned" \
  "$REPO" env -u SHERPA_ONNX_PATCHED_AAR_URL bash "$FETCH_SCRIPT"
cp -p "$TMP/pin.bak" "$PIN"
RESTORE_PIN=""
assert_equal "pass-fetch-pin-restored" \
  "$(sha256_of "$TMP/pin.bak")" "$(sha256_of "$PIN")"

# The script must not carry a duplicate expected digest.
if grep -Eq '[0-9a-f]{64}' "$FETCH_SCRIPT"; then
  FAIL=$((FAIL + 1))
  FAILED_CASES="$FAILED_CASES fail-fetch-no-hardcoded-digest"
  echo "FAIL fail-fetch-no-hardcoded-digest: the fetch script contains a hardcoded SHA-256 digest"
else
  PASS=$((PASS + 1))
  echo "pass pass-fetch-no-hardcoded-digest"
fi

assert_equal "pass-final-aar-unchanged" "$AAR_SHA" "$(sha256_of "$AAR_SRC")"
assert_equal "pass-final-pin-unchanged" "$(sha256_of "$TMP/pin.bak")" "$(sha256_of "$PIN")"

"$GRADLEW" --stop >/dev/null 2>&1 || true

echo
echo "== summary: $PASS passed, $FAIL failed =="
if [ "$FAIL" -ne 0 ]; then
  echo "failed cases:$FAILED_CASES"
  exit 1
fi
