#!/usr/bin/env bash
# Plan A -- coordinated Parakeet replacement adoption (pin update only).
#
# Applies plan-a-adoption.patch to the six pin-bearing files as ONE coordinated
# change, after preflight checks. DRY-RUN BY DEFAULT: nothing is written unless
# --apply is given. This script never commits, pushes, fetches the model, runs
# Gradle, or changes staged model assets.
#
# Usage:
#   ./apply-plan-a.sh [--repo DIR] [--staging DIR] [--patch FILE] [--apply]
#                     [--allow-head] [--allow-missing-staging]
#
# Exit: 0 = dry-run clean / patch applied and verified; 1 = preflight/verify failure.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$HERE/parakeet-pins.env"
. "$HERE/plans-lib.sh"

REPO=$REPO_ROOT
STAGING=$STAGING_DIR
PATCH="$HERE/$PLAN_A_PATCH_NAME"
APPLY=0
ALLOW_HEAD=0
ALLOW_MISSING_STAGING=0

usage() { sed -n '2,14p' "$0"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift 2 ;;
    --staging) STAGING=$2; shift 2 ;;
    --patch) PATCH=$2; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --allow-head) ALLOW_HEAD=1; shift ;;
    --allow-missing-staging) ALLOW_MISSING_STAGING=1; shift ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd git
require_cmd shasum
require_cmd grep

log "Plan A preflight (mode: $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN))"

# 1. repository and baseline HEAD.
[ -d "$REPO/.git" ] || die "not a git repository: $REPO"
HEAD_SHA=$(git -C "$REPO" rev-parse HEAD)
if [ "$HEAD_SHA" != "$PLAN_A_BASELINE_SHA" ]; then
  if [ "$ALLOW_HEAD" = 1 ]; then
    warn "HEAD $HEAD_SHA differs from planning baseline $PLAN_A_BASELINE_SHA (allowed)"
  else
    die "HEAD $HEAD_SHA != planning baseline $PLAN_A_BASELINE_SHA; regenerate/refresh the patch or pass --allow-head after review"
  fi
else
  log "HEAD matches planning baseline $PLAN_A_BASELINE_SHA"
fi

# 2. patch present and applies cleanly.
check_file "Plan A patch present" "$PATCH"
git -C "$REPO" apply --check "$PATCH"
log "git apply --check passed"

# 3. the six pin files are unmodified in the working tree.
DIRTY=$(git -C "$REPO" status --porcelain -- $PIN_FILES)
if [ -n "$DIRTY" ]; then
  echo "$DIRTY" >&2
  die "working tree changes present in pin files; commit/stash them first"
fi
log "six pin files are clean in the working tree"

# 4. start state must be PINS OLD (no partial adoption) and no new literal yet.
PINS=$(pins_state "$REPO")
[ "$PINS" = old ] || die "pin state is '$PINS', expected 'old' (already adopted or partial); refusing"
log "pin state is OLD (4/5/5/5/1 literals, MODEL_VERSION sha256-1)"

# 5. staged model assets must be the NEW bytes (Plan A adopts exactly those bytes).
STAGED=$(staged_class "$STAGING")
if [ "$STAGED" = new ]; then
  log "staged assets are NEW bytes (match Plan A target digests)"
elif [ "$STAGED" = missing ] && [ "$ALLOW_MISSING_STAGING" = 1 ]; then
  warn "staged assets missing (allowed); run fetch-parakeet-assets.sh after applying the pins"
else
  die "staged assets are '$STAGED', expected 'new'; Plan A adopts the new staged bytes. Run ./apply-plan-b.sh instead if staging must stay old."
fi

# 6. archives: old preserved and unchanged, new quarantine verified.
check_archives

# 7. show the exact change set.
echo
echo "== Planned change set =="
git -C "$REPO" apply --stat "$PATCH"
echo

if [ "$APPLY" -ne 1 ]; then
  echo "DRY-RUN OK: preflight passed and patch applies cleanly; NO FILES WERE CHANGED."
  echo "Re-run with --apply to apply the pin update as one working-tree change."
  exit 0
fi

# Apply.
git -C "$REPO" apply "$PATCH"
log "patch applied to working tree (not staged, not committed)"

# Verify immediately using the same code the owner will use.
if ! "$HERE/verify-plan-a.sh" --repo "$REPO" --staging "$STAGING"; then
  warn "post-apply verification FAILED; restore with: git -C \"$REPO\" apply -R \"$PATCH\""
  exit 1
fi

# Fetch-script static sanity: syntax is unchanged, but the archive URL now serves
# the new bytes; reproducibility gates are owner-run (network + build).
bash -n "$REPO/$PIN_FETCH" || die "fetch script syntax check failed"

cat <<'GATES'

Plan A applied and statically verified. Remaining OWNER-GATED steps (not run here):
  1. Inspect: git -C <repo> diff --stat; review plan-a-adoption.patch + plan-a-replacements.tsv.
  2. Commit exactly once, e.g.:
       git -C <repo> add <six files>
       git -C <repo> commit -m "Adopt Parakeet TDT 0.6B v3 int8 replacement (sha256-2)"
  3. Reproducibility: run android/kokoro-poc/scripts/fetch-parakeet-assets.sh twice
     (upstream URL now serves the new archive) and confirm staged hashes unchanged.
  4. Build: ./gradlew :parakeet-assets:verifyParakeetAssets :app:bundleRelease
     (and ParakeetModelAssetsTest); verify AAB asset-pack member digests = new hashes.
  5. CI: model-dependent + aggregate jobs green on the pin-change branch.
  6. Device: on-device parity/integrity/performance matrix on arm64-v8a API>=29
     with the shipped patched AAR + ORT 1.28.2 (round3 A2/A5 gates).
  7. Evidence: record owner approval + results; keep the old archive untouched.
GATES
