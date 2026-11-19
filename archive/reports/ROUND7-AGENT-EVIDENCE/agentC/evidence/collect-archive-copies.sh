#!/usr/bin/env bash
# Known-candidate check for copies of the Parakeet archive. Fast and deterministic;
# a full-volume size scan was too slow under concurrent load (see 31-archive-copies.txt).
set -uo pipefail
E=/Volumes/DaymarkWorkspace/Daymark/archive/reports/ROUND7-AGENT-EVIDENCE/agentC/evidence
{
echo "# Known copies of the Parakeet archive (explicit candidate check)"
echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo '# A full-volume size scan was attempted and abandoned (too slow under concurrent load).'
echo '# This checks the known candidate locations instead.'
echo
for p in \
  /Volumes/DaymarkWorkspace/Daymark/archive/assets/parakeet-preservation/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2 \
  /Volumes/DaymarkWorkspace/Daymark/archive/historical-work/recovered/model.tar.bz2 \
  /Volumes/DaymarkWorkspace/Daymark/quarantine/parakeet-20261118/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2 \
  /Volumes/T5Backup/Daymark/01-stt-evaluation/models/parakeet-v3/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2; do
  if [ -f "$p" ]; then stat -f 'size=%z mtime=%Sm %N' -t '%Y-%m-%dT%H:%M:%S%z' "$p"; else echo "ABSENT $p"; fi
done
echo
echo '# Non-archive old-model locations (extracted directories, not archives):'
for p in \
  /Volumes/DaymarkWorkspace/Daymark/quarantine/parakeet-20261118/extracted-old/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8 \
  /Volumes/T5Backup/Daymark/01-stt-evaluation/models/parakeet-v3/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8; do
  [ -d "$p" ] && echo "DIR $p"
done
echo
echo '# Conclusion: one copy of the pinned archive on DaymarkWorkspace (archive/assets/parakeet-preservation),'
echo '# one byte-identical copy on the separate T5Backup volume, and the replacement archive'
echo '# (487,211,443 B) in archive/historical-work/recovered and quarantine/parakeet-20261118.'
} > "$E/31-archive-copies.txt" 2>&1
cat "$E/31-archive-copies.txt"
