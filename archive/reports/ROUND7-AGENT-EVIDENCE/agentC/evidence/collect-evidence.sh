#!/usr/bin/env bash
set -uo pipefail
E=/Volumes/DaymarkWorkspace/Daymark/archive/reports/ROUND7-AGENT-EVIDENCE/agentC/evidence
P=/Volumes/DaymarkWorkspace/Daymark/archive/assets/parakeet-preservation/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2
WT=/Volumes/DaymarkWorkspace/Daymark/worktrees/r7-pin
L=/Volumes/DaymarkWorkspace/Daymark/cache/round7/parakeet

echo "== 01 archive stat =="
{ echo "# stat of the preserved archive"; echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; stat -f 'path=%N%nsize=%z bytes%nblocks=%b%nmtime=%Sm%nbirth=%SB%nctime=%Sc%nmode=%Sp%nuid=%u gid=%g' -t '%Y-%m-%dT%H:%M:%S%z' "$P"; echo 'xattr:'; xattr -l "$P" 2>&1; echo 'magic:'; head -c 3 "$P" | xxd; } > "$E/01-archive-stat.txt" 2>&1

echo "== 02 archive sha256 =="
{ echo "# SHA-256 of the preserved archive (recomputed by Agent C, Round 7)"; echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; /usr/bin/time -p shasum -a 256 "$P" 2>&1; echo "expected 5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf"; } > "$E/02-archive-sha256.txt" 2>&1

echo "== 03 archive members =="
{ echo "# tar -tvjf (member metadata, archive order)"; tar -tvjf "$P" 2>&1; echo; echo "member_count=$(tar -tjf "$P" | wc -l | tr -d ' ')"; echo "file_member_count=$(tar -tjf "$P" | grep -vc '/$')"; } > "$E/03-archive-members.txt" 2>&1

echo "== 04 member hashes from extraction =="
{ echo "# per-member SHA-256 (extracted to T5 scratch $L/mirror)"; cd "$L/mirror/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8" && shasum -a 256 encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt test_wavs/*.wav; echo; stat -f '%N size=%z' encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt test_wavs/*.wav; } > "$E/04-member-hashes.txt" 2>&1

echo "== 05 extraction listing =="
{ echo "# extracted tree (T5 scratch)"; find "$L/mirror" -type f -exec stat -f '%N size=%z mode=%Sp mtime=%Sm' -t '%Y-%m-%dT%H:%M:%S%z' {} \; ; } > "$E/05-extracted-tree.txt" 2>&1

echo "== 06 provenance excerpts =="
{ echo "# Provenance chain for archive/assets/parakeet-preservation (excerpts from existing records)"; echo; echo "## A. pres-1-copy report: T5 source -> Desktop copy, 2026-11-14"; sed -n '7,20p;46,62p;80,100p' /Volumes/DaymarkWorkspace/Daymark/reports/agent-reviews/pres-1-copy/report.md; echo; echo "## B. final migration log: Desktop copy -> archive/assets, 2026-11-17"; grep -n 'parakeet-preservation' /Volumes/DaymarkWorkspace/Daymark/archive/reports/migration-logs/final-migration-20261117T185357.log; echo; echo "## C. quarantine provenance: old vs replacement archive identity"; cat /Volumes/DaymarkWorkspace/Daymark/quarantine/parakeet-20261118/ARCHIVE-PROVENANCE.json; } > "$E/06-provenance-chain.txt" 2>&1

echo "== 07 current upstream state =="
{ echo "# Live upstream GitHub release asset and download headers (read-only probes)"; echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo '## asset API'; curl -sS --max-time 45 'https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/assets/719769366' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ("id","name","size","digest","state","created_at","updated_at","download_count","browser_download_url")}, indent=1))'; echo; echo '## release asr-models'; curl -sS --max-time 45 'https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/asr-models' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ("id","tag_name","immutable","published_at","created_at")}, indent=1))'; echo; echo '## HEAD of the URL pinned in fetch-parakeet-assets.sh'; curl -sSIL --max-time 45 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2' | grep -iE '^(HTTP/|content-length|last-modified|etag|location)'; } > "$E/07-upstream-state.txt" 2>&1

echo "== 08 replacement archive identity =="
{ echo "# 487,211,443-byte replacement archive that upstream now serves (NOT the pin)"; shasum -a 256 /Volumes/DaymarkWorkspace/Daymark/archive/historical-work/recovered/model.tar.bz2 2>&1; stat -f 'size=%z mtime=%Sm' -t '%Y-%m-%dT%H:%M:%S%z' /Volumes/DaymarkWorkspace/Daymark/archive/historical-work/recovered/model.tar.bz2; echo "expected replacement sha256 1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9"; } > "$E/08-replacement-archive.txt" 2>&1

echo "== 09 pin locations in r7-pin =="
{ echo "# every tracked location of the pinned archive/file digests in r7/pin"; cd "$WT"; git rev-parse HEAD; git status --short --branch; echo; grep -rn 'acfc2b44\|179e50c4\|3164c13f\|d5854467\|5793d0fd\|1495e91b\|MODEL_VERSION' --exclude-dir=.git --exclude-dir=node_modules --exclude='*.onnx' . 2>/dev/null; } > "$E/09-pin-locations.txt" 2>&1

echo "== 10 CI wiring =="
{ echo "# CI steps that fetch/verify the Parakeet model"; cd "$WT"; grep -n 'fetch-parakeet\|parakeet-assets\|model_required\|model-dependent\|verifyParakeetAssets' .github/workflows/ci.yml .github/workflows/android-ci.yml scripts/ci/classify-model-dependency.mjs 2>/dev/null; } > "$E/10-ci-wiring.txt" 2>&1

echo "== 11 archive publication readiness =="
{ echo "# Daymark-controlled hosting state (read-only, unauthenticated)"; echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo '## repo'; curl -sS --max-time 45 'https://api.github.com/repos/Sami-Gor/daymark' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ("full_name","visibility","private","archived","default_branch","created_at","permissions")}, indent=1))' 2>&1; echo; echo '## releases'; curl -sS --max-time 45 'https://api.github.com/repos/Sami-Gor/daymark/releases' | python3 -c 'import json,sys; d=json.load(sys.stdin); print([{"tag":r.get("tag_name"),"draft":r.get("draft"),"prerelease":r.get("prerelease"),"immutable":r.get("immutable"),"assets":[{"name":a.get("name"),"size":a.get("size"),"digest":a.get("digest")} for a in r.get("assets",[])]} for r in d])' 2>&1; echo; echo '## immutable releases setting'; curl -sS -w '\nHTTP %{http_code}\n' --max-time 45 'https://api.github.com/repos/Sami-Gor/daymark/immutable-releases'; } > "$E/11-hosting-state.txt" 2>&1

echo "== 12 licence evidence =="
{ echo "# Licence of the Parakeet model weights"; cd "$WT"; sed -n '26,42p' THIRD-PARTY-NOTICES.md; echo; echo "## NVIDIA model card licence (API)"; curl -sS --max-time 45 'https://huggingface.co/api/models/nvidia/parakeet-tdt-0.6b-v3' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ("id","sha","cardData","tags")}, indent=1)[:1500])' 2>&1; } > "$E/12-licence.txt" 2>&1

echo "done"
