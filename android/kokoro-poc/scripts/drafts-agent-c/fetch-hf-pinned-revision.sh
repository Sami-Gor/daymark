#!/usr/bin/env bash
# Round 7 Agent C - Hugging Face fixed-revision per-file fetch (resumable), T5 scratch only.
set -uo pipefail
REV="2bda32ec70b097a55adaa07d9a7173915b43cc78"
REPO="csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
BASE="https://huggingface.co/${REPO}/resolve/${REV}"
DIR="/Volumes/DaymarkWorkspace/Daymark/cache/round7/parakeet/hf"
mkdir -p "$DIR"
echo "=== HF pinned-revision fetch ==="
echo "repo=${REPO}"
echo "revision=${REV}"
echo "start_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
for f in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
  echo "=== ${f} ==="
  echo "-- HEAD headers --"
  curl -sSIL --max-time 60 "$BASE/$f" | grep -iE '^(HTTP/|x-linked-etag|x-linked-size|content-length|etag|location|content-type)' || true
  echo "-- GET (resumable) --"
  curl -L --fail --retry 5 --retry-delay 3 --retry-all-errors -C - \
    -o "$DIR/$f" "$BASE/$f" \
    -w 'http_code=%{http_code} bytes=%{size_download} time=%{time_total}s speed=%{speed_download}B/s effective_url=%{url_effective}\n'
  rc=$?
  echo "curl_exit=${rc}"
  if [ ${rc} -ne 0 ]; then echo "FAIL: ${f}" >&2; exit 1; fi
  echo "-- size/hash --"
  stat -f 'size=%z bytes' "$DIR/$f"
  shasum -a 256 "$DIR/$f"
  echo
done
echo "end_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=== summary ==="
cd "$DIR"
shasum -a 256 encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt
