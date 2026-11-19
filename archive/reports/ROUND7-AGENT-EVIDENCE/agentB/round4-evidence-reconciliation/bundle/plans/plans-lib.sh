#!/usr/bin/env bash
# Shared helpers for Round 4 Parakeet plan scripts. Read-only utilities only.
# Sourced after parakeet-pins.env. No side effects at source time.

PASS_COUNT=0
FAIL_COUNT=0

die()  { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARN:  $*" >&2; }
log()  { echo "[*] $*"; }
pass() { PASS_COUNT=$((PASS_COUNT + 1)); echo "PASS  $*"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); echo "FAIL  $*"; }

check_eq() { # name expected actual
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected $2, got $3)"; fi
}

check_ne() { # name value forbidden
  if [ "$2" != "$3" ]; then pass "$1"; else fail "$1 (forbidden value present: $3)"; fi
}

check_file() { # name path
  if [ -f "$2" ]; then pass "$1"; else fail "$1 (missing: $2)"; fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

file_size() { # prints decimal byte size
  wc -c < "$1" | tr -d ' '
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

count_literal() { # file literal -> occurrence count
  local file=$1 lit=$2
  if [ ! -f "$file" ]; then echo 0; return 0; fi
  grep -F -o -- "$lit" "$file" 2>/dev/null | wc -l | tr -d ' '
}

count_in_pins() { # repo literal -> total occurrences across the six pin files
  local repo=$1 lit=$2 total=0 f n
  for f in $PIN_FILES; do
    n=$(count_literal "$repo/$f" "$lit")
    total=$((total + n))
  done
  echo "$total"
}

pins_state() { # repo -> new | old | mixed | missing
  local repo=$1 f
  for f in $PIN_FILES; do
    if [ ! -f "$repo/$f" ]; then echo missing; return 0; fi
  done
  local na ne nd nj nv nt oa oe od oj ov ot nse nsd ose osd
  na=$(count_in_pins "$repo" "$NEW_ARCHIVE_SHA256")
  ne=$(count_in_pins "$repo" "$NEW_ENCODER_SHA256")
  nd=$(count_in_pins "$repo" "$NEW_DECODER_SHA256")
  nj=$(count_in_pins "$repo" "$NEW_JOINER_SHA256")
  nv=$(count_in_pins "$repo" "$NEW_MODEL_VERSION")
  nt=$(count_in_pins "$repo" "$NEW_TOKENS_SHA256")
  oa=$(count_in_pins "$repo" "$OLD_ARCHIVE_SHA256")
  oe=$(count_in_pins "$repo" "$OLD_ENCODER_SHA256")
  od=$(count_in_pins "$repo" "$OLD_DECODER_SHA256")
  oj=$(count_in_pins "$repo" "$OLD_JOINER_SHA256")
  ov=$(count_in_pins "$repo" "$OLD_MODEL_VERSION")
  ot=$(count_in_pins "$repo" "$OLD_TOKENS_SHA256")
  nse=$(count_in_pins "$repo" "${NEW_ENCODER_SIZE}L")
  nsd=$(count_in_pins "$repo" "${NEW_DECODER_SIZE}L")
  ose=$(count_in_pins "$repo" "${OLD_ENCODER_SIZE}L")
  osd=$(count_in_pins "$repo" "${OLD_DECODER_SIZE}L")
  local new_ok=0 old_ok=0
  if [ "$na" = "$PIN_COUNT_ARCHIVE" ] && [ "$ne" = "$PIN_COUNT_MEMBER" ] && [ "$nd" = "$PIN_COUNT_MEMBER" ] &&
     [ "$nj" = "$PIN_COUNT_MEMBER" ] && [ "$nt" = "$PIN_COUNT_MEMBER" ] && [ "$nv" = "$PIN_COUNT_MODEL_VERSION" ] &&
     [ "$nse" = "$PIN_COUNT_SIZE" ] && [ "$nsd" = "$PIN_COUNT_SIZE" ] &&
     [ "$oa" = 0 ] && [ "$oe" = 0 ] && [ "$od" = 0 ] && [ "$oj" = 0 ] && [ "$ov" = 0 ]; then new_ok=1; fi
  if [ "$na" = 0 ] && [ "$ne" = 0 ] && [ "$nd" = 0 ] && [ "$nj" = 0 ] && [ "$nv" = 0 ] &&
     [ "$oa" = "$PIN_COUNT_ARCHIVE" ] && [ "$oe" = "$PIN_COUNT_MEMBER" ] && [ "$od" = "$PIN_COUNT_MEMBER" ] &&
     [ "$oj" = "$PIN_COUNT_MEMBER" ] && [ "$ot" = "$PIN_COUNT_MEMBER" ] && [ "$ov" = "$PIN_COUNT_MODEL_VERSION" ] &&
     [ "$ose" = "$PIN_COUNT_SIZE" ] && [ "$osd" = "$PIN_COUNT_SIZE" ] &&
     [ "$nse" = 0 ] && [ "$nsd" = 0 ]; then old_ok=1; fi
  if [ "$new_ok" = 1 ]; then echo new
  elif [ "$old_ok" = 1 ]; then echo old
  else echo mixed; fi
}

pins_table() { # repo -> human-readable literal counts (label count)
  local repo=$1
  echo "new_archive=$(count_in_pins "$repo" "$NEW_ARCHIVE_SHA256")"
  echo "new_encoder=$(count_in_pins "$repo" "$NEW_ENCODER_SHA256")"
  echo "new_decoder=$(count_in_pins "$repo" "$NEW_DECODER_SHA256")"
  echo "new_joiner=$(count_in_pins "$repo" "$NEW_JOINER_SHA256")"
  echo "new_model_version=$(count_in_pins "$repo" "$NEW_MODEL_VERSION")"
  echo "old_archive=$(count_in_pins "$repo" "$OLD_ARCHIVE_SHA256")"
  echo "old_encoder=$(count_in_pins "$repo" "$OLD_ENCODER_SHA256")"
  echo "old_decoder=$(count_in_pins "$repo" "$OLD_DECODER_SHA256")"
  echo "old_joiner=$(count_in_pins "$repo" "$OLD_JOINER_SHA256")"
  echo "old_model_version=$(count_in_pins "$repo" "$OLD_MODEL_VERSION")"
  echo "tokens=$(count_in_pins "$repo" "$NEW_TOKENS_SHA256")"
  echo "new_encoder_size=$(count_in_pins "$repo" "${NEW_ENCODER_SIZE}L")"
  echo "new_decoder_size=$(count_in_pins "$repo" "${NEW_DECODER_SIZE}L")"
  echo "old_encoder_size=$(count_in_pins "$repo" "${OLD_ENCODER_SIZE}L")"
  echo "old_decoder_size=$(count_in_pins "$repo" "${OLD_DECODER_SIZE}L")"
}

staged_class() { # staging-dir -> new | old | mixed | missing
  local dir=$1 f h
  local new_hits=0 old_hits=0 missing=0 other=0
  for f in $MODEL_FILES; do
    if [ ! -f "$dir/$f" ]; then missing=1; continue; fi
    h=$(sha256_file "$dir/$f")
    case "$f" in
      encoder.int8.onnx)
        if [ "$h" = "$NEW_ENCODER_SHA256" ]; then new_hits=$((new_hits + 1));
        elif [ "$h" = "$OLD_ENCODER_SHA256" ]; then old_hits=$((old_hits + 1)); else other=1; fi ;;
      decoder.int8.onnx)
        if [ "$h" = "$NEW_DECODER_SHA256" ]; then new_hits=$((new_hits + 1));
        elif [ "$h" = "$OLD_DECODER_SHA256" ]; then old_hits=$((old_hits + 1)); else other=1; fi ;;
      joiner.int8.onnx)
        if [ "$h" = "$NEW_JOINER_SHA256" ]; then new_hits=$((new_hits + 1));
        elif [ "$h" = "$OLD_JOINER_SHA256" ]; then old_hits=$((old_hits + 1)); else other=1; fi ;;
      tokens.txt)
        # tokens.txt is byte-identical in the OLD and NEW archives: it must not
        # influence the OLD/NEW class, only prove it is one of the two.
        if [ "$h" != "$NEW_TOKENS_SHA256" ] && [ "$h" != "$OLD_TOKENS_SHA256" ]; then other=1; fi ;;
    esac
  done
  if [ "$missing" = 1 ]; then echo missing
  elif [ "$other" = 1 ]; then echo mixed
  elif [ "$new_hits" = 3 ] && [ "$old_hits" = 0 ]; then echo new
  elif [ "$old_hits" = 3 ] && [ "$new_hits" = 0 ]; then echo old
  else echo mixed; fi
}

staged_report() { # staging-dir -> per-file hash/size/class
  local dir=$1 f h s
  for f in $MODEL_FILES; do
    if [ ! -f "$dir/$f" ]; then echo "$f missing -"; continue; fi
    h=$(sha256_file "$dir/$f")
    s=$(file_size "$dir/$f")
    local cls=other
    case "$f" in
      encoder.int8.onnx)
        if [ "$h" = "$NEW_ENCODER_SHA256" ]; then cls=new; elif [ "$h" = "$OLD_ENCODER_SHA256" ]; then cls=old; fi ;;
      decoder.int8.onnx)
        if [ "$h" = "$NEW_DECODER_SHA256" ]; then cls=new; elif [ "$h" = "$OLD_DECODER_SHA256" ]; then cls=old; fi ;;
      joiner.int8.onnx)
        if [ "$h" = "$NEW_JOINER_SHA256" ]; then cls=new; elif [ "$h" = "$OLD_JOINER_SHA256" ]; then cls=old; fi ;;
      tokens.txt)
        if [ "$h" = "$NEW_TOKENS_SHA256" ] || [ "$h" = "$OLD_TOKENS_SHA256" ]; then cls=shared; fi ;;
    esac
    echo "$f $s $h $cls"
  done
}

check_archives() { # verifies both archives size+sha; logs PASS/FAIL
  if [ -f "$OLD_ARCHIVE" ]; then
    check_eq "old archive size" "$OLD_ARCHIVE_SIZE" "$(file_size "$OLD_ARCHIVE")"
    check_eq "old archive sha256" "$OLD_ARCHIVE_SHA256" "$(sha256_file "$OLD_ARCHIVE")"
  else
    fail "old archive present ($OLD_ARCHIVE)"
  fi
  if [ -f "$NEW_ARCHIVE" ]; then
    check_eq "new archive size" "$NEW_ARCHIVE_SIZE" "$(file_size "$NEW_ARCHIVE")"
    check_eq "new archive sha256" "$NEW_ARCHIVE_SHA256" "$(sha256_file "$NEW_ARCHIVE")"
  else
    fail "new archive present ($NEW_ARCHIVE)"
  fi
}

summary() {
  echo "----------------------------------------"
  echo "checks passed: $PASS_COUNT   failed: $FAIL_COUNT"
  if [ "$FAIL_COUNT" -ne 0 ]; then return 1; fi
  return 0
}
