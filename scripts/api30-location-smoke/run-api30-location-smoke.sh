#!/usr/bin/env bash
#
# API 30 (Android 11) runtime verification of the coarse-only geolocation fix.
#
# End to end, with a real Android 11 (API 30) google_apis x86_64 emulator and
# the real debug app (no instrumentation APK, no test-only app code):
#
#   S1  static: the x86_64 test APK has no arm64 code and no libkokoro_jni.so
#   S2  static: the manifest requests ACCESS_COARSE_LOCATION and never
#       ACCESS_FINE_LOCATION (aapt + install + dumpsys, three independent
#       views of the same fact)
#   1   pm grant COARSE  -> navigator.geolocation.getCurrentPosition in the
#       app WebView SUCCEEDS and returns the injected emulator fix
#       (exercises the patched BridgeWebChromeClient: with a coarse-only
#       manifest the both-permissions branch is never taken, so the patched
#       coarse-only rescue is exactly the branch that decides "allow")
#   2   pm revoke COARSE -> getCurrentPosition fails with PERMISSION_DENIED
#       (error code 1, the failure mode the fix removes when coarse is
#       granted)
#   3   grant-after-denial recovery -> succeeds again
#   4   svc location disable -> fails; svc location enable + fresh geo fix ->
#       succeeds again (location-service toggle recovery)
#   5   pm grant ACCESS_FINE_LOCATION must FAIL (the manifest is coarse-only;
#       pm refuses to grant a permission the app does not request)
#   6   DaymarkVoice degrades to unavailable instead of crashing: the app
#       process stays alive and the plugin reports available=false because
#       this build ships without libkokoro_jni.so (arm64-only)
#
# Usage:
#   ANDROID_HOME=<sdk> ./run-api30-location-smoke.sh --apk <path/to/app-debug.apk>
#
# Environment:
#   ANDROID_HOME (or ANDROID_SDK_ROOT)  required; needs platform-tools, a
#                                      build-tools dir (for aapt), emulator,
#                                      cmdline-tools (sdkmanager, avdmanager)
#   NODE                              optional; defaults to `node`, must be
#                                      >= 22 for the CDP driver
#
# Options (defaults in parentheses):
#   --apk PATH               path to the debug APK built with
#                            -PdaymarkTestAbi=x86_64
#                            -PdaymarkApplicationId=io.github.sami_gor.daymark.v2validate
#   --package (io.github.sami_gor.daymark.v2validate)
#   --api-level (30)  --image-flavor (google_apis)  --image-abi (x86_64)
#   --avd-name (daymark-api30-smoke)
#   --keep-emulator         do not kill the emulator at the end (debugging)
#   --no-emulator           run the static checks only (no device needed)
#
# The emulator needs hardware acceleration: /dev/kvm on Linux (add yourself to
# the kvm group first) or Hypervisor.framework on macOS. The script warns but
# continues without it.
set -euo pipefail

APK=""
PACKAGE="io.github.sami_gor.daymark.v2validate"
API_LEVEL="30"
IMAGE_FLAVOR="google_apis"
IMAGE_ABI="x86_64"
AVD_NAME="daymark-api30-smoke"
KEEP_EMULATOR=0
STATIC_ONLY=0
LAT="37.4226"
LON="-122.0840"
TOLERANCE="0.02"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --apk) APK="$2"; shift 2 ;;
    --package) PACKAGE="$2"; shift 2 ;;
    --api-level) API_LEVEL="$2"; shift 2 ;;
    --image-flavor) IMAGE_FLAVOR="$2"; shift 2 ;;
    --image-abi) IMAGE_ABI="$2"; shift 2 ;;
    --avd-name) AVD_NAME="$2"; shift 2 ;;
    --keep-emulator) KEEP_EMULATOR=1; shift ;;
    --no-emulator) STATIC_ONLY=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$APK" ]; then
  echo "error: --apk is required (see --help)" >&2
  exit 2
fi
if [ ! -f "$APK" ]; then
  echo "error: APK not found: $APK" >&2
  exit 2
fi

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$ANDROID_HOME" ]; then
  echo "error: set ANDROID_HOME (or ANDROID_SDK_ROOT) to the Android SDK" >&2
  exit 2
fi
export ANDROID_HOME

ADB="$ANDROID_HOME/platform-tools/adb"
EMU="$ANDROID_HOME/emulator"
SDKMANAGER="$(find "$ANDROID_HOME/cmdline-tools" -name sdkmanager -type f 2>/dev/null | sort | head -1)"
AVDMANAGER="$(find "$ANDROID_HOME/cmdline-tools" -name avdmanager -type f 2>/dev/null | sort | head -1)"
AAPT="$(find "$ANDROID_HOME/build-tools" -name aapt -type f 2>/dev/null | sort -V | tail -1)"
NODE_BIN="${NODE:-node}"

for tool in "$ADB" "$EMU" "$SDKMANAGER" "$AVDMANAGER" "$AAPT"; do
  if [ -z "$tool" ] || [ ! -x "$tool" ]; then
    echo "error: required SDK tool missing: $tool" >&2
    exit 2
  fi
done

PASS=0
FAIL=0
PHASES=()

record() { # record <name> <status:0|1> <detail>
  if [ "$2" = 0 ]; then
    PASS=$((PASS + 1))
    PHASES+=("PASS  $1")
    echo "  -> PASS: $1"
  else
    FAIL=$((FAIL + 1))
    PHASES+=("FAIL  $1")
    echo "  -> FAIL: $1"
  fi
  [ -n "${3:-}" ] && echo "     $3"
}

IMAGE="system-images;android-${API_LEVEL};${IMAGE_FLAVOR};${IMAGE_ABI}"
IMAGE_DIR="$ANDROID_HOME/system-images/android-${API_LEVEL}/${IMAGE_FLAVOR}/${IMAGE_ABI}"

echo "== Daymark API ${API_LEVEL} location smoke =="
echo "   apk:      $APK"
echo "   package:  $PACKAGE"
echo "   image:    $IMAGE"
echo

# ---------------------------------------------------------------------------
echo "-- S1: static APK shape (x86_64 test build, no kokoro native library) --"
LIB_LIST="$(unzip -l "$APK" 'lib/*' | awk '{print $4}' | grep '^lib/' || true)"
BAD_ABIS="$(echo "$LIB_LIST" | grep -v "^lib/${IMAGE_ABI}/" || true)"
if [ -z "$LIB_LIST" ]; then
  record "S1 native libs packaged for ${IMAGE_ABI}" 1 "no lib/* entries at all in the APK"
else
  record "S1 every native lib is ${IMAGE_ABI}" "$( [ -z "$BAD_ABIS" ] && echo 0 || echo 1 )" "off-ABI entries: $(echo "$BAD_ABIS" | tr '\n' ' ')"
fi
if echo "$LIB_LIST" | grep -q "libkokoro_jni.so"; then
  record "S1 libkokoro_jni.so absent" 1 "found in the test APK; the smoke build must not carry it"
else
  record "S1 libkokoro_jni.so absent" 0
fi

echo "-- S2: manifest is coarse-only (aapt view) --"
PERMS="$("$AAPT" dump permissions "$APK" 2>/dev/null || true)"
if echo "$PERMS" | grep -q "android.permission.ACCESS_COARSE_LOCATION"; then
  record "S2 aapt: ACCESS_COARSE_LOCATION requested" 0
else
  record "S2 aapt: ACCESS_COARSE_LOCATION requested" 1 "$PERMS"
fi
if echo "$PERMS" | grep -q "android.permission.ACCESS_FINE_LOCATION"; then
  record "S2 aapt: ACCESS_FINE_LOCATION never requested" 1 "$PERMS"
else
  record "S2 aapt: ACCESS_FINE_LOCATION never requested" 0
fi
BADGED_PACKAGE="$("$AAPT" dump badging "$APK" 2>/dev/null | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -1)"
record "S2 aapt: package is ${PACKAGE}" "$( [ "$BADGED_PACKAGE" = "$PACKAGE" ] && echo 0 || echo 1 )" "aapt reports: ${BADGED_PACKAGE:-<none>}"

if [ "$STATIC_ONLY" = 1 ]; then
  echo
  echo "== static checks done (PASS=$PASS FAIL=$FAIL) =="
  [ "$FAIL" = 0 ]
  exit $?
fi

# ---------------------------------------------------------------------------
echo "-- emulator preflight --"
if [ ! -e /dev/kvm ] && [ "$(uname -s)" = Linux ]; then
  echo "   WARNING: /dev/kvm is missing; the emulator will run without hardware" >&2
  echo "            acceleration and may be too slow or fail to boot." >&2
fi
if [ ! -d "$IMAGE_DIR" ]; then
  echo "   system image not installed; downloading $IMAGE ..."
  yes | "$SDKMANAGER" --install "$IMAGE" "platforms;android-${API_LEVEL}" >/dev/null
fi

if ! "$ADB" devices | grep -q "emulator-"; then
  if "$ADB" emulator list avd 2>/dev/null | grep -q "^$AVD_NAME$"; then :; fi
  if ! ls "$HOME/.android/avd/$AVD_NAME.avd" >/dev/null 2>&1 \
     && ! ls "$ANDROID_AVD_HOME/$AVD_NAME.avd" >/dev/null 2>&1; then
    echo "   creating AVD $AVD_NAME ..."
    echo no | "$AVDMANAGER" create avd --force --name "$AVD_NAME" --package "$IMAGE" --device pixel_5 2>/dev/null \
      || echo no | "$AVDMANAGER" create avd --force --name "$AVD_NAME" --package "$IMAGE"
  fi
  echo "   booting the emulator (headless) ..."
  "$EMU" -avd "$AVD_NAME" \
    -no-window -no-audio -no-boot-anim -no-snapshot -accel on \
    -gpu swiftshader_indirect -camera-back none -camera-front none \
    > /tmp/daymark-api30-emulator.log 2>&1 &
  EMULATOR_PID=$!
  trap 'if [ "$KEEP_EMULATOR" != 1 ] && [ -n "${EMULATOR_PID:-}" ]; then "$ADB" emu kill >/dev/null 2>&1 || kill "$EMULATOR_PID" 2>/dev/null || true; fi' EXIT

  BOOT_DEADLINE=$((SECONDS + 360))
  until "$ADB" shell getprop sys.boot_completed 2>/dev/null | grep -q '^1'; do
    if [ $SECONDS -ge $BOOT_DEADLINE ]; then
      echo "error: emulator did not boot in 360s; log tail:" >&2
      tail -40 /tmp/daymark-api30-emulator.log >&2 || true
      exit 2
    fi
    sleep 5
  done
  # PackageManager can lag boot_completed on a cold image; wait for it.
  PM_DEADLINE=$((SECONDS + 120))
  until "$ADB" shell pm path android >/dev/null 2>&1; do
    if [ $SECONDS -ge $PM_DEADLINE ]; then
      echo "error: package manager never became ready" >&2
      exit 2
    fi
    sleep 5
  done
fi
echo "   emulator ready: $("$ADB" devices | grep emulator | awk '{print $1}')"

"$ADB" wait-for-device

# A deterministic fix the GPS provider reports (note: geo fix is
# LONGITUDE LATITUDE).
set_fix() {
  "$ADB" emu geo fix "$LON" "$LAT" >/dev/null 2>&1 || true
}
set_fix

launch_app() {
  "$ADB" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
  # monkey launches the LAUNCHER activity without naming it (works for any
  # applicationId override) and needs no instrumentation.
  "$ADB" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null
}

probe() { # probe <mode> <expect> [extra args...]
  local mode="$1"; shift
  local expect="$1"; shift
  "$NODE_BIN" "$SCRIPT_DIR/cdp-probe.mjs" "$mode" --package "$PACKAGE" --expect "$expect" \
    --timeout-ms 240000 "$@"
}

# ---------------------------------------------------------------------------
echo "-- install --"
if "$ADB" install -r "$APK" >/dev/null; then
  record "install debug APK" 0
else
  record "install debug APK" 1 "adb install -r failed"
  echo
  echo "== summary (PASS=$PASS FAIL=$FAIL) =="
  printf '  %s\n' "${PHASES[@]}"
  exit 1
fi

# Device-side manifest view (after install, from the package manager).
DUMPSYS_PERMS="$("$ADB" shell dumpsys package "$PACKAGE" | sed -n '/requested permissions:/,/install permissions:/p' || true)"
if echo "$DUMPSYS_PERMS" | grep -q "android.permission.ACCESS_COARSE_LOCATION"; then
  record "S2 dumpsys: COARSE requested on device" 0
else
  record "S2 dumpsys: COARSE requested on device" 1
fi
if echo "$DUMPSYS_PERMS" | grep -q "android.permission.ACCESS_FINE_LOCATION"; then
  record "S2 dumpsys: FINE never requested on device" 1
else
  record "S2 dumpsys: FINE never requested on device" 0
fi

# ---------------------------------------------------------------------------
echo "-- 1: coarse granted -> geolocation succeeds --"
if "$ADB" shell pm grant "$PACKAGE" android.permission.ACCESS_COARSE_LOCATION 2>/tmp/pm-grant-coarse.err; then
  record "pm grant COARSE succeeds" 0
else
  record "pm grant COARSE succeeds" 1 "$(cat /tmp/pm-grant-coarse.err)"
fi
launch_app
if probe geolocation success --expect-lat "$LAT" --expect-lon "$LON" --tolerance-deg "$TOLERANCE"; then
  record "1 geolocation succeeds with the injected fix" 0
else
  record "1 geolocation succeeds with the injected fix" 1
fi

# ---------------------------------------------------------------------------
echo "-- 2: coarse revoked -> geolocation denied (code 1) --"
"$ADB" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
"$ADB" shell pm revoke "$PACKAGE" android.permission.ACCESS_COARSE_LOCATION >/dev/null
launch_app
if probe geolocation denied; then
  record "2 revoked -> PERMISSION_DENIED (code 1)" 0
else
  record "2 revoked -> PERMISSION_DENIED (code 1)" 1
fi

# ---------------------------------------------------------------------------
echo "-- 3: grant-after-denial recovery -> succeeds --"
"$ADB" shell pm grant "$PACKAGE" android.permission.ACCESS_COARSE_LOCATION >/dev/null
launch_app
if probe geolocation success --expect-lat "$LAT" --expect-lon "$LON" --tolerance-deg "$TOLERANCE"; then
  record "3 re-grant recovery -> geolocation succeeds" 0
else
  record "3 re-grant recovery -> geolocation succeeds" 1
fi

# ---------------------------------------------------------------------------
echo "-- 4: location services off -> fails; on -> recovers --"
"$ADB" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
"$ADB" shell svc location disable >/dev/null
launch_app
if probe geolocation any-error; then
  record "4 services off -> geolocation fails" 0
else
  record "4 services off -> geolocation fails" 1
fi
"$ADB" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
"$ADB" shell svc location enable >/dev/null
set_fix
launch_app
if probe geolocation success --expect-lat "$LAT" --expect-lon "$LON" --tolerance-deg "$TOLERANCE"; then
  record "4 services on -> geolocation recovers" 0
else
  record "4 services on -> geolocation recovers" 1
fi

# ---------------------------------------------------------------------------
echo "-- 5: pm grant FINE must fail (coarse-only manifest) --"
if "$ADB" shell pm grant "$PACKAGE" android.permission.ACCESS_FINE_LOCATION >/tmp/pm-grant-fine.log 2>&1; then
  record "5 pm grant FINE refused" 1 "pm grant succeeded but the app never declares FINE: $(cat /tmp/pm-grant-fine.log)"
else
  record "5 pm grant FINE refused" 0 "$(head -c 200 /tmp/pm-grant-fine.log | tr '\n' ' ')"
fi

# ---------------------------------------------------------------------------
echo "-- 6: DaymarkVoice degrades without libkokoro_jni --"
launch_app
if probe voice-availability unavailable; then
  record "6 app alive; DaymarkVoice reports unavailable" 0
else
  record "6 app alive; DaymarkVoice reports unavailable" 1
fi

# ---------------------------------------------------------------------------
echo
echo "== summary (PASS=$PASS FAIL=$FAIL) =="
printf '  %s\n' "${PHASES[@]}"

if [ "$KEEP_EMULATOR" != 1 ]; then
  "$ADB" emu kill >/dev/null 2>&1 || true
fi

[ "$FAIL" = 0 ]
