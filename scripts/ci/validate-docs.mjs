#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const roots = ['docs', 'README.md', 'SECURITY.md', 'THIRD-PARTY-NOTICES.md'];
const files = [];

function walk(target) {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(target)) walk(path.join(target, entry));
  } else if (target.endsWith('.md')) {
    files.push(target);
  }
}

for (const root of roots) walk(root);

const fence = String.fromCharCode(96).repeat(3);
const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const failures = [];
let checkedLinks = 0;
let checkedFences = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let fenceCount = 0;

  for (const line of lines) {
    if (line.trimStart().startsWith(fence)) {
      fenceCount += 1;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    let match;
    linkPattern.lastIndex = 0;
    while ((match = linkPattern.exec(line)) !== null) {
      let target = match[1].replace(/^<|>$/g, '');
      if (!target || target.startsWith('#') || target.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
        continue;
      }
      target = target.split('#')[0].split('?')[0];
      if (!target) continue;
      checkedLinks += 1;
      let resolved;
      try {
        resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
      } catch {
        failures.push(file + ': malformed link target ' + target);
        continue;
      }
      try {
        statSync(resolved);
      } catch {
        failures.push(file + ': missing relative link target ' + target);
      }
    }
  }

  checkedFences += fenceCount;
  if (fenceCount % 2 !== 0) failures.push(file + ': unbalanced code fences (count ' + fenceCount + ')');
}

if (failures.length > 0) {
  console.error('docs validation failed:');
  for (const failure of failures) console.error('  ' + failure);
  process.exitCode = 1;
} else {
  console.log('docs validation passed: files=' + files.length + ', links=' + checkedLinks + ', fences=' + checkedFences);
}
