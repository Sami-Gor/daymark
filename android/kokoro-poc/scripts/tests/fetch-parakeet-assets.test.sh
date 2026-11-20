#!/usr/bin/env bash
#
# Local regression tests for android/kokoro-poc/scripts/fetch-parakeet-assets.sh
# (Daymark-controlled immutable mirror primary + optional pinned-HF fallback).
#
# These tests are NOT wired into CI: the byte-exact success case needs the
# preserved 487,170,055-byte Parakeet archive, so they run locally instead of
# on every pull request.
#
# Usage:
#   PARAKEET_TEST_ARCHIVE=/path/to/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2 \
#     android/kokoro-poc/scripts/tests/fetch-parakeet-assets.test.sh
#
# Optional environment:
#   PARAKEET_TEST_WORKDIR    parent directory for temp files
#                            (default: ${TMPDIR:-/tmp}; use the T5 volume locally)
#   PARAKEET_TEST_MODEL_DIR  existing directory with the four pinned model files
#                            (skips extracting them from the archive)
#
# All temporary files stay under the selected work directory. Requires bash,
# curl, python3 and shasum. Exits non-zero if any case fails.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../fetch-parakeet-assets.sh"
MODEL_NAME="sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
DEFAULT_ARCHIVE="/Volumes/DaymarkWorkspace/Daymark/archive/assets/parakeet-preservation/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2"
ARCHIVE="${PARAKEET_TEST_ARCHIVE:-$DEFAULT_ARCHIVE}"
WORKROOT="${PARAKEET_TEST_WORKDIR:-${TMPDIR:-/tmp}}"

ARCHIVE_SHA256="5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf"
ENCODER_SHA256="acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247"
DECODER_SHA256="179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e"
JOINER_SHA256="3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3"
TOKENS_SHA256="d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d"

PINS="encoder.int8.onnx|$ENCODER_SHA256
decoder.int8.onnx|$DECODER_SHA256
joiner.int8.onnx|$JOINER_SHA256
tokens.txt|$TOKENS_SHA256"

HF_REVISION="2bda32ec70b097a55adaa07d9a7173915b43cc78"

[ -f "$SCRIPT" ] || { echo "error: missing script under test: $SCRIPT" >&2; exit 2; }
mkdir -p "$WORKROOT" || { echo "error: cannot create work root: $WORKROOT" >&2; exit 2; }
WORK="$(mktemp -d "$WORKROOT/parakeet-selftest.XXXXXX")" || { echo "error: cannot create temp dir" >&2; exit 2; }
mkdir -p "$WORK/tmp"
export TMPDIR="$WORK/tmp"
export NO_PROXY="127.0.0.1,localhost"
export no_proxy="$NO_PROXY"
HTTP_PID=""
PORT=""

stop_http_server() {
  if [ -n "$HTTP_PID" ]; then
    kill "$HTTP_PID" 2>/dev/null
    wait "$HTTP_PID" 2>/dev/null
    HTTP_PID=""
  fi
}
trap 'stop_http_server' EXIT

PASS=0
FAIL=0
SKIP=0
pass() { PASS=$((PASS + 1)); echo "PASS: $*"; }
fail_case() { FAIL=$((FAIL + 1)); echo "FAIL: $*"; }
skip_case() { SKIP=$((SKIP + 1)); echo "SKIP: $*"; }

expect_success() { # actual label
  if [ "$1" = 0 ]; then pass "$2 (exit 0)"; else fail_case "$2: expected success, got exit $1"; fi
}
expect_failure() { # actual label
  if [ "$1" != 0 ]; then pass "$2 (exit $1)"; else fail_case "$2: expected non-zero exit, got 0"; fi
}
check_log_has() { # log pattern label
  if grep -qF -- "$2" "$1"; then pass "$3"; else fail_case "$3 (log does not contain: $2)"; fi
}
check_log_lacks() { # log pattern label
  if grep -qF -- "$2" "$1"; then fail_case "$3 (log unexpectedly contains: $2)"; else pass "$3"; fi
}
check_script_grep() { # pattern label
  if grep -qF -- "$1" "$SCRIPT"; then pass "$2"; else fail_case "$2 (not found in script: $1)"; fi
}
check_script_lacks() { # pattern label
  if grep -qF -- "$1" "$SCRIPT"; then fail_case "$2 (unexpected in script: $1)"; else pass "$2"; fi
}
check_digest_once() { # digest label
  local count
  count="$(grep -c "$1" "$SCRIPT")"
  if [ "$count" = 1 ]; then pass "$2 (pin present once)"; else fail_case "$2: expected the digest once, found $count"; fi
}

start_http_server() { # directory; sets PORT and HTTP_PID
  local dir="$1" portfile="$WORK/http.port" i=0
  rm -f "$portfile"
  python3 - "$dir" "$portfile" > "$WORK/http.log" 2>&1 <<'PY' &
import functools, http.server, os, sys
root, portfile = sys.argv[1], sys.argv[2]
os.chdir(root)
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
with open(portfile, 'w') as fh:
    fh.write(str(server.server_address[1]))
server.serve_forever()
PY
  HTTP_PID=$!
  while [ ! -s "$portfile" ] && [ "$i" -lt 200 ]; do sleep 0.05; i=$((i + 1)); done
  if [ ! -s "$portfile" ]; then
    echo "error: mock HTTP server did not start" >&2
    cat "$WORK/http.log" >&2 || true
    return 1
  fi
  PORT="$(cat "$portfile")"
}

new_repo() { # id -> prints fake repository root
  local root="$WORK/repo-$1"
  rm -rf "$root"
  mkdir -p "$root/android/kokoro-poc/scripts"
  cp "$SCRIPT" "$root/android/kokoro-poc/scripts/fetch-parakeet-assets.sh"
  echo "$root"
}

set_archive_sha_pin() { # script sha
  python3 - "$1" "$2" <<'PY'
import re, sys
path, sha = sys.argv[1], sys.argv[2]
text = open(path).read()
text, count = re.subn(r'^ARCHIVE_SHA256="[0-9a-f]{64}"$', 'ARCHIVE_SHA256="' + sha + '"', text, count=1, flags=re.M)
if count != 1:
    raise SystemExit("archive SHA-256 pin not found")
open(path, 'w').write(text)
PY
}

set_hf_base_url() { # script url
  python3 - "$1" "$2" <<'PY'
import re, sys
path, url = sys.argv[1], sys.argv[2]
text = open(path).read()
text, count = re.subn(r'^HF_BASE_URL="[^"]*"$', 'HF_BASE_URL="' + url + '"', text, count=1, flags=re.M)
if count != 1:
    raise SystemExit("HF_BASE_URL not found")
open(path, 'w').write(text)
PY
}

# Third-party proxy variables must not intercept the loopback mock server.
run_fetch() { # repo log [VAR=value ...]
  local repo="$1" log="$2"
  shift 2
  env TMPDIR="$WORK/tmp" NO_PROXY="$NO_PROXY" no_proxy="$NO_PROXY" \
    http_proxy= https_proxy= ALL_PROXY= PARAKEET_HF_FALLBACK=0 "$@" \
    bash "$repo/android/kokoro-poc/scripts/fetch-parakeet-assets.sh" > "$log" 2>&1
}

assets_dir() { # repo
  echo "$1/artifacts/weather-app/android/parakeet-assets/src/main/assets/parakeet"
}

assert_installed() { # repo label
  local repo="$1" label="$2" name expected file got ok=1
  while IFS='|' read -r name expected; do
    file="$(assets_dir "$repo")/$name"
    if [ ! -f "$file" ]; then
      echo "  missing: $name"
      ok=0
      continue
    fi
    got="$(shasum -a 256 "$file" | awk '{print $1}')"
    if [ "$got" != "$expected" ]; then
      echo "  wrong hash: $name ($got)"
      ok=0
    else
      echo "  match: $name"
    fi
  done <<< "$PINS"
  [ "$ok" = 1 ] || return 1
  pass "$label: installed files match the four pinned hashes"
  return 0
}

assert_no_assets() { # repo label
  local dir
  dir="$(assets_dir "$1")"
  if [ -d "$dir" ]; then
    echo "  leftover asset directory: $dir"
    fail_case "$2: model assets were installed"
    return 1
  fi
  pass "$2: no model assets installed"
  return 0
}

HAVE_ARCHIVE=0
if [ -f "$ARCHIVE" ]; then
  HAVE_ARCHIVE=1
else
  echo "SKIP: preserved archive not found at $ARCHIVE; byte-level cases will be skipped"
fi

MODEL_DIR=""
ensure_model_dir() {
  if [ -n "$MODEL_DIR" ]; then return 0; fi
  if [ -n "${PARAKEET_TEST_MODEL_DIR:-}" ] && [ -f "${PARAKEET_TEST_MODEL_DIR}/tokens.txt" ]; then
    MODEL_DIR="$PARAKEET_TEST_MODEL_DIR"
    return 0
  fi
  [ "$HAVE_ARCHIVE" = 1 ] || return 1
  rm -rf "$WORK/model-extract"
  mkdir -p "$WORK/model-extract"
  tar -xjf "$ARCHIVE" -C "$WORK/model-extract" \
    "$MODEL_NAME/encoder.int8.onnx" "$MODEL_NAME/decoder.int8.onnx" \
    "$MODEL_NAME/joiner.int8.onnx" "$MODEL_NAME/tokens.txt" || return 1
  MODEL_DIR="$WORK/model-extract/$MODEL_NAME"
  [ -f "$MODEL_DIR/tokens.txt" ]
}

make_synthetic_archive() { # out-file mode(extra|symlink)
  python3 - "$1" "$2" "$MODEL_NAME" <<'PY'
import io, sys, tarfile
out, mode, model = sys.argv[1], sys.argv[2], sys.argv[3]
members = [
    (model + "/", tarfile.DIRTYPE, None),
    (model + "/tokens.txt", tarfile.REGTYPE, b"tokens"),
    (model + "/joiner.int8.onnx", tarfile.REGTYPE, b"joiner"),
    (model + "/decoder.int8.onnx", tarfile.REGTYPE, b"decoder"),
    (model + "/encoder.int8.onnx", tarfile.REGTYPE, b"encoder"),
    (model + "/test_wavs/", tarfile.DIRTYPE, None),
    (model + "/test_wavs/en.wav", tarfile.REGTYPE, b"en"),
    (model + "/test_wavs/fr.wav", tarfile.REGTYPE, b"fr"),
    (model + "/test_wavs/es.wav", tarfile.REGTYPE, b"es"),
    (model + "/test_wavs/de.wav", tarfile.REGTYPE, b"de"),
]
if mode == "symlink":
    members[1] = (model + "/tokens.txt", tarfile.SYMTYPE, "encoder.int8.onnx")
elif mode == "extra":
    members.append((model + "/extra.txt", tarfile.REGTYPE, b"extra"))
else:
    raise SystemExit("unknown mode: " + mode)
with tarfile.open(out, "w:bz2") as archive:
    for name, kind, payload in members:
        info = tarfile.TarInfo(name)
        info.type = kind
        if kind == tarfile.SYMTYPE:
            info.linkname = payload
            archive.addfile(info)
        elif kind == tarfile.DIRTYPE:
            info.mode = 0o755
            archive.addfile(info)
        else:
            info.mode = 0o644
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
PY
}

sha_of() { shasum -a 256 "$1" | awk '{print $1}'; }

echo "# fetch-parakeet-assets.sh local regression tests"
echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "script=$SCRIPT"
echo "script_sha256=$(sha_of "$SCRIPT")"
echo "archive=$ARCHIVE"
echo "work=$WORK"
echo "bash=$BASH_VERSION"
echo "python3=$(python3 --version 2>&1)"
echo "curl=$(curl --version | head -1)"
echo

# --- static checks: pins and retrieval policy are intact -------------------
echo "== static checks =="
if bash -n "$SCRIPT"; then pass "bash -n on the production script"; else fail_case "bash -n on the production script"; fi
check_digest_once "$ARCHIVE_SHA256" "archive SHA-256 pin"
check_digest_once "$ENCODER_SHA256" "encoder SHA-256 pin"
check_digest_once "$DECODER_SHA256" "decoder SHA-256 pin"
check_digest_once "$JOINER_SHA256" "joiner SHA-256 pin"
check_digest_once "$TOKENS_SHA256" "tokens SHA-256 pin"
check_script_grep 'CONTROLLED_ARCHIVE_URL="https://github.com/Sami-Gor/daymark/releases/download/' "default source is the Daymark-controlled release asset"
check_script_grep 'ARCHIVE_URL="${PARAKEET_ARCHIVE_URL:-$CONTROLLED_ARCHIVE_URL}"' "PARAKEET_ARCHIVE_URL override is the only source knob"
check_script_grep 'HF_FALLBACK="${PARAKEET_HF_FALLBACK:-0}"' "HF fallback defaults to disabled"
check_script_grep "HF_REVISION=\"$HF_REVISION\"" "HF fallback uses the pinned fixed revision"
check_script_lacks "1495e91b" "replacement archive (1495e91b) is not adopted"
if grep -qE 'curl[^#]*UPSTREAM_ARCHIVE_URL' "$SCRIPT"; then
  fail_case "the upstream mutable URL is not fetched"
else
  pass "the upstream mutable URL is not fetched"
fi

# --- case: mirror success with the preserved archive -----------------------
echo
echo "== case: controlled-mirror success path (preserved archive) =="
if [ "$HAVE_ARCHIVE" != 1 ]; then
  skip_case "controlled-mirror success path (no preserved archive)"
else
  if start_http_server "$(dirname "$ARCHIVE")"; then
    R="$(new_repo mirror-ok)"
    run_fetch "$R" "$WORK/mirror-ok.log" PARAKEET_ARCHIVE_URL="http://127.0.0.1:$PORT/$MODEL_NAME.tar.bz2"
    rc=$?
    stop_http_server
    expect_success "$rc" "controlled-mirror success"
    assert_installed "$R" "controlled-mirror success"
    check_log_has "$WORK/mirror-ok.log" "archive sha256=$ARCHIVE_SHA256" "controlled-mirror success verified the archive digest"
    check_log_has "$WORK/mirror-ok.log" "closed allow-list (10 members)" "controlled-mirror success enforced the member allow-list"
    check_log_lacks "$WORK/mirror-ok.log" "huggingface.co" "controlled-mirror success never touched the HF fallback"
    check_log_lacks "$WORK/mirror-ok.log" "k2-fsa/sherpa-onnx" "controlled-mirror success never touched the upstream asset"
  else
    fail_case "controlled-mirror success: mock HTTP server did not start"
  fi
fi

# --- case: wrong/unreachable mirror URL fails closed -----------------------
echo
echo "== case: mirror failure fails closed by default =="
mkdir -p "$WORK/serve-empty"
if start_http_server "$WORK/serve-empty"; then
  R="$(new_repo mirror-404)"
  run_fetch "$R" "$WORK/mirror-404.log" PARAKEET_ARCHIVE_URL="http://127.0.0.1:$PORT/does-not-exist.tar.bz2"
  rc=$?
  stop_http_server
  expect_failure "$rc" "wrong mirror URL"
  assert_no_assets "$R" "wrong mirror URL"
  check_log_has "$WORK/mirror-404.log" "archive download failed" "wrong mirror URL reported the download failure"
  check_log_has "$WORK/mirror-404.log" "disabled by default" "wrong mirror URL explained that the fallback is opt-in"
  check_log_lacks "$WORK/mirror-404.log" "huggingface.co" "wrong mirror URL did not fall back silently"

  R="$(new_repo mirror-404-explicit)"
  run_fetch "$R" "$WORK/mirror-404-explicit.log" PARAKEET_ARCHIVE_URL="http://127.0.0.1:$PORT/does-not-exist.tar.bz2" PARAKEET_HF_FALLBACK=0
  rc=$?
  expect_failure "$rc" "explicit PARAKEET_HF_FALLBACK=0"
  assert_no_assets "$R" "explicit PARAKEET_HF_FALLBACK=0"
  check_log_lacks "$WORK/mirror-404-explicit.log" "huggingface.co" "explicit PARAKEET_HF_FALLBACK=0 did not fall back"
else
  fail_case "mirror failure cases: mock HTTP server did not start"
fi

# --- case: archive hash mismatch fails closed ------------------------------
echo
echo "== case: archive hash mismatch fails closed =="
if [ "$HAVE_ARCHIVE" != 1 ]; then
  skip_case "archive hash mismatch (no preserved archive)"
else
  mkdir -p "$WORK/serve-bad"
  dd if="$ARCHIVE" of="$WORK/serve-bad/truncated.tar.bz2" bs=1048576 count=1 2>/dev/null
  if start_http_server "$WORK/serve-bad"; then
    R="$(new_repo hash-bad)"
    run_fetch "$R" "$WORK/hash-bad.log" PARAKEET_ARCHIVE_URL="http://127.0.0.1:$PORT/truncated.tar.bz2"
    rc=$?
    stop_http_server
    expect_failure "$rc" "archive hash mismatch"
    assert_no_assets "$R" "archive hash mismatch"
    check_log_has "$WORK/hash-bad.log" "SHA-256 mismatch for archive" "archive hash mismatch reported the digest mismatch"
    check_log_lacks "$WORK/hash-bad.log" "huggingface.co" "archive hash mismatch did not fall back silently"
  else
    fail_case "archive hash mismatch: mock HTTP server did not start"
  fi
fi

# --- case: closed member allow-list rejects extra members ------------------
echo
echo "== case: closed member allow-list rejects an extra member =="
mkdir -p "$WORK/serve-evil"
make_synthetic_archive "$WORK/serve-evil/extra.tar.bz2" extra
extra_sha="$(sha_of "$WORK/serve-evil/extra.tar.bz2")"
if start_http_server "$WORK/serve-evil"; then
  R="$(new_repo allowlist-extra)"
  set_archive_sha_pin "$R/android/kokoro-poc/scripts/fetch-parakeet-assets.sh" "$extra_sha"
  run_fetch "$R" "$WORK/allowlist-extra.log" PARAKEET_ARCHIVE_URL="http://127.0.0.1:$PORT/extra.tar.bz2"
  rc=$?
  stop_http_server
  expect_failure "$rc" "extra archive member"
  assert_no_assets "$R" "extra archive member"
  check_log_has "$WORK/allowlist-extra.log" "closed allow-list has exactly 10" "extra archive member was rejected by the allow-list"
else
  fail_case "extra archive member: mock HTTP server did not start"
fi

# --- case: closed member allow-list rejects a symlink member --------------
echo
echo "== case: closed member allow-list rejects a symlink member =="
make_synthetic_archive "$WORK/serve-evil/symlink.tar.bz2" symlink
symlink_sha="$(sha_of "$WORK/serve-evil/symlink.tar.bz2")"
if start_http_server "$WORK/serve-evil"; then
  R="$(new_repo allowlist-symlink)"
  set_archive_sha_pin "$R/android/kokoro-poc/scripts/fetch-parakeet-assets.sh" "$symlink_sha"
  run_fetch "$R" "$WORK/allowlist-symlink.log" PARAKEET_ARCHIVE_URL="http://127.0.0.1:$PORT/symlink.tar.bz2"
  rc=$?
  stop_http_server
  expect_failure "$rc" "symlink archive member"
  assert_no_assets "$R" "symlink archive member"
  check_log_has "$WORK/allowlist-symlink.log" "symlink or hardlink members" "symlink archive member was rejected"
else
  fail_case "symlink archive member: mock HTTP server did not start"
fi

# --- case: explicit HF fallback opt-in installs the pinned files ----------
echo
echo "== case: explicit HF fallback opt-in =="
if ensure_model_dir; then
  mkdir -p "$WORK/hf-good"
  for name in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
    ln -sf "$MODEL_DIR/$name" "$WORK/hf-good/$name"
  done
  if start_http_server "$WORK/hf-good"; then
    R="$(new_repo hf-ok)"
    set_hf_base_url "$R/android/kokoro-poc/scripts/fetch-parakeet-assets.sh" "http://127.0.0.1:$PORT"
    run_fetch "$R" "$WORK/hf-ok.log" PARAKEET_HF_FALLBACK=1 PARAKEET_ARCHIVE_URL="http://127.0.0.1:$PORT/missing.tar.bz2"
    rc=$?
    stop_http_server
    expect_success "$rc" "HF fallback opt-in"
    assert_installed "$R" "HF fallback opt-in"
    check_log_has "$WORK/hf-ok.log" "warning: pinned HF revision: $HF_REVISION" "HF fallback logged the pinned revision"
    check_log_has "$WORK/hf-ok.log" "installed from pinned HF fallback" "HF fallback installed the verified files"
    check_log_has "$WORK/hf-ok.log" "the controlled mirror archive could not be fetched" "HF fallback only ran after the mirror failed"
  else
    fail_case "HF fallback opt-in: mock HTTP server did not start"
  fi
else
  skip_case "HF fallback opt-in (no preserved archive and no PARAKEET_TEST_MODEL_DIR)"
fi

# --- case: HF fallback hash mismatch fails closed, installs nothing -------
echo
echo "== case: HF fallback hash mismatch fails closed =="
if ensure_model_dir; then
  mkdir -p "$WORK/hf-bad"
  printf 'corrupted fallback fixture' > "$WORK/hf-bad/encoder.int8.onnx"
  for name in decoder.int8.onnx joiner.int8.onnx tokens.txt; do
    ln -sf "$MODEL_DIR/$name" "$WORK/hf-bad/$name"
  done
  if start_http_server "$WORK/hf-bad"; then
    R="$(new_repo hf-bad)"
    set_hf_base_url "$R/android/kokoro-poc/scripts/fetch-parakeet-assets.sh" "http://127.0.0.1:$PORT"
    run_fetch "$R" "$WORK/hf-bad.log" PARAKEET_HF_FALLBACK=1 PARAKEET_ARCHIVE_URL="http://127.0.0.1:$PORT/missing.tar.bz2"
    rc=$?
    stop_http_server
    expect_failure "$rc" "HF fallback hash mismatch"
    assert_no_assets "$R" "HF fallback hash mismatch"
    check_log_has "$WORK/hf-bad.log" "did not match its committed pin" "HF fallback hash mismatch reported the pin mismatch"
  else
    fail_case "HF fallback hash mismatch: mock HTTP server did not start"
  fi
else
  skip_case "HF fallback hash mismatch (no preserved archive and no PARAKEET_TEST_MODEL_DIR)"
fi

# --- case: invalid fallback switch value fails closed ---------------------
echo
echo "== case: invalid PARAKEET_HF_FALLBACK value =="
R="$(new_repo hf-invalid)"
run_fetch "$R" "$WORK/hf-invalid.log" PARAKEET_HF_FALLBACK=yes PARAKEET_ARCHIVE_URL="http://127.0.0.1:1/nope.tar.bz2"
rc=$?
expect_failure "$rc" "invalid PARAKEET_HF_FALLBACK"
assert_no_assets "$R" "invalid PARAKEET_HF_FALLBACK"
check_log_has "$WORK/hf-invalid.log" "PARAKEET_HF_FALLBACK must be 1 (enable) or 0/unset (disable)" "invalid PARAKEET_HF_FALLBACK was rejected"

echo
echo "== summary =="
echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
if [ "$FAIL" -ne 0 ]; then
  echo "temp dir kept for debugging: $WORK"
  exit 1
fi
stop_http_server
rm -rf "$WORK"
echo "temp dir removed: $WORK"
exit 0
