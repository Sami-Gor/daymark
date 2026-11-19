#!/usr/bin/env bash
set -uo pipefail
REV="2bda32ec70b097a55adaa07d9a7173915b43cc78"
URL="https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/$REV/decoder.int8.onnx"
DIR="/Volumes/DaymarkWorkspace/Daymark/cache/round7/parakeet/hf-resume"
rm -rf "$DIR"; mkdir -p "$DIR"
echo "=== HF resumable-download test (decoder.int8.onnx) ==="
echo "url=$URL"
echo "start_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "--- step 1: deliberately interrupted download (--max-time 1) ---"
curl -L --fail --max-time 1 -o "$DIR/decoder.int8.onnx" "$URL" 2>&1 | tail -2
echo "step1_exit=${PIPESTATUS[0]}"
stat -f 'partial_size=%z bytes' "$DIR/decoder.int8.onnx" 2>/dev/null || echo "no partial file"
echo "--- step 2: resume with -C - (Range request) ---"
curl -sSIL -H 'Range: bytes=0-0' --max-time 30 "$URL" | grep -iE '^(HTTP/|content-range|accept-ranges|content-length)' || true
curl -L --fail --retry 3 --retry-delay 2 -C - -o "$DIR/decoder.int8.onnx" "$URL" \
  -w 'resume_http_code=%{http_code} bytes=%{size_download} time=%{time_total}s\n'
echo "resume_exit=$?"
stat -f 'final_size=%z bytes' "$DIR/decoder.int8.onnx"
echo "--- step 3: verify full-file hash equals pin ---"
shasum -a 256 "$DIR/decoder.int8.onnx"
echo "expected=179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e"
echo "end_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
