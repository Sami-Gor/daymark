import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * These tests execute the same guard that Gradle runs before asset merging.
 * Fixtures are real directories, so the stale/missing/obsolete failure modes
 * are exercised end to end rather than through a helper-only assertion.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const guardScript = path.join(projectRoot, 'scripts/verify-android-web-assets.mjs');
const temporaryDirectories: string[] = [];

const baseFiles = {
  'index.html': '<!doctype html><title>Daymark</title>',
  'assets/index-current.js': 'console.log("current");\n',
  'assets/index-current.css': 'body { color: #123; }\n',
  'assets/font.woff2': 'font-bytes',
};

async function fixture(files: Record<string, string>, androidFiles: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'daymark-web-assets-'));
  temporaryDirectories.push(root);
  const dist = path.join(root, 'dist');
  const android = path.join(root, 'android');
  for (const [directory, contents] of [
    [dist, files],
    [android, { ...files, 'cordova.js': '', 'cordova_plugins.js': '', ...androidFiles }],
  ] as const) {
    for (const [relative, content] of Object.entries(contents)) {
      const destination = path.join(directory, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
  }
  return { root, dist, android };
}

function runGuard(dist: string, android: string) {
  return spawnSync(process.execPath, [guardScript, '--dist', dist, '--android', android], {
    encoding: 'utf8',
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Android web asset guard', () => {
  it('passes when dist and copied Android assets match', async () => {
    const { dist, android } = await fixture(baseFiles);
    const result = runGuard(dist, android);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS:');
  });

  it('fails when a current web file is missing from Android', async () => {
    const { dist, android } = await fixture(baseFiles);
    await rm(path.join(android, 'assets/index-current.css'));
    const result = runGuard(dist, android);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing from Android assets: assets/index-current.css');
  });

  it('fails when a copied file has stale content', async () => {
    const { dist, android } = await fixture(baseFiles);
    await writeFile(path.join(android, 'index.html'), 'stale index');
    const result = runGuard(dist, android);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('content mismatch: index.html');
  });

  it('fails when a new hashed bundle is present in dist but Android still has the old bundle', async () => {
    const { dist, android } = await fixture({
      ...baseFiles,
      'assets/index-new.js': 'console.log("new");\n',
    });
    await rm(path.join(android, 'assets/index-new.js'));
    await writeFile(path.join(android, 'assets/index-old.js'), 'console.log("old");\n');
    const result = runGuard(dist, android);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing from Android assets: assets/index-new.js');
    expect(result.stderr).toContain('unexpected/obsolete file in Android assets: assets/index-old.js');
  });

  it('fails when an obsolete hashed bundle remains in Android', async () => {
    const { dist, android } = await fixture(baseFiles, {
      'assets/index-obsolete.css': 'body { color: red; }\n',
    });
    const result = runGuard(dist, android);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected/obsolete file in Android assets: assets/index-obsolete.css');
  });

  it('wires the guard into Android packaging, including direct merge tasks', async () => {
    const gradle = await readFile(path.join(projectRoot, 'android/app/build.gradle'), 'utf8');
    expect(gradle).toMatch(/tasks\.named\(['"]preBuild['"]\)\.configure\s*\{[\s\S]*?dependsOn\s+tasks\.named\(['"]verifyWebAssets['"]\)/);
    expect(gradle).toMatch(/mergeDebugAssets[\s\S]*?mergeReleaseAssets[\s\S]*?verifyWebAssets/);
  });
});
