#!/usr/bin/env bash
#
# verify-parakeet-mirror.sh - verify the preserved Parakeet TDT 0.6B v3 int8
# archive (immutable-mirror strategy) without trusting the archive name.
#
# Usage:
#   verify-parakeet-mirror.sh [ARCHIVE_PATH]
#
# Default ARCHIVE_PATH is the T5 preservation copy. The script:
#   1. checks the archive size and SHA-256 against the committed pins;
#   2. lists the tar members and enforces a closed allow-list (no absolute
#      paths, no "..", no symlinks, no duplicates, exactly the 10 known members);
#   3. extracts into a temporary directory (TMPDIR, never the repository) and
#      hashes every model file and test wav against the pinned digests/sizes;
#   4. leaves no repository or production-pin changes.
#
# Exit 0 only if every check passes. Any failure exits non-zero (fail closed).
set -euo pipefail

ARCHIVE="${1:-/Volumes/DaymarkWorkspace/Daymark/archive/assets/parakeet-preservation/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2}"

ARCHIVE_SIZE=487170055
ARCHIVE_SHA256=5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf

FILE_PINS="encoder.int8.onnx|652184281|acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247
decoder.int8.onnx|11845275|179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e
joiner.int8.onnx|6355277|3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3
tokens.txt|93939|d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d
test_wavs/en.wav|184608|148b936b43ce7c546a866e64da059f0458aee2d65e617f16e9d94f06e8d99ed6
test_wavs/fr.wav|219180|b59be4349b92d344fb903677165eaf4694025d1ab119c608726ecbcb3164b528
test_wavs/es.wav|235052|49fd2cfa4b62db7068143c582b35de9d31ec2733495ece3611105131d21de06c
test_wavs/de.wav|121388|36d3c4845b9808a1656a2a2e92d884590e2db94389e6fe559643291ae0cd3710"

EXPECTED_MEMBERS="sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/tokens.txt
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/joiner.int8.onnx
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/decoder.int8.onnx
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/encoder.int8.onnx
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/en.wav
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/fr.wav
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/es.wav
sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/de.wav"

fail() { echo "error: $*" >&2; exit 1; }
ok()   { echo "ok: $*"; }

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "archive=$ARCHIVE"
size="$(wc -c < "$ARCHIVE" | tr -d ' ')"
[ "$size" = "$ARCHIVE_SIZE" ] || fail "archive size mismatch: $size != $ARCHIVE_SIZE"
ok "archive size $size bytes"

actual="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
[ "$actual" = "$ARCHIVE_SHA256" ] || fail "archive sha256 mismatch: $actual != $ARCHIVE_SHA256"
ok "archive sha256 $actual"

tar -tjf "$ARCHIVE" > "$WORK/members.txt"
actual_members="$(cat "$WORK/members.txt")"
[ "$actual_members" = "$EXPECTED_MEMBERS" ] || fail "archive member list/order differs from the closed allow-list"
ok "member list matches the closed allow-list (10 members)"
echo "$actual_members"

while IFS= read -r member; do
  case "$member" in
    /*) fail "absolute member path: $member" ;;
    *..*) fail "parent-traversal-looking member path: $member" ;;
    *'//'*) fail "double-slash member path: $member" ;;
  esac
done < "$WORK/members.txt"
[ -z "$(sort "$WORK/members.txt" | uniq -d)" ] || fail "duplicate members in archive"
if tar -tvjf "$ARCHIVE" | awk '$1 ~ /^[lh]/ {found=1} END {exit !found}'; then
  fail "archive contains symlink or hardlink members"
fi
ok "no absolute/traversal/duplicate/symlink members"

tar -xjf "$ARCHIVE" -C "$WORK"
ROOT="$WORK/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"

while IFS='|' read -r name expected_size expected_sha; do
  file="$ROOT/$name"
  [ -f "$file" ] || fail "missing extracted file: $name"
  got_size="$(wc -c < "$file" | tr -d ' ')"
  [ "$got_size" = "$expected_size" ] || fail "size mismatch for $name: $got_size != $expected_size"
  got_sha="$(shasum -a 256 "$file" | awk '{print $1}')"
  [ "$got_sha" = "$expected_sha" ] || fail "sha256 mismatch for $name: $got_sha != $expected_sha"
  ok "$name size=$got_size sha256=$got_sha"
done <<< "$FILE_PINS"

echo "RESULT: PASS - preserved archive and all 8 extracted files match the committed pins"
