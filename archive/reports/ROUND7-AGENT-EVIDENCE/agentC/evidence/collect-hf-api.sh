#!/usr/bin/env bash
set -uo pipefail
E=/Volumes/DaymarkWorkspace/Daymark/archive/reports/ROUND7-AGENT-EVIDENCE/agentC/evidence
REV=2bda32ec70b097a55adaa07d9a7173915b43cc78
R=csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8
fetch() { # url outfile label
  local url="$1" out="$2" label="$3" code
  for attempt in 1 2 3 4; do
    code=$(curl -sS --max-time 45 -H 'Accept: application/json' -H 'User-Agent: daymark-round7-agentC/1.0' -o "$out.tmp" -w '%{http_code}' "$url")
    if [ "$code" = 200 ] && python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$out.tmp" 2>/dev/null; then
      mv "$out.tmp" "$out"
      echo "ok: $label (http 200, $(wc -c < "$out") bytes JSON)"
      sleep 3
      return 0
    fi
    echo "retry $attempt: $label http=$code content-type=$(file -b "$out.tmp" 2>/dev/null | head -c 40)"
    sleep $((attempt * 5))
  done
  echo "FAIL: $label" >&2
  return 1
}

fetch "https://huggingface.co/api/models/$R" "$E/14-hf-api-model.json" "model info"
fetch "https://huggingface.co/api/models/$R/revision/$REV" "$E/15-hf-api-revision-2bda32ec.json" "revision 2bda32ec"
fetch "https://huggingface.co/api/models/$R/tree/$REV" "$E/16-hf-api-tree-2bda32ec.json" "tree at 2bda32ec"
fetch "https://huggingface.co/api/models/$R/refs" "$E/17-hf-api-refs.json" "refs"
fetch "https://huggingface.co/api/models/$R/commits/main" "$E/18-hf-api-commits-main.json" "commits on main"

echo "=== summary ==="
python3 - "$E" <<'PY'
import json,sys,os
E=sys.argv[1]
def load(n):
    p=os.path.join(E,n)
    try: return json.load(open(p))
    except Exception as e: return None
m=load('14-hf-api-model.json')
print('model:', m['id'], 'sha=',m['sha'],'lastModified=',m['lastModified'],'tags=',m['tags'])
rev=load('15-hf-api-revision-2bda32ec.json')
print('revision:', rev['sha'], rev.get('lastModified'))
tree=load('16-hf-api-tree-2bda32ec.json')
for t in tree: print('tree:', t['path'], 'size=',t.get('size'), 'oid=',t.get('oid'), 'lfs_oid=', (t.get('lfs') or {}).get('oid'))
refs=load('17-hf-api-refs.json')
print('refs branches:', [(b['name'],b['targetCommit']) for b in refs.get('branches',[])], 'tags:', refs.get('tags'))
commits=load('18-hf-api-commits-main.json')
print('commits:', [(c['id'],c['date']) for c in commits])
PY
