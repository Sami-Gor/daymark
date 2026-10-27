#!/usr/bin/env node
/**
 * Instrumentation-free on-device probe for the API 30 location smoke test.
 *
 * Speaks the Chrome DevTools Protocol to the app's debug WebView through
 * `adb forward`. Capacitor enables WebView debugging automatically for
 * debuggable builds (CapConfig defaults webContentsDebuggingEnabled to
 * FLAG_DEBUGGABLE), so a debug APK exposes a
 * `webview_devtools_remote_<pid>` abstract socket without any test-only app
 * code. Evaluating `navigator.geolocation.getCurrentPosition` inside the
 * real page goes through the exact patched Capacitor path under test —
 * BridgeWebChromeClient.onGeolocationPermissionsShowPrompt — with no
 * instrumentation APK and no UI driving.
 *
 * Requires Node >= 22 (global WebSocket). No npm dependencies.
 *
 * Usage:
 *   cdp-probe.mjs geolocation --package <id> --expect success|denied|any-error
 *                       [--expect-lat F] [--expect-lon F] [--tolerance-deg F]
 *                       [--timeout-ms N]
 *   cdp-probe.mjs voice-availability --package <id> --expect unavailable
 *                       [--timeout-ms N]
 *
 * Exit codes: 0 = verdict matched, 1 = verdict did not match, 2 = harness
 * error (socket/page/CDP failure, e.g. the app process died).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const mode = args.shift();

function failHarness(message) {
  console.error(`cdp-probe: harness error: ${message}`);
  process.exit(2);
}

function parseArgs() {
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!key || !key.startsWith('--')) failHarness(`unexpected argument: ${key}`);
    const name = key.slice(2);
    if (name === 'help') {
      console.log('see the header comment of this file');
      process.exit(0);
    }
    out[name] = args[i + 1];
    if (out[name] === undefined) failHarness(`missing value for ${key}`);
  }
  return out;
}

const opts = parseArgs();
const pkg = opts.package;
const expect = opts.expect;
const timeoutMs = Number(opts['timeout-ms'] ?? 90_000);

if (!mode || (mode !== 'geolocation' && mode !== 'voice-availability')) {
  failHarness('mode must be "geolocation" or "voice-availability"');
}
if (!pkg) failHarness('--package is required');
if (!expect) failHarness('--expect is required');

if (typeof WebSocket === 'undefined') {
  failHarness('global WebSocket is unavailable; run with Node >= 22');
}

function adb() {
  const candidates = [
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
    'adb',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === 'adb' || existsSync(candidate)) return candidate;
  }
  failHarness('adb not found; set ANDROID_HOME');
}

const ADB = adb();

function adbRun(...adbArgs) {
  const result = spawnSync(ADB, adbArgs, { encoding: 'utf8', timeout: 30_000 });
  if (result.error) failHarness(`adb ${adbArgs.join(' ')} failed: ${result.error.message}`);
  return result.stdout;
}

const deadline = Date.now() + timeoutMs;

function pidOfPackage() {
  const stdout = adbRun('shell', 'pidof', pkg).trim();
  return stdout ? stdout.split(/\s+/)[0] : null;
}

const PORT = 9223;

function httpJson(pathname) {
  const result = spawnSync('curl', ['-sf', `http://127.0.0.1:${PORT}${pathname}`], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.status !== 0 || result.error) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function waitForPage() {
  // Returns the CDP page target of the app's WebView: the local https
  // origin Capacitor serves (androidScheme https), falling back to the first
  // page target for robustness against an about:blank interstitial.
  for (;;) {
    const pid = pidOfPackage();
    if (pid) {
      adbRun('forward', '--remove', `tcp:${PORT}`).trim(); // best-effort; may not exist
    }
    if (pid) {
      adbRun('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
      const targets = httpJson('/json');
      if (Array.isArray(targets)) {
        const pages = targets.filter((t) => t.type === 'page');
        const app = pages.find((t) => /^https:\/\/localhost/.test(t.url) || t.url === 'https://localhost/')
          ?? pages.find((t) => t.url?.startsWith('https://localhost'));
        const chosen = app ?? pages[0];
        if (chosen?.webSocketDebuggerUrl) return chosen;
      }
    }
    if (Date.now() > deadline) {
      failHarness(`timed out after ${timeoutMs}ms waiting for the ${pkg} WebView debug page (is the app running and debuggable?)`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  }
}

function cdpEvaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* already closed */ }
      reject(new Error('CDP WebSocket timed out'));
    }, Math.max(15_000, timeoutMs));
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }));
    });
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timeout);
      try { ws.close(); } catch { /* already closed */ }
      resolve(message);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('CDP WebSocket error'));
    });
  });
}

function valueOf(message) {
  if (message.error) failHarness(`CDP error: ${JSON.stringify(message.error)}`);
  const { result, exceptionDetails } = message.result ?? {};
  if (exceptionDetails) {
    failHarness(`page threw: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`);
  }
  if (result?.type === 'undefined') return undefined;
  if (result?.type === 'object' && result.subtype === 'null') return null;
  return result?.value;
}

function geolocationExpression() {
  return `(function () {
    if (!navigator.geolocation) {
      return Promise.resolve({ ok: false, code: 0, message: 'no navigator.geolocation' });
    }
    return new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(
        function (p) {
          resolve({ ok: true, lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
        },
        function (e) {
          resolve({ ok: false, code: e.code, message: e.message });
        },
        { enableHighAccuracy: false, timeout: 30000, maximumAge: 0 }
      );
    });
  })()`;
}

function voiceExpression() {
  return `(async function () {
    var bridge = window.Capacitor;
    if (!bridge) return { probeOk: false, error: 'no Capacitor bridge on window' };
    var voice = bridge.Plugins && bridge.Plugins.DaymarkVoice;
    if (!voice || typeof voice.isAvailable !== 'function') {
      return { probeOk: false, error: 'DaymarkVoice plugin not registered' };
    }
    var status = {};
    try { status = await voice.getStatus(); } catch (e) { status = { state: 'error: ' + e }; }
    var availability = {};
    try { availability = await voice.isAvailable(); } catch (e) { availability = { error: String(e) }; }
    return { probeOk: true, available: !!availability.available, status: status.state ?? null,
             isAvailableRaw: availability };
  })()`;
}

function verdictFor(modeName, value) {
  if (modeName === 'geolocation') {
    if (typeof value?.ok !== 'boolean') return { match: false, reason: `malformed verdict: ${JSON.stringify(value)}` };
    if (expect === 'success') {
      if (!value.ok) return { match: false, reason: `geolocation failed (code ${value.code}, ${value.message}) — expected success` };
      if (opts['expect-lat'] !== undefined || opts['expect-lon'] !== undefined) {
        const tolerance = Number(opts['tolerance-deg'] ?? 0.01);
        if (opts['expect-lat'] !== undefined
            && Math.abs(value.lat - Number(opts['expect-lat'])) > tolerance) {
          return { match: false, reason: `latitude ${value.lat} is not the injected fix ${opts['expect-lat']}` };
        }
        if (opts['expect-lon'] !== undefined
            && Math.abs(value.lon - Number(opts['expect-lon'])) > tolerance) {
          return { match: false, reason: `longitude ${value.lon} is not the injected fix ${opts['expect-lon']}` };
        }
      }
      return { match: true, reason: `geolocation succeeded: ${value.lat}, ${value.lon} (±${value.accuracy}m)` };
    }
    if (expect === 'denied') {
      // Code 1 is PERMISSION_DENIED — exactly what the unpatched Capacitor
      // produced on API <= 30 with a coarse-only grant, and what any
      // revoked permission must produce here.
      if (!value.ok && value.code === 1) return { match: true, reason: 'geolocation denied with PERMISSION_DENIED (code 1)' };
      return { match: false, reason: `expected PERMISSION_DENIED (code 1), got ${JSON.stringify(value)}` };
    }
    if (expect === 'any-error') {
      if (!value.ok) return { match: true, reason: `geolocation failed as expected (code ${value.code}, ${value.message})` };
      return { match: false, reason: `expected failure, got success: ${value.lat}, ${value.lon}` };
    }
    return { match: false, reason: `unknown --expect ${expect}` };
  }

  // voice-availability
  if (!value?.probeOk) return { match: false, reason: `probe failed: ${value?.error}` };
  if (expect === 'unavailable') {
    if (value.available === false) {
      return { match: true, reason: `DaymarkVoice degrades to unavailable (state: ${value.status}) without libkokoro_jni` };
    }
    return { match: false, reason: `expected DaymarkVoice unavailable, got available=${value.available} (state ${value.status})` };
  }
  if (expect === 'available') {
    if (value.available === true) return { match: true, reason: `DaymarkVoice available (state: ${value.status})` };
    return { match: false, reason: `expected DaymarkVoice available, got ${JSON.stringify(value)}` };
  }
  return { match: false, reason: `unknown --expect ${expect}` };
}

const target = waitForPage();
const expression = mode === 'geolocation' ? geolocationExpression() : voiceExpression();
const message = await cdpEvaluate(target.webSocketDebuggerUrl, expression);
const value = valueOf(message);
const { match, reason } = verdictFor(mode, value);

console.log(`cdp-probe[${mode}] expect=${expect} -> ${match ? 'MATCH' : 'MISMATCH'}`);
console.log(`  ${reason}`);
console.log(`  raw: ${JSON.stringify(value)}`);
try { adbRun('forward', '--remove', `tcp:${PORT}`); } catch { /* already gone */ }
process.exit(match ? 0 : 1);
