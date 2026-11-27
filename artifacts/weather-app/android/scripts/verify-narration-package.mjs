#!/usr/bin/env node
// Verify production multilingual narration assets and notices in a built APK/AAB.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
const [archive] = process.argv.slice(2);
if (!archive || !existsSync(archive)) { console.error('usage: verify-narration-package.mjs <apk|aab>'); process.exit(2); }
const list = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).split('\n');
const prefix = list.includes('base/manifest/AndroidManifest.xml') ? 'base/' : '';
const checks = [
  ['assets/kokoro/model_quantized.onnx', 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478'],
  ['assets/kokoro/bm_fable.bin', 'f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1'],
  ['assets/kokoro/ff_siwis.bin', 'a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861'],
  ['assets/kokoro/em_alex.bin', '27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95'],
];
let failed = false;
for (const [asset, expected] of checks) {
  const entry = prefix + asset;
  if (!list.includes(entry)) { console.error('MISSING ' + entry); failed = true; continue; }
  const data = execFileSync('unzip', ['-p', archive, entry], { maxBuffer: 256 * 1024 * 1024 });
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual !== expected) { console.error('HASH MISMATCH ' + entry + ' ' + actual); failed = true; }
  else console.log('OK ' + entry + ' ' + actual);
}
for (const name of ['THIRD-PARTY-NOTICES.md', 'Apache-2.0.txt', 'MULTILINGUAL-VOICE-NOTICE.txt']) {
  const entry = prefix + 'assets/licenses/' + name;
  if (!list.includes(entry)) { console.error('MISSING ' + entry); failed = true; } else console.log('OK ' + entry);
}
if (failed) process.exit(1);
console.log('PASS multilingual narration package assets/licences');
