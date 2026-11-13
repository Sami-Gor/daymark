#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

const ZERO_SHA = '0000000000000000000000000000000000000000';

// Exact CI-control-plane allow-list. There are deliberately no directory globs.
// The exemption is valid only when the complete changed set is exactly these
// files; any other path forces model validation.
export const CI_CONTROL_PLANE_PATHS = [
  '.github/workflows/ci.yml',
  'scripts/ci/classify-model-dependency.mjs',
  'scripts/ci/classify-model-dependency.test.mjs',
  'scripts/ci/validate-docs.mjs',
];
const CI_CONTROL_PLANE_SET = new Set(CI_CONTROL_PLANE_PATHS);

export const EXEMPTION_REASON_CODE = 'ci-control-plane-exact-allowlist';
export const INDEPENDENT_REASON_CODE = 'independent-path';
export const MODEL_REQUIRED_REASON_CODES = [
  'model-dependent-path',
  'unclassified-path',
  'ci-path-not-exact-allowlist',
  'invalid-path',
  'empty-diff',
  'invalid-input',
  'diff-error',
  'comparison-error',
  'new-branch-no-comparison',
];

// Model-dependent: model, runtime, fetch scripts, shared voice paths and the
// CI/classifier itself. CI/classifier changes must never weaken the gate.
const MODEL_RULES = [
  ['CI/classifier configuration', /^(?:\.github\/|scripts\/ci\/)/],
  ['Parakeet/model/runtime scripts', /^android\/kokoro-poc\//],
  ['shared voice module', /^artifacts\/weather-app\/android\/daymark-voice\/(?!libs\/.*\.aar$)/],
  ['Parakeet asset pack', /^artifacts\/weather-app\/android\/parakeet-assets\//],
  ['Android packaging/voice build wiring', /^artifacts\/weather-app\/android\/(?:app\/build\.gradle|settings\.gradle|build\.gradle|variables\.gradle|gradlew(?:\.bat)?|gradle\/wrapper\/)/],
  ['N1 voice source/tests', /^artifacts\/weather-app\/src\/lib\/(?:android-voice|voice-input-native|daymark-voice)/],
];

// Independent: documentation, N3 AAR, N4 integrity and non-voice app paths.
const DOC_RULES = [
  ['docs-only', /^docs\//],
  ['docs-only', /\.md$/],
  ['docs-only', /^(?:README|SECURITY|THIRD-PARTY-NOTICES)\.md$/],
  ['docs-only', /^LICENSE$/],
];

const N3_RULES = [
  ['N3 AAR', /^artifacts\/weather-app\/android\/daymark-voice\/libs\/[^/]+\.aar$/],
];

const N4_RULES = [
  ['N4 integrity', /^artifacts\/weather-app\/android\/daymark-voice\/sherpa-aar\.sha256$/],
  ['N4 integrity', /^artifacts\/weather-app\/android\/gradle\/sherpa-aar-integrity\.gradle$/],
  ['N4 integrity', /^artifacts\/weather-app\/android\/tools\/sherpa-aar-integrity\//],
];

const APP_INDEPENDENT_RULES = [
  ['temperature-unit/unrelated app', /^artifacts\/weather-app\/(?:src|tests|public|scripts)\//],
  ['temperature-unit/unrelated app', /^artifacts\/weather-app\/(?:index\.html|vite\.config\.ts|vitest\.config\.ts|tsconfig[^/]*\.json|capacitor\.config\.ts)$/],
];

function firstMatch(rules, file) {
  for (const [label, pattern] of rules) {
    if (pattern.test(file)) return label;
  }
  return null;
}

function summarize(paths, limit = 6) {
  const shown = paths.slice(0, limit).join(', ');
  return paths.length > limit ? shown + ' (+' + (paths.length - limit) + ' more)' : shown;
}

export function invalidPathReason(file) {
  if (typeof file !== 'string') return 'not a string';
  if (file.length === 0) return 'empty path';
  if (/[\s]/.test(file)) return 'whitespace in path';
  if (/[\x00-\x1f\x7f]/.test(file)) return 'control character in path';
  if (/[^\x20-\x7e]/.test(file)) return 'non-ASCII or unusual character in path';
  if (file.includes('\\')) return 'backslash in path';
  if (file.startsWith('/') || file.startsWith('~')) return 'absolute or tilde path';
  if (/^[A-Za-z]:/.test(file)) return 'drive-letter path';
  const segments = file.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'empty, dot, or parent path segment';
  }
  return null;
}

export function validateRawPath(file) {
  const reason = invalidPathReason(file);
  return { valid: reason === null, reason };
}

function decision(modelRequired, reasonCode, reason, extra = {}) {
  return {
    model_required: modelRequired,
    reason_code: reasonCode,
    reason,
    model_paths: [],
    independent_paths: [],
    unclassified_paths: [],
    ci_control_plane_exempt: false,
    exemption_verified: false,
    ...extra,
  };
}

export function parseNameStatusZ(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('git diff output is not a buffer');
  if (buffer.length === 0) return [];
  if (buffer[buffer.length - 1] !== 0) throw new Error('git diff output has an incomplete NUL-terminated record');

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new Error('git diff output contains invalid UTF-8');
  }

  const records = text.split('\0');
  records.pop(); // trailing NUL
  if (records.length % 2 !== 0) throw new Error('git diff output has an incomplete name-status record');

  const paths = [];
  for (let index = 0; index < records.length; index += 2) {
    const status = records[index];
    const file = records[index + 1];
    if (!/^[ADMTUXB]$/.test(status)) throw new Error('unexpected git diff status: ' + status);
    if (typeof file !== 'string' || file.length === 0) throw new Error('empty path in git diff record');
    const validation = validateRawPath(file);
    if (!validation.valid) throw new Error('invalid git diff path: ' + validation.reason);
    paths.push(file);
  }

  if (new Set(paths).size !== paths.length) throw new Error('duplicate or ambiguous git diff path');
  return paths;
}

export function classifyPaths(changedPaths) {
  if (!Array.isArray(changedPaths)) {
    return decision(true, 'invalid-input', 'changed paths are not an array; failing closed');
  }

  if (changedPaths.length === 0) {
    return decision(true, 'empty-diff', 'no changed paths were detected; failing closed and requiring model validation');
  }

  const invalidPaths = [];
  for (const file of changedPaths) {
    const validation = validateRawPath(file);
    if (!validation.valid) invalidPaths.push({ file, reason: validation.reason });
  }
  if (invalidPaths.length > 0) {
    return decision(
      true,
      'invalid-path',
      'invalid or unusual path record(s) require model validation (fail closed): ' + summarize(invalidPaths.map((entry) => String(entry.file) + ' [' + entry.reason + ']')),
      { unclassified_paths: invalidPaths.map((entry) => String(entry.file)) },
    );
  }

  if (new Set(changedPaths).size !== changedPaths.length) {
    return decision(true, 'invalid-path', 'duplicate or ambiguous changed path records require model validation (fail closed)');
  }

  const allowlistedPaths = changedPaths.filter((file) => CI_CONTROL_PLANE_SET.has(file));
  if (allowlistedPaths.length > 0) {
    const exactAllowlist = changedPaths.length === CI_CONTROL_PLANE_PATHS.length
      && CI_CONTROL_PLANE_PATHS.every((file) => changedPaths.includes(file));
    if (exactAllowlist) {
      return decision(
        false,
        EXEMPTION_REASON_CODE,
        'complete changed set is exactly the CI-control-plane allow-list; model validation is not applicable',
        {
          independent_paths: changedPaths.slice(),
          ci_control_plane_exempt: true,
        },
      );
    }
    const nonAllowlisted = changedPaths.filter((file) => !CI_CONTROL_PLANE_SET.has(file));
    return decision(
      true,
      'ci-path-not-exact-allowlist',
      'CI-control-plane path changed without the complete exact allow-list set; model validation is required (non-allow-listed: ' + summarize(nonAllowlisted) + ')',
      { model_paths: nonAllowlisted },
    );
  }

  const modelPaths = [];
  const independentPaths = [];
  const unclassifiedPaths = [];

  for (const file of changedPaths) {
    if (firstMatch(DOC_RULES, file) || firstMatch(N3_RULES, file) || firstMatch(N4_RULES, file)) {
      independentPaths.push(file);
      continue;
    }
    if (firstMatch(MODEL_RULES, file)) {
      modelPaths.push(file);
      continue;
    }
    if (firstMatch(APP_INDEPENDENT_RULES, file)) {
      independentPaths.push(file);
      continue;
    }
    unclassifiedPaths.push(file);
  }

  if (modelPaths.length > 0) {
    return decision(
      true,
      'model-dependent-path',
      'model-dependent path(s) changed: ' + summarize(modelPaths) + '; model validation is required',
      { model_paths: modelPaths, independent_paths: independentPaths, unclassified_paths: unclassifiedPaths },
    );
  }

  if (unclassifiedPaths.length > 0) {
    return decision(
      true,
      'unclassified-path',
      'unclassified path(s) require model validation (fail closed): ' + summarize(unclassifiedPaths),
      { independent_paths: independentPaths, unclassified_paths: unclassifiedPaths },
    );
  }

  return decision(
    false,
    'independent-path',
    'all changed paths are independent (docs, N3 AAR, N4 integrity, temperature-unit, or unrelated app)',
    { independent_paths: independentPaths },
  );
}

function isZeroSha(value) {
  return !value || value === ZERO_SHA || /^0+$/.test(value);
}

export function resolveComparison(input) {
  const event = input.event;

  if (event === 'pull_request') {
    if (!input.prBase || !input.prHead || isZeroSha(input.prBase) || isZeroSha(input.prHead)) {
      return { ok: false, reason: 'pull_request event has a missing or zero base/head SHA; failing closed' };
    }
    return { ok: true, mode: 'pull_request', base: input.prBase, head: input.prHead };
  }

  if (event === 'push') {
    if (!input.pushHead || isZeroSha(input.pushHead)) {
      return { ok: false, reason: 'push event has a missing or zero head SHA; failing closed' };
    }
    if (isZeroSha(input.pushBefore)) {
      return {
        ok: true,
        mode: 'push-new-branch',
        base: null,
        head: input.pushHead,
        failClosedReason: 'push before SHA is all zeros (new branch); comparison is unavailable, so model validation is required',
      };
    }
    return { ok: true, mode: 'push', base: input.pushBefore, head: input.pushHead };
  }

  return { ok: false, reason: 'unsupported event "' + String(event || '') + '"; failing closed' };
}

function gitText(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function gitBuffer(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: null, maxBuffer: 20 * 1024 * 1024 });
}

export function changedFilesForComparison(comparison, cwd = process.cwd()) {
  if (!comparison || comparison.ok !== true) throw new Error('comparison is not available');
  if (comparison.mode === 'pull_request') {
    const mergeBase = gitText(['merge-base', comparison.base, comparison.head], cwd);
    if (!mergeBase) throw new Error('no merge base found for pull request');
    return parseNameStatusZ(gitBuffer([
      'diff',
      '--name-status',
      '-z',
      '--no-renames',
      '--diff-filter=ACDMRTUXB',
      mergeBase,
      comparison.head,
    ], cwd));
  }
  return parseNameStatusZ(gitBuffer([
    'diff',
    '--name-status',
    '-z',
    '--no-renames',
    '--diff-filter=ACDMRTUXB',
    comparison.base,
    comparison.head,
  ], cwd));
}


export function evaluateGuard(classification, changedPaths) {
  if (!classification || typeof classification !== 'object') throw new Error('classifier output is missing or malformed');
  if (!Array.isArray(changedPaths)) throw new Error('guard diff paths are malformed');

  const exactAllowlist = changedPaths.length === CI_CONTROL_PLANE_PATHS.length
    && CI_CONTROL_PLANE_PATHS.every((file) => changedPaths.includes(file));
  const reason = typeof classification.reason === 'string' ? classification.reason.trim() : '';
  if (!reason) throw new Error('classifier reason is missing or empty');

  if (classification.model_required === false) {
    if (classification.reason_code === EXEMPTION_REASON_CODE) {
      if (classification.ci_control_plane_exempt !== true) {
        throw new Error('classifier exemption flag is inconsistent with model_required=false');
      }
      if (!exactAllowlist) {
        throw new Error('guard independently rejected exemption: changed set is not the exact allow-list');
      }
      return {
        model_required: false,
        reason_code: EXEMPTION_REASON_CODE,
        reason,
        exemption_verified: true,
        decision_verified: true,
      };
    }
    if (classification.reason_code === INDEPENDENT_REASON_CODE) {
      if (classification.ci_control_plane_exempt === true) {
        throw new Error('independent-path decision is inconsistent with an exemption flag');
      }
      return {
        model_required: false,
        reason_code: INDEPENDENT_REASON_CODE,
        reason,
        exemption_verified: false,
        decision_verified: true,
      };
    }
    throw new Error('classifier model_required=false reason_code is missing, empty, or unrecognized');
  }

  if (classification.model_required === true) {
    if (!MODEL_REQUIRED_REASON_CODES.includes(classification.reason_code)) {
      throw new Error('classifier model-required reason_code is missing, empty, or unrecognized');
    }
    if (classification.ci_control_plane_exempt === true) {
      throw new Error('classifier model-required decision is inconsistent with exemption flag');
    }
    return {
      model_required: true,
      reason_code: classification.reason_code,
      reason,
      exemption_verified: false,
      decision_verified: true,
    };
  }

  throw new Error('classifier model_required is missing or not boolean');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        args[key] = 'true';
      } else {
        args[key] = value;
        i += 1;
      }
    }
  }
  return args;
}

function emitPayload(payload, outputPath, githubOutputPath) {
  const text = JSON.stringify(payload, null, 2);
  if (outputPath) writeFileSync(outputPath, text + '\n');
  console.log(text);
  if (githubOutputPath) {
    const reason = String(payload.reason || '').replace(/\s+/g, ' ').trim();
    appendFileSync(githubOutputPath, 'model_required=' + String(payload.model_required) + '\n');
    appendFileSync(githubOutputPath, 'reason=' + reason + '\n');
    appendFileSync(githubOutputPath, 'reason_code=' + String(payload.reason_code || '') + '\n');
    appendFileSync(githubOutputPath, 'exemption_verified=' + String(payload.exemption_verified) + '\n');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const comparison = resolveComparison({
    event: args.event,
    prBase: args.base,
    prHead: args.head,
    pushBefore: args.before,
    pushHead: args['push-head'],
  });

  if (!comparison.ok) {
    emitPayload({
      event: args.event || '',
      mode: 'error',
      base: args.base || args.before || '',
      head: args.head || args['push-head'] || '',
      changed_files: [],
      model_required: true,
      reason_code: 'comparison-error',
      reason: comparison.reason,
      model_paths: [],
      independent_paths: [],
      unclassified_paths: [],
      ci_control_plane_exempt: false,
      exemption_verified: false,
    }, args.output, args['github-output']);
    process.exitCode = 2;
    return;
  }

  if (comparison.failClosedReason) {
    emitPayload({
      event: args.event,
      mode: comparison.mode,
      base: comparison.base || '',
      head: comparison.head,
      changed_files: [],
      model_required: true,
      reason_code: 'new-branch-no-comparison',
      reason: comparison.failClosedReason,
      model_paths: [],
      independent_paths: [],
      unclassified_paths: [],
      ci_control_plane_exempt: false,
      exemption_verified: false,
    }, args.output, args['github-output']);
    return;
  }

  let changedFiles;
  try {
    changedFiles = changedFilesForComparison(comparison);
  } catch (error) {
    emitPayload({
      event: args.event,
      mode: comparison.mode,
      base: comparison.base,
      head: comparison.head,
      changed_files: [],
      model_required: true,
      reason_code: 'diff-error',
      reason: 'could not parse base/head diff; failing closed: ' + String(error && error.message ? error.message : error),
      model_paths: [],
      independent_paths: [],
      unclassified_paths: [],
      ci_control_plane_exempt: false,
      exemption_verified: false,
    }, args.output, args['github-output']);
    process.exitCode = 2;
    return;
  }

  const classified = classifyPaths(changedFiles);
  emitPayload({
    event: args.event,
    mode: comparison.mode,
    base: comparison.base,
    head: comparison.head,
    changed_files: changedFiles,
    ...classified,
  }, args.output, args['github-output']);
}

if (process.argv[1] && process.argv[1].endsWith('classify-model-dependency.mjs')) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 2;
  });
}
