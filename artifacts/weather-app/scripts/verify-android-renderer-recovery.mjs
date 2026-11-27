#!/usr/bin/env node
/**
 * Device regression harness for Daymark's Capacitor WebView renderer recovery.
 *
 * It starts the installed debug app, discovers its WebView DevTools socket,
 * navigates the real WebView to chrome://crash, and verifies that the app
 * remains foreground and renders Daymark again. This is a test-only tool: the
 * chrome://crash URL is never part of the app or its assets.
 *
 * Usage:
 *   ADB_PORT=5038 ADB_SERIAL=<serial> node scripts/verify-android-renderer-recovery.mjs
 * Optional: APP_PACKAGE, ADB_LOCAL_PORT, CYCLES.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const port = process.env.ADB_PORT || '5038';
const serial = process.env.ADB_SERIAL;
const pkg = process.env.APP_PACKAGE || 'io.github.sami_gor.daymark.phase4validate';
const activity = pkg + '/io.github.sami_gor.daymark.MainActivity';
const localPort = Number(process.env.ADB_LOCAL_PORT || '9222');
const cycles = Number(process.env.CYCLES || '1');
const route = process.env.ROUTE || '';
const expectUrl = process.env.EXPECT_URL || '';
const crashMethod = process.env.CRASH_METHOD || 'chrome';

if (!serial) {
  console.error('ADB_SERIAL is required');
  process.exit(2);
}

function adb(args) {
  return execFileSync('adb', ['-P', port, '-s', serial, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(500);
  }
  throw new Error('timeout waiting for ' + label + ': ' + String(last));
}

async function pageInfo() {
  const response = await fetch('http://127.0.0.1:' + localPort + '/json');
  if (!response.ok) throw new Error('devtools HTTP ' + response.status);
  const pages = await response.json();
  return pages.find((page) => page.type === 'page' && page.url.startsWith('https://localhost'));
}

async function cdp(method, params) {
  const page = await waitFor(pageInfo, 10000, 'WebView devtools page');
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    const timer = setTimeout(() => reject(new Error('CDP timeout')), 5000);
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method, params }));
    socket.onmessage = () => { clearTimeout(timer); socket.close(); resolve(); };
    socket.onerror = (error) => { clearTimeout(timer); reject(error); };
    socket.onclose = () => { clearTimeout(timer); resolve(); };
  });
}

async function triggerRendererCrash() {
  if (crashMethod === 'page') {
    await cdp('Page.crash', {});
    return;
  }
  await cdp('Page.navigate', { url: 'chrome://crash' });
}

adb(['shell', 'am', 'force-stop', pkg]);
adb(['shell', 'am', 'start', '-W', '-n', activity]);
await sleep(6000);
assert((adb(['shell', 'pidof', pkg]) || '').trim().length > 0, 'app did not start');

const sockets = adb(['shell', 'cat', '/proc/net/unix']);
const match = sockets.match(/@webview_devtools_remote_([0-9]+)/);
assert(match, 'no WebView devtools socket');
adb(['forward', 'tcp:' + localPort, 'localabstract:webview_devtools_remote_' + match[1]]);

if (route) {
  await cdp('Page.navigate', { url: 'https://localhost' + route });
  await sleep(2000);
}
const evidence = mkdtempSync(join(tmpdir(), 'daymark-wv-'));
try {
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    await triggerRendererCrash();
    await sleep(6000);
    const pid = (adb(['shell', 'pidof', pkg]) || '').trim();
    assert(pid.length > 0, 'cycle ' + cycle + ': app process died');
    const focus = adb(['shell', 'dumpsys', 'window']);
    assert(focus.includes(pkg + '/io.github.sami_gor.daymark.MainActivity'), 'cycle ' + cycle + ': app not foreground');
    try {
      adb(['shell', 'uiautomator', 'dump', '/sdcard/daymark-renderer-recovery.xml']);
    } catch (error) {
      // Some API36 builds return 137 after writing a valid dump.
      if (!String(error.stdout || '').includes('UI hierchary dumped')) throw error;
    }
    const xmlPath = join(evidence, 'ui-' + cycle + '.xml');
    adb(['pull', '/sdcard/daymark-renderer-recovery.xml', xmlPath]);
    const xml = readFileSync(xmlPath, 'utf8');
    assert(/London|daymark|That forecast went cloudy/.test(xml), 'cycle ' + cycle + ': no Daymark UI after recovery');
    if (expectUrl) {
      const current = await pageInfo();
      assert(current && current.url.startsWith(expectUrl), 'cycle ' + cycle + ': route not restored: ' + (current && current.url));
    }
    console.log('cycle ' + cycle + ': PASS pid=' + pid);
  }
  console.log('RENDERER_RECOVERY_PASS');
} finally {
  try { adb(['forward', '--remove', 'tcp:' + localPort]); } catch {}
  rmSync(evidence, { recursive: true, force: true });
}
