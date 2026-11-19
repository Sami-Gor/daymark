#!/usr/bin/env bash
# Shared harness for the Round 7 Plan A/B remediation regression suites.
set -uo pipefail
TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
KIT=$(cd "$TEST_DIR/.." && pwd -P)
. "$KIT/parakeet-pins.env"
. "$KIT/plans-lib.sh"
TEST_PASS=0
TEST_FAIL=0
t_pass() { TEST_PASS=$((TEST_PASS + 1)); echo "T-PASS  $*"; }
t_fail() { TEST_FAIL=$((TEST_FAIL + 1)); echo "T-FAIL  $*"; }
t_info() { echo "T-INFO  $*"; }
TEST_SUITE=${TEST_SUITE:-misc}
ROOT=${PLANS_TEST_ROOT:-$T5/cache/round7/plans/test-run}
SCRATCH="$ROOT/$TEST_SUITE"
LOGS="$SCRATCH/logs"
suite_setup() {
  rm -rf "$SCRATCH"
  mkdir -p "$SCRATCH" "$LOGS"
}

require_fixtures() {
  local ok=1
  [ -f "$OLD_ARCHIVE" ] || { t_fail "fixture missing: $OLD_ARCHIVE"; ok=0; }
  [ -f "$NEW_ARCHIVE" ] || { t_fail "fixture missing: $NEW_ARCHIVE"; ok=0; }
  [ -d "$OLD_EXTRACTED" ] || { t_fail "fixture missing: $OLD_EXTRACTED"; ok=0; }
  [ -d "$NEW_EXTRACTED" ] || { t_fail "fixture missing: $NEW_EXTRACTED"; ok=0; }
  [ "$ok" = 1 ] || { echo "SUITE RESULT: pass=$TEST_PASS fail=$TEST_FAIL"; exit 1; }
}
run_expect_ok() {
  local desc=$1 lf=$2; shift 2
  if "$@" >"$lf" 2>&1; then t_pass "$desc"; else
    t_fail "$desc (exit $?; see $lf)"
    tail -5 "$lf" | sed 's/^/    /'
  fi
}
run_expect_fail() {
  local desc=$1 lf=$2; shift 2
  if "$@" >"$lf" 2>&1; then
    t_fail "$desc (unexpectedly succeeded; see $lf)"
  else
    t_pass "$desc"
  fi
}
assert_eq() { if [ "$2" = "$3" ]; then t_pass "$1"; else t_fail "$1 (expected '$2', got '$3')"; fi }
assert_file() { if [ -f "$2" ]; then t_pass "$1"; else t_fail "$1 (missing $2)"; fi }
assert_absent() { if [ ! -e "$2" ]; then t_pass "$1"; else t_fail "$1 (unexpectedly present: $2)"; fi }
assert_grep() { if grep -q -E "$2" "$3" 2>/dev/null; then t_pass "$1"; else t_fail "$1 (pattern '$2' not in $3)"; fi }
log_counts() { awk '/checks passed:/ {print $3, $5; found=1} END {if (!found) print "0 0"}' "$1"; }
assert_counts() {
  local got p f
  got=$(log_counts "$2"); p=${got% *}; f=${got#* }
  if [ "$p" = "$3" ] && [ "$f" = "$4" ]; then t_pass "$1 ($p passed / $f failed)"; else t_fail "$1 (expected $3/$4, log says $p/$f)"; fi
}
hash_set() {
  local dir=$1 out=$2 f
  : > "$out"
  ( cd "$dir" 2>/dev/null || { for f in $MODEL_FILES; do echo "MISSING  $f"; done > "$out"; exit 0; }
    for f in $MODEL_FILES; do
      if [ -f "$f" ]; then shasum -a 256 "$f"; else echo "MISSING  $f"; fi
    done > "$out" )
}
hash_pin_files() {
  local repo=$1 out=$2 f
  : > "$out"
  ( cd "$repo" || exit 1; for f in $PIN_FILES; do shasum -a 256 "$f" >> "$out"; done )
}
assert_same_bytes() {
  if cmp -s "$2" "$3"; then t_pass "$1"; else t_fail "$1 (byte sets differ)"; diff "$2" "$3" | sed -n '1,10p' | sed 's/^/    /'; fi
}
assert_pins_old() {
  local st; st=$(pins_state "$2")
  if [ "$st" = old ]; then t_pass "$1 (pins OLD)"; else t_fail "$1 (pins '$st')"; fi
}

make_pin_repo() {
  local dst=$1 f src
  src=${PIN_SOURCE_REPO:-$REPO_ROOT}
  mkdir -p "$dst"
  for f in $PIN_FILES; do
    mkdir -p "$dst/$(dirname "$f")"
    cp -p "$src/$f" "$dst/$f"
  done
  git -C "$dst" init -q
  git -C "$dst" add -A
  git -C "$dst" -c user.email=plan@test -c user.name=plan commit -q -m "scratch old-pin baseline"
}
clone_model_dir() {
  local src=$1 dst=$2 f
  mkdir -p "$dst"
  for f in $MODEL_FILES; do
    copy_preserving "$src/$f" "$dst/$f" || { t_fail "clone failed: $src/$f"; return 1; }
  done
}
new_staging() { clone_model_dir "$NEW_EXTRACTED" "$1"; }
old_staging() { clone_model_dir "$OLD_EXTRACTED" "$1"; }
make_fake_kit() {
  local dst=$1
  rm -rf "$dst"
  cp -R "$KIT" "$dst"
  chmod +x "$dst"/*.sh
}
make_mv_shim() {
  local dir=$1
  mkdir -p "$dir"
  cat > "$dir/mv" <<'SHIM'
#!/bin/sh
countfile=${MV_SHIM_COUNTER:-/tmp/mv-shim-count}
c=0
[ -f "$countfile" ] && c=$(cat "$countfile")
c=$((c + 1))
echo "$c" > "$countfile"
if [ "$c" -eq "${MV_SHIM_FAIL_AT:-2}" ]; then
  echo "mv: injected failure (test shim, invocation $c)" >&2
  exit 1
fi
exec /bin/mv "$@"
SHIM
  chmod +x "$dir/mv"
}
suite_finish() {
  echo
  echo "SUITE RESULT ($TEST_SUITE): pass=$TEST_PASS fail=$TEST_FAIL"
  [ "$TEST_FAIL" = 0 ]
}
