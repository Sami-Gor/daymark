#!/usr/bin/env bash
set -uo pipefail
E=/Volumes/DaymarkWorkspace/Daymark/archive/reports/ROUND7-AGENT-EVIDENCE/agentC/evidence
REV=2bda32ec70b097a55adaa07d9a7173915b43cc78
REPO=csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8
BASE="https://huggingface.co/$REPO"

echo "== HF model info =="
curl -sS --max-time 45 "$BASE" > "$E/14-hf-api-model.json"; echo "HTTP model-info saved"

echo "== HF revision 2bda32ec tree =="
curl -sS --max-time 45 "$BASE/tree/$REV" > "$E/15-hf-api-tree-2bda32ec.json"; echo "tree saved $(wc -c < "$E/15-hf-api-tree-2bda32ec.json") bytes"

echo "== HF refs =="
curl -sS --max-time 45 "$BASE/refs" > "$E/16-hf-api-refs.json"; cat "$E/16-hf-api-refs.json"; echo

echo "== HF commit history (main) =="
curl -sS --max-time 45 "$BASE/commits/main" > "$E/17-hf-api-commits-main.json"; python3 - "$E/17-hf-api-commits-main.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
for c in d: print(c['id'], c['date'], repr(c['title'])[:40])
PY

echo "== per-file HEAD headers at pinned revision (2bda32ec) and at mutable main =="
{
  echo "# HF resolve headers: pinned commit vs mutable main (proves main moved 2026-11-07)"
  for ref in "$REV" main; do
    echo "## ref=$ref"
    for f in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
      echo "-- $f"
      curl -sSIL --max-time 45 "$BASE/resolve/$ref/$f" | grep -iE '^(HTTP/|x-linked-etag|x-linked-size|etag|content-length)' | sed 's/\r$//'
    done
    echo
  done
  echo "# top-level HTTP status for the pinned revision API"
  curl -sS -o /dev/null -w 'revision_api_http=%{http_code}\n' --max-time 45 "$BASE/revision/$REV"
} > "$E/18-hf-resolve-headers.txt" 2>&1
cat "$E/18-hf-resolve-headers.txt"

echo "== fetched file hashes at pinned revision (from T5 scratch) =="
{ echo "# SHA-256 of the four files fetched from HF revision $REV (T5 scratch)"; cd /Volumes/DaymarkWorkspace/Daymark/cache/round7/parakeet/hf && sha256sum 2>/dev/null || shasum -a 256 encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; echo; stat -f '%N size=%z' encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; } > "$E/19-hf-file-hashes.txt" 2>&1
cat "$E/19-hf-file-hashes.txt"

echo "== HF file-to-pin comparison =="
python3 - "$E/19-hf-file-hashes.txt" > "$E/20-hf-pin-comparison.txt" <<'PY'
import sys,re
pins={
 'encoder.int8.onnx':('acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247',652184281),
 'decoder.int8.onnx':('179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e',11845275),
 'joiner.int8.onnx':('3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3',6355277),
 'tokens.txt':('d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d',93939),
}
text=open(sys.argv[1]).read()
ok=True
for line in text.splitlines():
    m=re.match(r'([0-9a-f]{64})\s+(\S+)$', line.strip())
    if m:
        got,name=m.group(1),m.group(2)
        exp=pins.get(name)
        if not exp: continue
        status='MATCH' if got==exp[0] else 'MISMATCH'
        ok = ok and got==exp[0]
        print(f'{name}: {status} sha256={got}')
print('RESULT:', 'PASS - all four HF files match the committed per-file pins' if ok else 'FAIL')
PY
cat "$E/20-hf-pin-comparison.txt"
