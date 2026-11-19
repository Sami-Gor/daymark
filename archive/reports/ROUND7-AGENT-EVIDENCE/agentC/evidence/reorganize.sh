#!/usr/bin/env bash
set -uo pipefail
E=/Volumes/DaymarkWorkspace/Daymark/archive/reports/ROUND7-AGENT-EVIDENCE/agentC/evidence
C=/Volumes/DaymarkWorkspace/Daymark/archive/reports/ROUND7-AGENT-EVIDENCE/agentC
D=/Volumes/DaymarkWorkspace/Daymark/archive/reports/ROUND7-AGENT-EVIDENCE/agentC/drafts
cd "$E"
# remove stale HTML API captures (rate-limited WAF page, not JSON)
rm -f 15-hf-api-tree-2bda32ec.json 16-hf-api-refs.json 17-hf-api-commits-main.json
# --- mirror strategy evidence (0x) ---
mv -f 01-archive-stat.txt 01-archive-stat.txt 2>/dev/null || true
mv -f 02-archive-sha256.txt 02-archive-sha256.txt 2>/dev/null || true
mv -f 03-archive-members.txt 03-archive-members.txt 2>/dev/null || true
mv -f 04-member-hashes.txt 04-member-hashes.txt 2>/dev/null || true
mv -f 04-mirror-verification.log 05-mirror-verification-run.log 2>/dev/null || true
mv -f 05-extracted-tree.txt 06-extracted-tree.txt 2>/dev/null || true
mv -f 06-provenance-chain.txt 07-provenance-chain.txt 2>/dev/null || true
mv -f 13-t5backup-crosscheck.txt 08-t5backup-crosscheck.txt 2>/dev/null || true
mv -f 07-upstream-state.txt 09-upstream-state.txt 2>/dev/null || true
mv -f 08-replacement-archive.txt 10-replacement-archive.txt 2>/dev/null || true
mv -f 09-pin-locations.txt 11-pin-locations.txt 2>/dev/null || true
mv -f 10-ci-wiring.txt 12-ci-wiring.txt 2>/dev/null || true
mv -f 11-hosting-state.txt 13-hosting-state.txt 2>/dev/null || true
mv -f 12-licence.txt 14-licence.txt 2>/dev/null || true
mv -f 18-hf-resolve-headers.txt 21-hf-resolve-headers.txt 2>/dev/null || true
mv -f 19-hf-file-hashes.txt 22-hf-file-hashes.txt 2>/dev/null || true
rm -f 20-hf-pin-comparison.txt
mv -f 14-hf-api-model.json 16-hf-api-model.json 2>/dev/null || true
mv -f 15-hf-api-revision-2bda32ec.json 17-hf-api-revision-2bda32ec.json 2>/dev/null || true
mv -f 16-hf-api-tree-2bda32ec.json 18-hf-api-tree-2bda32ec.json 2>/dev/null || true
mv -f 17-hf-api-refs.json 19-hf-api-refs.json 2>/dev/null || true
mv -f 18-hf-api-commits-main.json 20-hf-api-commits-main.json 2>/dev/null || true
mv -f "$C/hf-fetch.log" 15-hf-fetch.log 2>/dev/null || true
mv -f 13-hf-resume-test.log 24-hf-resume-test.log 2>/dev/null || true
mv -f 13-hf-resume-test.sh 24-hf-resume-test.sh 2>/dev/null || true
mv -f 15-current-fetch-script-failclosed.log 25-current-fetch-failclosed-internal-temp.log 2>/dev/null || true
mv -f 15-current-fetch-script-failclosed-T5TEMP.log 26-current-fetch-failclosed-T5TEMP.log 2>/dev/null || true
mv -f 15b-fetch-parakeet-assets-t5-temp.sh 27-fetch-parakeet-assets-t5-temp.sh 2>/dev/null || true
cp -f /Volumes/DaymarkWorkspace/Daymark/cache/round7/parakeet/release/SHA256SUMS 28-release-v2.0.0-SHA256SUMS.txt 2>/dev/null || true
# collectors live in evidence/; fetch script draft moves to drafts/
cp -f "$C/fetch-hf-pinned-revision.sh" "$D/fetch-hf-pinned-revision.sh" 2>/dev/null || true
rm -f "$C/fetch-hf-pinned-revision.sh"
ls -la "$E"
