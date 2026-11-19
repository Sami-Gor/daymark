#!/usr/bin/env bash
#
# Drives one Ask Daymark capture window on the QA package and verifies it.
#
# Unlike the earlier ad-hoc harness, this never keys off "Stop": the narration
# button is a different control. It checks the Ask button's aria-pressed state,
# requires a matching native session id in logcat, and fails safely when the
# window cannot be confirmed. It never starts a window if one is already live.
#
# Usage:
#   scripts/phone-qa-speech-window.sh --self-check
#   scripts/phone-qa-speech-window.sh --timeout 45
#
# Environment: ANDROID_SERIAL, QA_PACKAGE, QA_CDP_PORT.
set -euo pipefail

SELF_CHECK=0
TIMEOUT_MS=45000
while [ $# -gt 0 ]; do
  case "$1" in
    --self-check) SELF_CHECK=1; shift ;;
    --timeout) TIMEOUT_MS=$(( ${2:?seconds} * 1000 )); shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

PKG=${QA_PACKAGE:-io.github.sami_gor.daymark.v2phoneqa}
SERIAL=${ANDROID_SERIAL:-$(adb devices | awk '/\tdevice$/{print $1; exit}')}
PORT=${QA_CDP_PORT:-9410}
HERE=$(cd "$(dirname "$0")" && pwd)

[ -n "$SERIAL" ] || { echo "no adb device" >&2; exit 2; }
PID=$(adb -s "$SERIAL" shell pidof "$PKG" | tr -d '\r')
[ -n "$PID" ] || { echo "QA package is not running: $PKG" >&2; exit 2; }

adb -s "$SERIAL" forward "tcp:$PORT" "localabstract:webview_devtools_remote_$PID" >/dev/null
trap 'adb -s "$SERIAL" forward --remove "tcp:$PORT" >/dev/null 2>&1 || true' EXIT

MODE=run
[ "$SELF_CHECK" = 1 ] && MODE=self-check
[ "$MODE" = run ] && adb -s "$SERIAL" logcat -c
RESULT=$(node "$HERE/phone-qa-speech-window.mjs" "$PORT" "$MODE" "$TIMEOUT_MS" 2>&1 | tail -1)
echo "$RESULT"
python3 - "$RESULT" <<'PY' || exit 3
import json,sys
data=json.loads(sys.argv[1])
if not data.get('ok'): raise SystemExit(3)
PY
[ "$SELF_CHECK" = 1 ] && exit 0

# Verify the native session: one matching "capture started" and terminal line.
LOG=$(adb -s "$SERIAL" logcat -d 2>/dev/null | grep -E "DaymarkParakeet.*session [0-9]+ (capture started|ended )" | tail -20)
START_IDS=$(printf '%s\n' "$LOG" | sed -nE 's/.*session ([0-9]+) capture started.*/\1/p' | sort -u)
END_LINES=$(printf '%s\n' "$LOG" | grep -E 'ended (result|error)')
END_IDS=$(printf '%s\n' "$END_LINES" | sed -nE 's/.*session ([0-9]+) ended (result|error) ?([a-z-]*).*/\1/p' | sort -u)
COUNT_START=$(printf '%s\n' "$START_IDS" | grep -c . || true)
if [ "$COUNT_START" -ne 1 ]; then
  echo "session verification failed: expected one captured session, saw $COUNT_START" >&2
  exit 3
fi
SESSION_ID=$(printf '%s\n' "$START_IDS" | head -1)
if ! printf '%s\n' "$END_IDS" | grep -qx "$SESSION_ID"; then
  echo "session verification failed: session $SESSION_ID has no terminal event" >&2
  exit 3
fi
if adb -s "$SERIAL" logcat -d 2>/dev/null | grep -E 'Capacitor/Console.*(transcript|sessionId)' | grep -q .; then
  echo "payload logging detected in logcat" >&2
  exit 4
fi
echo "verified session $SESSION_ID with matching terminal event"
