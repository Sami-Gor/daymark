# Disclosure -- transient write to the default negative-worktree staging during testing

**Summary:** an intermediate (pre-final) Plan B regression run wrote the OLD model
bytes into the default negative-worktree staging directory
(`worktrees/negative/artifacts/weather-app/android/parakeet-assets/src/main/assets/parakeet`),
then the same suite's `restore --include-negative` step restored the NEW bytes.
**Net production state is unchanged** (verified by SHA-256 before/after and by
re-hashing the directory now), and the root cause is fixed in the delivered kit:
the tests now always pass `--negative-staging <scratch clone>`, and
`apply-plan-b.sh` / `verify-plan-b.sh` accept that override.

## What happened

* During the first full Plan B suite run (log preserved as
  `logs/incident-plan-b-suite-pre-fix.run.log`), the suite used
  `--include-negative` on `apply-plan-b.sh`, which (like the round-4 kit)
  targeted the environment default `NEGATIVE_STAGING_DIR`; the suite's own
  `$NEG` clone was not wired to the script.
* The apply step backed up and replaced the four staged files with the OLD
  bytes; the suite then failed two assertions (recorded target path was the real
  worktree, not the scratch clone) and continued.
* ~2 minutes later the suite's `restore-staged-backup.sh --include-negative
  --apply` step restored the exact NEW bytes from the provenance-pinned backup.
* The suite's final assertion
  `production negative-worktree staged assets unchanged by suite` passed; the
  directory now hashes to the canonical NEW values:

      1afbe69c1ffdabee94755f42e4daf1d93549131a3da11356bda84fcef0f2c479  encoder.int8.onnx
      0222a86147299d4dee90edf95b6d13827edb42ad8b7c9cf0b2582f030937c0b5  decoder.int8.onnx
      cbd02f3696e9944970111fb439d9c3fd365a80374565f13f2b9c7007d253fc98  joiner.int8.onnx
      d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d  tokens.txt

* The main production staging (`repositories/daymark/.../parakeet`) was **never**
  touched; the AAR, pins, archives and all tracked files were never modified.
  The staged assets are git-ignored (rule `.gitignore:102`), so the git tree
  showed no change.

## Fix in the delivered kit (commit `a076df3`)

* `apply-plan-b.sh` and `verify-plan-b.sh` gained `--negative-staging DIR`
  (default remains `NEGATIVE_STAGING_DIR` for owner use).
* `tests/test-plan-b-suite.sh` passes `--negative-staging "$NEG"` for its
  include-negative scenarios, so **all test writes are confined to APFS clones
  under `cache/round7/plans/test-run`**.
* A focused isolated re-test (with the override) produced byte-identical
  main + negative cycles and left the real default negative staging untouched
  (NEW hashes re-verified).

## Residual status

No production model bytes, pins, AAR, archive or tracked file differ from the
session baseline. The staged-asset state remains the documented hazard
(pins OLD / staged NEW) in both locations.
