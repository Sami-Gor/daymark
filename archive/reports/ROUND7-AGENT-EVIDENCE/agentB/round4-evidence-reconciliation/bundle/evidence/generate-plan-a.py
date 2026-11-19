#!/usr/bin/env python3
"""Generate Plan A unified diff (not applied) for the coordinated Parakeet pin update.
Source of truth: clean repository at HEAD. Emits a 6-file unified diff with a/ b/ prefixes
suitable for "git apply -p1". Deterministic: every replacement asserts an exact match count.
"""
import os, sys, difflib

T5 = "/Volumes/DaymarkWorkspace/Daymark"
REPO = os.path.join(T5, "repositories/daymark")
SCRATCH = os.path.join(T5, "archive/reports/round4-b-plans/_build/plan-a-mod")
OUT = os.path.join(T5, "archive/reports/round4-b-plans/plan-a-adoption.patch")
TSV = os.path.join(T5, "archive/reports/round4-b-plans/plan-a-replacements.tsv")

OLD = {
 "ARCHIVE": "5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf",
 "ENCODER": "acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247",
 "DECODER": "179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e",
 "JOINER":  "3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3",
 "TOKENS":  "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
 "MODEL_VERSION": "parakeet-tdt-0.6b-v3-int8-sha256-1",
 "ENC_SIZE": "652184281L", "DEC_SIZE": "11845275L",
}
NEW = {
 "ARCHIVE": "1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9",
 "ENCODER": "1afbe69c1ffdabee94755f42e4daf1d93549131a3da11356bda84fcef0f2c479",
 "DECODER": "0222a86147299d4dee90edf95b6d13827edb42ad8b7c9cf0b2582f030937c0b5",
 "JOINER":  "cbd02f3696e9944970111fb439d9c3fd365a80374565f13f2b9c7007d253fc98",
 "TOKENS":  "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
 "MODEL_VERSION": "parakeet-tdt-0.6b-v3-int8-sha256-2",
 "ENC_SIZE": "652282294L", "DEC_SIZE": "11845274L",
}

# file -> ordered list of (label, old, new, expected_count)
PLAN = {
 "android/kokoro-poc/scripts/fetch-parakeet-assets.sh": [
   ("S1/P1 ARCHIVE_SHA256", OLD["ARCHIVE"], NEW["ARCHIVE"], 1),
   ("S2/P2 ENCODER_SHA256", OLD["ENCODER"], NEW["ENCODER"], 1),
   ("S2/P3 DECODER_SHA256", OLD["DECODER"], NEW["DECODER"], 1),
   ("S2/P4 JOINER_SHA256", OLD["JOINER"], NEW["JOINER"], 1),
 ],
 "artifacts/weather-app/android/parakeet-assets/build.gradle": [
   ("S3/P6 encoder digest", OLD["ENCODER"], NEW["ENCODER"], 1),
   ("S3/P6 decoder digest", OLD["DECODER"], NEW["DECODER"], 1),
   ("S3/P6 joiner digest", OLD["JOINER"], NEW["JOINER"], 1),
 ],
 "artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/ParakeetModelAssets.java": [
   ("S4/P8 encoder size", OLD["ENC_SIZE"], NEW["ENC_SIZE"], 1),
   ("S4/P8 decoder size", OLD["DEC_SIZE"], NEW["DEC_SIZE"], 1),
   ("S4/P7 encoder digest", OLD["ENCODER"], NEW["ENCODER"], 1),
   ("S4/P7 decoder digest", OLD["DECODER"], NEW["DECODER"], 1),
   ("S4/P7 joiner digest", OLD["JOINER"], NEW["JOINER"], 1),
   ("S4/P9 MODEL_VERSION", OLD["MODEL_VERSION"], NEW["MODEL_VERSION"], 1),
 ],
 "artifacts/weather-app/android/daymark-voice/src/test/java/io/github/sami_gor/daymark/voice/ParakeetModelAssetsTest.java": [
   ("S5/P10 expected sizes", OLD["ENC_SIZE"], NEW["ENC_SIZE"], 1),
   ("S5/P10 expected sizes (decoder, same line)", OLD["DEC_SIZE"], NEW["DEC_SIZE"], 1),
 ],
 "THIRD-PARTY-NOTICES.md": [
   ("S6/P11+P12 archive digest (row 12 + table)", OLD["ARCHIVE"], NEW["ARCHIVE"], 2),
   ("S6/P12 encoder digest", OLD["ENCODER"], NEW["ENCODER"], 1),
   ("S6/P12 decoder digest", OLD["DECODER"], NEW["DECODER"], 1),
   ("S6/P12 joiner digest", OLD["JOINER"], NEW["JOINER"], 1),
 ],
 "docs/release/reproducible-build-guide.md": [
   ("S7/P13 encoder digest", OLD["ENCODER"], NEW["ENCODER"], 1),
   ("S7/P13 decoder digest", OLD["DECODER"], NEW["DECODER"], 1),
   ("S7/P13 joiner digest", OLD["JOINER"], NEW["JOINER"], 1),
   ("S7/P13 archive digest", OLD["ARCHIVE"], NEW["ARCHIVE"], 1),
 ],
}

def main():
  os.makedirs(SCRATCH, exist_ok=True)
  chunks = []
  rows = ["site\tfile\told\tnew\tmatches"]
  for rel, edits in PLAN.items():
    src = os.path.join(REPO, rel)
    text = open(src, encoding="utf-8").read()
    original = text
    for label, old, new, expected in edits:
      n = text.count(old)
      if n != expected:
        sys.exit("FAIL %s %s: expected %d occurrence(s), found %d" % (rel, label, expected, n))
      text = text.replace(old, new)
      rows.append("%s\t%s\t%s\t%s\t%d" % (label, rel, old, new, n))
    dst = os.path.join(SCRATCH, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(text)
    diff = list(difflib.unified_diff(
      original.splitlines(keepends=True), text.splitlines(keepends=True),
      fromfile="a/" + rel, tofile="b/" + rel, n=3))
    chunks.append("".join(diff))
  with open(OUT, "w", encoding="utf-8") as f:
    f.write("".join(chunks))
  with open(TSV, "w", encoding="utf-8") as f:
    f.write("\n".join(rows) + "\n")
  print("wrote", OUT, os.path.getsize(OUT), "bytes;", len(rows) - 1, "replacements")

if __name__ == "__main__":
  main()
