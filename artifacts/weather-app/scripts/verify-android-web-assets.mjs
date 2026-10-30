#!/usr/bin/env node
/*
 * Verify that the web bundle packaged into Android is exactly the current
 * Vite build.
 *
 * `cap copy`/`cap sync` writes `dist/public` into
 * `android/app/src/main/assets/public`. Capacitor also adds two generated
 * bridge files, which are the only files allowed to exist outside the current
 * `dist/public` inventory. Everything else — including an old hashed JS/CSS
 * bundle — is stale and fails this check.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const generatedExtras = new Set(['cordova.js', 'cordova_plugins.js']);

function usage() {
  console.error(
    'Usage: node scripts/verify-android-web-assets.mjs ' +
      '[--dist <dist/public>] [--android <android/app/src/main/assets/public>]',
  );
}

function readArgs(argv) {
  const args = {
    dist: path.join(projectRoot, 'dist/public'),
    android: path.join(projectRoot, 'android/app/src/main/assets/public'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dist' || arg === '--android') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      args[arg.slice(2)] = path.resolve(value);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function inventory(root, label) {
  const files = new Map();
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      throw new Error(`${label} directory is missing or unreadable: ${directory}`);
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const relative = path.relative(root, full).split(path.sep).join('/');
        files.set(relative, await sha256(full));
      } else {
        throw new Error(`${label} contains an unsupported filesystem entry: ${full}`);
      }
    }
  }
  await walk(root);
  return files;
}

function describe(errors) {
  const lines = [
    `FAIL: Android web assets do not match the current web build (${errors.length} issue${errors.length === 1 ? '' : 's'}).`,
  ];
  for (const error of errors) lines.push(`  - ${error}`);
  lines.push('');
  lines.push('Run the supported preparation sequence before packaging:');
  lines.push('  pnpm --filter @workspace/weather-app run build');
  lines.push('  pnpm --filter @workspace/weather-app exec cap copy android');
  lines.push('  pnpm --filter @workspace/weather-app run verify:android-web-assets');
  return lines.join('\n');
}

async function main() {
  let args;
  try {
    args = readArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    usage();
    process.exitCode = 2;
    return;
  }

  let expected;
  let actual;
  try {
    expected = await inventory(args.dist, 'web dist');
    actual = await inventory(args.android, 'Android assets');
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const errors = [];
  for (const [relative, expectedHash] of expected) {
    const actualHash = actual.get(relative);
    if (actualHash === undefined) {
      errors.push(`missing from Android assets: ${relative}`);
    } else if (actualHash !== expectedHash) {
      errors.push(
        `content mismatch: ${relative} (dist ${expectedHash.slice(0, 16)}…, android ${actualHash.slice(0, 16)}…)`,
      );
    }
  }
  for (const relative of actual.keys()) {
    if (!expected.has(relative) && !generatedExtras.has(relative)) {
      errors.push(`unexpected/obsolete file in Android assets: ${relative}`);
    }
  }

  if (errors.length > 0) {
    console.error(describe(errors));
    console.error(`dist: ${args.dist}`);
    console.error(`android: ${args.android}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS: ${expected.size} web files match the Android copy ` +
      `(${actual.size} Android files; allowed Capacitor extras: ${[...generatedExtras].join(', ')}).`,
  );
  console.log(`dist: ${args.dist}`);
  console.log(`android: ${args.android}`);
}

await main();
