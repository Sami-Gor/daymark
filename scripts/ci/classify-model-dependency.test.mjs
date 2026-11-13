import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CI_CONTROL_PLANE_PATHS,
  EXEMPTION_REASON_CODE,
  changedFilesForComparison,
  classifyPaths,
  evaluateGuard,
  parseNameStatusZ,
  resolveComparison,
} from './classify-model-dependency.mjs';

const ZERO = '0000000000000000000000000000000000000000';

test('temperature-only PR is independent', () => {
  const result = classifyPaths(['artifacts/weather-app/src/lib/unit-preference.ts']);
  assert.equal(result.model_required, false);
  assert.deepEqual(result.independent_paths, ['artifacts/weather-app/src/lib/unit-preference.ts']);
});

test('docs-only PR is independent', () => {
  const result = classifyPaths(['docs/release/parakeet-v3-android-phone-evaluation.md', 'README.md']);
  assert.equal(result.model_required, false);
  assert.equal(result.model_paths.length, 0);
});

test('N3-only AAR PR is independent', () => {
  const result = classifyPaths(['artifacts/weather-app/android/daymark-voice/libs/sherpa-onnx-1.13.8-daymark-cve-2026-108954.aar']);
  assert.equal(result.model_required, false);
});

test('N4-only integrity PR is independent', () => {
  const result = classifyPaths([
    'artifacts/weather-app/android/daymark-voice/sherpa-aar.sha256',
    'artifacts/weather-app/android/gradle/sherpa-aar-integrity.gradle',
  ]);
  assert.equal(result.model_required, false);
});

test('N1 model-dependent voice change requires model validation', () => {
  const result = classifyPaths(['artifacts/weather-app/src/lib/android-voice-model-loading.test.ts']);
  assert.equal(result.model_required, true);
  assert.equal(result.model_paths.length, 1);
});

test('fetch-script change requires model validation', () => {
  const result = classifyPaths(['android/kokoro-poc/scripts/fetch-parakeet-assets.sh']);
  assert.equal(result.model_required, true);
});

test('shared voice/runtime change requires model validation', () => {
  const result = classifyPaths([
    'android/kokoro-poc/sherpa-onnx-cve-2026-108954/SHA256SUMS',
    'artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/ParakeetModelAssets.java',
  ]);
  assert.equal(result.model_required, true);
});

test('mixed docs and model PR requires model validation', () => {
  const result = classifyPaths([
    'docs/release/parakeet-v3-android-phone-evaluation.md',
    'android/kokoro-poc/scripts/fetch-parakeet-assets.sh',
  ]);
  assert.equal(result.model_required, true);
});

test('unknown path fails closed', () => {
  const result = classifyPaths(['mystery/path.bin']);
  assert.equal(result.model_required, true);
  assert.deepEqual(result.unclassified_paths, ['mystery/path.bin']);
});

test('CI-config change requires model validation', () => {
  const result = classifyPaths(['.github/workflows/ci.yml']);
  assert.equal(result.model_required, true);
});

test('classifier change itself cannot bypass model validation', () => {
  const result = classifyPaths(['scripts/ci/classify-model-dependency.mjs']);
  assert.equal(result.model_required, true);
});

test('empty change set fails closed', () => {
  const result = classifyPaths([]);
  assert.equal(result.model_required, true);
});

test('pull request comparison uses pull_request base/head SHAs', () => {
  const comparison = resolveComparison({
    event: 'pull_request',
    prBase: 'base-sha',
    prHead: 'head-sha',
    pushBefore: '',
    pushHead: '',
  });
  assert.equal(comparison.ok, true);
  assert.equal(comparison.mode, 'pull_request');
  assert.equal(comparison.base, 'base-sha');
  assert.equal(comparison.head, 'head-sha');
});

test('push comparison uses event before and head SHAs', () => {
  const comparison = resolveComparison({
    event: 'push',
    prBase: '',
    prHead: '',
    pushBefore: 'before-sha',
    pushHead: 'head-sha',
  });
  assert.equal(comparison.ok, true);
  assert.equal(comparison.mode, 'push');
  assert.equal(comparison.base, 'before-sha');
  assert.equal(comparison.head, 'head-sha');
});

test('new-branch push fails closed to model validation', () => {
  const comparison = resolveComparison({
    event: 'push',
    prBase: '',
    prHead: '',
    pushBefore: ZERO,
    pushHead: 'head-sha',
  });
  assert.equal(comparison.ok, true);
  assert.equal(comparison.mode, 'push-new-branch');
  assert.match(comparison.failClosedReason, /model validation is required/);
});


test('exact CI-control-plane allow-list is model-exempt', () => {
  const result = classifyPaths(CI_CONTROL_PLANE_PATHS);
  assert.equal(result.model_required, false);
  assert.equal(result.ci_control_plane_exempt, true);
});

test('allow-list plus application path requires model validation', () => {
  const result = classifyPaths([...CI_CONTROL_PLANE_PATHS, 'artifacts/weather-app/src/App.tsx']);
  assert.equal(result.model_required, true);
  assert.deepEqual(result.unclassified_paths, []);
  assert.deepEqual(result.model_paths, ['artifacts/weather-app/src/App.tsx']);
});

test('non-allow-listed CI script requires model validation', () => {
  const result = classifyPaths(['scripts/ci/another-ci-script.mjs']);
  assert.equal(result.model_required, true);
});

test('malformed path input fails closed', () => {
  assert.equal(classifyPaths(null).model_required, true);
  assert.equal(classifyPaths(['']).model_required, true);
  assert.equal(classifyPaths(['   ']).model_required, true);
});

test('path with spaces or unusual characters fails closed', () => {
  const result = classifyPaths(['docs/read me.md']);
  assert.equal(result.model_required, true);
  assert.equal(result.ci_control_plane_exempt, false);
});

test('zero pull request base SHA fails closed', () => {
  const comparison = resolveComparison({
    event: 'pull_request',
    prBase: ZERO,
    prHead: 'head-sha',
    pushBefore: '',
    pushHead: '',
  });
  assert.equal(comparison.ok, false);
});
test('missing pull request base SHA fails closed', () => {
  const comparison = resolveComparison({
    event: 'pull_request',
    prBase: '',
    prHead: 'head-sha',
    pushBefore: '',
    pushHead: '',
  });
  assert.equal(comparison.ok, false);
});

function createRepo() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'daymark-classifier-'));
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git(['init', '-q']);
  git(['config', 'user.email', 'ci@example.test']);
  git(['config', 'user.name', 'CI']);
  git(['commit', '--allow-empty', '-qm', 'base']);
  return { repo, git, base: git(['rev-parse', 'HEAD']) };
}

function write(repo, file, content = 'x') {
  const full = path.join(repo, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function commit(git, message) {
  git(['add', '-A']);
  git(['commit', '-qm', message]);
  return git(['rev-parse', 'HEAD']);
}

function changed(repo, base, head) {
  return changedFilesForComparison({ ok: true, mode: 'push', base, head }, repo);
}

const ALLOW = CI_CONTROL_PLANE_PATHS;
const CLASSIFIER_CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'classify-model-dependency.mjs');

test('raw NUL parser accepts a complete name-status record', () => {
  assert.deepEqual(parseNameStatusZ(Buffer.from('A\0docs/a.md\0')), ['docs/a.md']);
});

test('raw NUL parser rejects missing trailing NUL', () => {
  assert.throws(() => parseNameStatusZ(Buffer.from('A\0docs/a.md')), /incomplete/);
});

test('raw NUL parser rejects invalid UTF-8', () => {
  assert.throws(() => parseNameStatusZ(Buffer.from([0x41, 0x00, 0xff, 0x00])), /invalid UTF-8/);
});

test('raw NUL parser rejects empty and malformed records', () => {
  assert.throws(() => parseNameStatusZ(Buffer.from('A\0\0')), /empty path/);
  assert.throws(() => parseNameStatusZ(Buffer.from('R\0old\0')), /unexpected git diff status/);
});

test('raw NUL parser rejects absolute, parent and unusual raw paths', () => {
  for (const raw of ['A\0/docs/a\0', 'A\0docs/../secret\0', 'A\0~/secret\0', 'A\0C:/secret\0', 'A\0docs/café.md\0']) {
    assert.throws(() => parseNameStatusZ(Buffer.from(raw)), /invalid git diff path/);
  }
});

test('classifier rejects raw-path whitespace, controls, backslashes and parent segments', () => {
  const invalid = [
    ' leading.md',
    'trailing.md ',
    'tab\tname.md',
    'line\nbreak.md',
    'cr\rname.md',
    '',
    'back\\slash.md',
    'docs/../secret.md',
    '/absolute.md',
    '~/tilde.md',
    'C:/drive.md',
    'docs/café.md',
    ' .github/workflows/ci.yml',
    '.github/workflows/ci.yml ',
  ];
  for (const file of invalid) {
    const result = classifyPaths([file]);
    assert.equal(result.model_required, true);
    assert.equal(result.reason_code, 'invalid-path');
  }
});

test('rename model fetch script into allowlisted docs script while other allow-list files change requires model validation', () => {
  const { repo, git, base } = createRepo();
  try {
    const model = 'android/kokoro-poc/scripts/fetch-parakeet-assets.sh';
    write(repo, model);
    for (const file of ['.github/workflows/ci.yml', 'scripts/ci/classify-model-dependency.mjs', 'scripts/ci/classify-model-dependency.test.mjs']) write(repo, file);
    const baseline = commit(git, 'baseline');
    mkdirSync(path.join(repo, 'scripts/ci'), { recursive: true });
    renameSync(path.join(repo, model), path.join(repo, 'scripts/ci/validate-docs.mjs'));
    for (const file of ['.github/workflows/ci.yml', 'scripts/ci/classify-model-dependency.mjs', 'scripts/ci/classify-model-dependency.test.mjs']) write(repo, file, 'changed');
    const head = commit(git, 'rename and modify');
    const paths = changed(repo, baseline, head);
    assert.equal(paths.includes(model), true);
    const result = classifyPaths(paths);
    assert.equal(result.model_required, true);
    assert.equal(result.reason_code, 'ci-path-not-exact-allowlist');
    const guarded = evaluateGuard(result, paths);
    assert.equal(guarded.model_required, true);
    assert.equal(guarded.exemption_verified, false);
    assert.equal(guarded.decision_verified, true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('allowlist script renamed into the model path requires model validation', () => {
  const { repo, git } = createRepo();
  try {
    for (const file of ALLOW) write(repo, file);
    const baseline = commit(git, 'allowlist baseline');
    mkdirSync(path.join(repo, 'android/kokoro-poc/scripts'), { recursive: true });
    renameSync(path.join(repo, 'scripts/ci/validate-docs.mjs'), path.join(repo, 'android/kokoro-poc/scripts/fetch-parakeet-assets.sh'));
    const head = commit(git, 'rename allowlist to model');
    const result = classifyPaths(changed(repo, baseline, head));
    assert.equal(result.model_required, true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('allowlist plus another app change requires model validation', () => {
  const { repo, git, base } = createRepo();
  try {
    for (const file of ALLOW) write(repo, file);
    const baseline = commit(git, 'allowlist baseline');
    write(repo, 'scripts/ci/validate-docs.mjs', 'changed');
    write(repo, 'artifacts/weather-app/src/App.tsx');
    const head = commit(git, 'allowlist plus app');
    const result = classifyPaths(changed(repo, baseline, head));
    assert.equal(result.model_required, true);
    assert.equal(result.reason_code, 'ci-path-not-exact-allowlist');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('model rename plus all four allow-list files modified requires model validation', () => {
  const { repo, git } = createRepo();
  try {
    const model = 'android/kokoro-poc/scripts/fetch-parakeet-assets.sh';
    write(repo, model);
    for (const file of ALLOW) write(repo, file);
    const baseline = commit(git, 'baseline');
    mkdirSync(path.join(repo, 'docs'), { recursive: true });
    renameSync(path.join(repo, model), path.join(repo, 'docs/model.md'));
    for (const file of ALLOW) write(repo, file, 'changed');
    const head = commit(git, 'model rename plus allowlist');
    const result = classifyPaths(changed(repo, baseline, head));
    assert.equal(result.model_required, true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('add delete modify in a real diff remains model-required when the allow-list is not exact', () => {
  const { repo, git } = createRepo();
  try {
    for (const file of ALLOW) write(repo, file);
    const baseline = commit(git, 'allowlist baseline');
    write(repo, '.github/workflows/ci.yml', 'changed');
    rmSync(path.join(repo, 'scripts/ci/classify-model-dependency.test.mjs'));
    write(repo, 'scripts/ci/another-ci-script.mjs');
    const head = commit(git, 'add delete modify');
    const result = classifyPaths(changed(repo, baseline, head));
    assert.equal(result.model_required, true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('real exact four-file allow-list diff is model-exempt with a machine reason', () => {
  const { repo, git, base } = createRepo();
  try {
    for (const file of ALLOW) write(repo, file);
    const head = commit(git, 'exact allowlist');
    const paths = changed(repo, base, head);
    assert.deepEqual(paths.sort(), ALLOW.slice().sort());
    const result = classifyPaths(paths);
    assert.equal(result.model_required, false);
    assert.equal(result.reason_code, EXEMPTION_REASON_CODE);
    assert.equal(result.ci_control_plane_exempt, true);
    assert.equal(result.exemption_verified, false);
    const guarded = evaluateGuard(result, paths);
    assert.equal(guarded.model_required, false);
    assert.equal(guarded.reason_code, EXEMPTION_REASON_CODE);
    assert.equal(guarded.exemption_verified, true);
    assert.equal(guarded.decision_verified, true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('real diffs with unusual filenames fail closed before classification', () => {
  for (const filename of [' leading.md', 'trailing.md ', 'tab\tname.md', 'line\nbreak.md', 'cr\rname.md', 'back\\slash.md']) {
    const { repo, git, base } = createRepo();
    try {
      write(repo, filename);
      const head = commit(git, 'unusual filename');
      assert.throws(() => changed(repo, base, head), /invalid|incomplete|UTF-8/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

test('classifier CLI exits closed on an invalid raw filename diff', () => {
  const { repo, git, base } = createRepo();
  try {
    write(repo, 'line\nbreak.md');
    const head = commit(git, 'invalid filename');
    const result = spawnSync(
      process.execPath,
      [CLASSIFIER_CLI, '--event', 'push', '--before', base, '--push-head', head, '--output', 'classification.json'],
      { cwd: repo, encoding: 'utf8' },
    );
    assert.equal(result.status, 2);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.model_required, true);
    assert.equal(payload.reason_code, 'diff-error');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('real diff with an unknown CI script requires model validation', () => {
  const { repo, git, base } = createRepo();
  try {
    write(repo, 'scripts/ci/another-ci-script.mjs');
    const head = commit(git, 'unknown ci script');
    const result = classifyPaths(changed(repo, base, head));
    assert.equal(result.model_required, true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('guard rejects missing, empty and unknown exemption reasons', () => {
  const exact = classifyPaths(ALLOW);
  assert.throws(() => evaluateGuard({ ...exact, reason: '' }, ALLOW), /reason is missing/);
  assert.throws(() => evaluateGuard({ ...exact, reason: undefined }, ALLOW), /reason is missing/);
  assert.throws(() => evaluateGuard({ ...exact, reason_code: 'unknown-code' }, ALLOW), /reason_code/);
  assert.throws(() => evaluateGuard({ ...exact, ci_control_plane_exempt: false }, ALLOW), /inconsistent/);
  assert.throws(() => evaluateGuard(null, ALLOW), /missing or malformed/);
});

test('guard accepts a verified independent-path not-applicable decision without an exemption', () => {
  const independent = classifyPaths(['docs/readme.md']);
  assert.equal(independent.model_required, false);
  assert.equal(independent.reason_code, 'independent-path');
  const guarded = evaluateGuard(independent, ['docs/readme.md']);
  assert.equal(guarded.model_required, false);
  assert.equal(guarded.reason_code, 'independent-path');
  assert.equal(guarded.exemption_verified, false);
  assert.equal(guarded.decision_verified, true);
});

test('guard rejects an exemption when the changed set is not the exact allow-list', () => {
  const exact = classifyPaths(ALLOW);
  assert.throws(() => evaluateGuard(exact, ['docs/readme.md']), /exact allow-list/);
});

test('guard rejects inconsistent model-required exemptions and reasons', () => {
  assert.throws(
    () => evaluateGuard({ model_required: true, reason_code: 'model-dependent-path', reason: 'x', ci_control_plane_exempt: true }, ['docs/readme.md']),
    /inconsistent/,
  );
  assert.throws(
    () => evaluateGuard({ model_required: true, reason_code: 'made-up', reason: 'x', ci_control_plane_exempt: false }, ['docs/readme.md']),
    /reason_code/,
  );
  const guarded = evaluateGuard({ model_required: true, reason_code: 'model-dependent-path', reason: 'x', ci_control_plane_exempt: false }, ['docs/readme.md']);
  assert.equal(guarded.model_required, true);
  assert.equal(guarded.exemption_verified, false);
});

test('real diff with an unrelated app path is independent', () => {
  const { repo, git, base } = createRepo();
  try {
    write(repo, 'artifacts/weather-app/src/App.tsx');
    const head = commit(git, 'app change');
    const result = classifyPaths(changed(repo, base, head));
    assert.equal(result.model_required, false);
    assert.equal(result.reason_code, 'independent-path');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

