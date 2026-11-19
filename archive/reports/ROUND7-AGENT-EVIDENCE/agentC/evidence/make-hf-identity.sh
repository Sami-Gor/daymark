#!/usr/bin/env bash
set -euo pipefail
E=/Volumes/DaymarkWorkspace/Daymark/archive/reports/ROUND7-AGENT-EVIDENCE/agentC/evidence
{
echo "# Hugging Face pinned-revision identity check (Round 7 Agent C)"
echo "repo=csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
echo "revision=2bda32ec70b097a55adaa07d9a7173915b43cc78 (commit date 2025-08-16T09:29:07Z)"
echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
printf '%-20s %-12s %-64s %-64s %s\n' FILE 'SIZE' 'EXPECTED SHA-256 (repo pin)' 'FETCHED SHA-256 (T5 scratch)' VERDICT
python3 - "$E/22-hf-file-hashes.txt" <<'PY'
import sys,re
pins={
 'encoder.int8.onnx':('acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247',652184281),
 'decoder.int8.onnx':('179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e',11845275),
 'joiner.int8.onnx':('3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3',6355277),
 'tokens.txt':('d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d',93939),
}
text=open(sys.argv[1]).read()
got={}
for line in text.splitlines():
    m=re.match(r'([0-9a-f]{64})\s+(\S+)$', line.strip())
    if m: got[m.group(2)]=m.group(1)
ok=True
for name,(exp,size) in pins.items():
    actual=got.get(name,'MISSING')
    verdict='MATCH' if actual==exp else ('MISSING' if actual=='MISSING' else 'MISMATCH')
    ok = ok and verdict=='MATCH'
    print(f'{name:<20} {size:<12} {exp:<64} {actual:<64} {verdict}')
print()
print('RESULT:', 'PASS - all four fetched files match the committed per-file pins' if ok else 'FAIL')
PY
echo
echo "# HF LFS object ids at the pinned revision (independent corroboration, from /api/models/.../tree/<rev>)"
python3 - "$E/18-hf-api-tree-2bda32ec.json" <<'PY'
import json,sys
for t in json.load(open(sys.argv[1])):
    lfs=t.get('lfs') or {}
    print(f"{t['path']:<20} size={t.get('size'):<12} git_oid={t.get('oid')} lfs_oid={lfs.get('oid')}")
PY
} > "$E/23-hf-identity-comparison.txt"
cat "$E/23-hf-identity-comparison.txt"
