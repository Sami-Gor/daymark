#!/usr/bin/env node
/*
 * Static verification for the WS12 WebView renderer/errorPath recovery fix.
 *
 * This is a no-dependency Node script (no pnpm install required) so the
 * implementation contract can be checked in a T5/offline window:
 *  - Capacitor server.errorPath is configured and both error assets are shipped;
 *  - the error page is localized (en/fr/es) and never uses inline script/handlers;
 *  - MainActivity registers a WebViewListener that always handles renderer death;
 *  - the recovery budget constants match the documented bounded policy;
 *  - recovery state stays in-process (no new persistent storage);
 *  - the pure policy class has no Android dependency (so JVM tests are real);
 *  - first-party Java still passes the repository network-boundary guard.
 *
 * Exit code 0 = every check passed; 1 = at least one violation.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let passed = 0;

function read(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('PASS ' + name);
  } else {
    failures.push(name);
    console.log('FAIL ' + name + (detail ? ' :: ' + detail : ''));
  }
}

const config = read('capacitor.config.ts');
check(
  'capacitor server.errorPath is recovery.html',
  /server\s*:\s*{[\s\S]*?errorPath\s*:\s*'recovery\.html'/.test(config),
);
check(
  'androidScheme remains the bundled https origin',
  /androidScheme\s*:\s*'https'/.test(config),
);
check('mixed content stays disabled', /allowMixedContent\s*:\s*false/.test(config));
check('console logging stays disabled', /loggingBehavior\s*:\s*'none'/.test(config));

check('public/recovery.html exists', existsSync(path.join(appRoot, 'public/recovery.html')));
check('public/recovery.js exists', existsSync(path.join(appRoot, 'public/recovery.js')));
const recoveryHtml = read('public/recovery.html');
const recoveryJs = read('public/recovery.js');

check(
  'recovery.html loads the bundled recovery.js relatively',
  /<script\s+src="\.\/recovery\.js"/.test(recoveryHtml),
);
check(
  'recovery.html has no inline script blocks',
  !/<script(?![^>]*\bsrc=)[^>]*>/i.test(recoveryHtml),
);
check('recovery.html has no inline event handlers', !/\son[a-z]+\s*=/i.test(recoveryHtml));
check(
  'recovery.html has a restrictive CSP meta tag',
  /http-equiv="Content-Security-Policy"/.test(recoveryHtml) && /script-src 'self'/.test(recoveryHtml),
);
const languageBlocks = ['en', 'fr', 'es'].map((language) => {
  const match = recoveryJs.match(new RegExp(language + "\\s*:\\s*\\{[\\s\\S]*?\\}"));
  return match ? match[0] : '';
});
check('recovery.js defines en/fr/es copy', languageBlocks.every((block) => block.length > 0));
check(
  'each locale has title, message and retry copy',
  languageBlocks.every(
    (block) => /title:/.test(block) && /message:/.test(block) && /retry:/.test(block),
  ),
);
check(
  'retry returns to the bundled app root',
  /window\.location\.replace\('\/'\)/.test(recoveryJs),
);
check(
  'recovery.js makes no network request',
  !/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(recoveryJs),
);
check(
  'recovery assets reference no external origin',
  !/https?:\/\//.test(recoveryHtml) && !/https?:\/\//.test(recoveryJs),
);

const localizationKeys = [
  'webview_recovery_title',
  'webview_recovery_message',
  'webview_recovery_retry',
  'webview_recovery_restoring_title',
  'webview_recovery_restoring_message',
];
const localeFiles = [
  'android/app/src/main/res/values/strings.xml',
  'android/app/src/main/res/values-fr/strings.xml',
  'android/app/src/main/res/values-es/strings.xml',
];
for (const localeFile of localeFiles) {
  const xml = read(localeFile);
  for (const key of localizationKeys) {
    check(
      localeFile + ' defines ' + key,
      new RegExp('name="' + key + '"[^>]*>[^<]+<').test(xml),
    );
  }
}

const policy = read(
  'android/app/src/main/java/io/github/sami_gor/daymark/WebViewRecoveryPolicy.java',
);
check('policy is pure Java (no Android imports)', !/^import\s+android\./m.test(policy));
check('policy caps automatic recoveries at 2', /MAX_AUTO_RECOVERIES\s*=\s*2\s*;/.test(policy));
check('policy window is 120000 ms', /RECOVERY_WINDOW_MS\s*=\s*120_000L\s*;/.test(policy));
check('policy stable reset is 30000 ms', /STABLE_RESET_MS\s*=\s*30_000L\s*;/.test(policy));
check(
  'policy only restores the bundled SPA routes',
  /RESTORABLE_PATHS/.test(policy) && /"\/privacy"/.test(policy) && /"\/store-preview"/.test(policy),
);
check(
  'policy recognises the error page so it is never restored',
  /isErrorPageUrl/.test(policy) && /ERROR_PAGE\s*=\s*"recovery\.html"/.test(policy),
);
check(
  'policy introduces no network API or remote URL literal',
  !/java\.net\.|https?:\/\//.test(policy),
);

const listener = read(
  'android/app/src/main/java/io/github/sami_gor/daymark/DaymarkWebViewListener.java',
);
check(
  'listener overrides onRenderProcessGone',
  /public\s+boolean\s+onRenderProcessGone\s*\(/.test(listener),
);
check('listener always reports the renderer death as handled', /return\s+true\s*;/.test(listener));
check(
  'listener captures the last navigation before recreating',
  /state\.savePendingRestoreUrl/.test(listener),
);
check(
  'listener recreates the Activity (and Capacitor Bridge/WebView)',
  /activity\.recreate\(\)/.test(listener),
);
check(
  'listener restores the captured route after reload',
  /state\.consumePendingRestoreUrl/.test(listener) && /webView\.loadUrl\(previousUrl\)/.test(listener),
);
check(
  'listener expires stale navigation restores',
  /isPendingRestoreFresh/.test(listener),
);
check(
  'listener never treats the error page as healthy',
  /isErrorPageUrl\(url, appUrl\)/.test(listener),
);
check(
  'listener shows an explicit terminal fallback with retry',
  /WebViewRecoveryScreen\.showTerminal\(/.test(listener),
);
check(
  'listener clears the budget only through the stable-page callback',
  /onStablePage\(/.test(listener),
);
check(
  'listener detaches the WebView before destroying it',
  /getParent\(\) instanceof ViewGroup/.test(listener) && /removeView\(webView\)/.test(listener),
);
check(
  'listener keeps only one pending stable-page reset',
  /cancelStablePageReset\(\)/.test(listener) && /removeCallbacks\(stablePageResetTask\)/.test(listener),
);
check(
  'listener tracks accepted rebuilds and clears them on page load',
  /markRebuildPending\(\)/.test(listener) && /clearRebuildPending\(\)/.test(listener),
);

const state = read(
  'android/app/src/main/java/io/github/sami_gor/daymark/WebViewRecoveryState.java',
);
check('recovery state is in-process only (no new persistent storage)', !/SharedPreferences|getSharedPreferences|localStorage|sessionStorage|new File\(|openFileOutput/.test(state));
check('recovery state is a process singleton', /private static final WebViewRecoveryState INSTANCE/.test(state));
check(
  'recovery state owns the bounded policy and the last navigation',
  /WebViewRecoveryPolicy/.test(state) && /pendingRestoreUrl/.test(state),
);
check(
  'recovery Java adds no persistence or transcript/audio/location store',
  !/SharedPreferences|getSharedPreferences|transcript|latitude|longitude|geolocation/.test(
    listener + state,
  ),
);

const mainActivity = read(
  'android/app/src/main/java/io/github/sami_gor/daymark/MainActivity.java',
);
check(
  'MainActivity registers the recovery listener',
  /addWebViewListener\(\s*new DaymarkWebViewListener\(/.test(mainActivity),
);
check(
  'MainActivity shows the terminal screen when the budget is already exhausted',
  /isExhausted\(System\.currentTimeMillis\(\)\)/.test(mainActivity),
);
check(
  'listener validates against the Capacitor app origin from the Bridge',
  /bridge\.getAppUrl\(\)/.test(mainActivity) && /String appUrl/.test(listener),
);
check(
  'terminal screen is not shown while a bounded rebuild is pending',
  /!recoveryState\.hasPendingRestoreUrl\(\)/.test(mainActivity),
);
check(
  'terminal screen respects an accepted rebuild after exhaustion',
  /!recoveryState\.hasRebuildPending\(\)/.test(mainActivity),
);
check(
  'MainActivity keeps the WebView compatibility guard',
  /WebViewCompatibilityScreen\.isCurrentWebViewSupported/.test(mainActivity),
);
check(
  'MainActivity still registers exactly the two expected plugins',
  (mainActivity.match(/registerPlugin\(\w+\.class\)/g) || []).length === 2,
);

// Replicate the repository's network-boundary Java guard over the first-party
// Android modules, including the recovery sources added here.
const firstPartyJavaRoots = [
  'android/app/src',
  'android/daymark-voice/src',
  'android/parakeet-assets/src',
];
const javaFiles = [];
function walkJava(relativeDirectory, out) {
  const absolute = path.join(appRoot, relativeDirectory);
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute)) {
    const relative = path.join(relativeDirectory, entry);
    const absoluteEntry = path.join(appRoot, relative);
    if (statSync(absoluteEntry).isDirectory()) walkJava(relative, out);
    else if (entry.endsWith('.java')) out.push(relative);
  }
}
for (const root of firstPartyJavaRoots) walkJava(root, javaFiles);
const javaGuardTokens = [
  'HttpURLConnection',
  'URLConnection',
  'OkHttpClient',
  'java.net.Socket',
  'java.net.',
  'WebSocket',
  'openConnection(',
  'http://',
  'https://',
];
// Removes Java comments without stripping string/char literals, so a URL in
// code such as loadUrl("https://...") is still seen by the guard below.
function stripJavaComments(code) {
  let result = '';
  let index = 0;
  let mode = 'code';
  while (index < code.length) {
    const character = code[index];
    const next = index + 1 < code.length ? code[index + 1] : '';
    if (mode === 'code') {
      if (character === '/' && next === '/') {
        mode = 'line';
        index += 2;
        continue;
      }
      if (character === '/' && next === '*') {
        mode = 'block';
        index += 2;
        continue;
      }
      if (character === '"' || character === "'") {
        mode = character === '"' ? 'string' : 'char';
      }
      result += character;
      index += 1;
      continue;
    }
    if (mode === 'line') {
      if (character === '\n') {
        mode = 'code';
        result += character;
      }
      index += 1;
      continue;
    }
    if (mode === 'block') {
      if (character === '*' && next === '/') {
        mode = 'code';
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    result += character;
    if (character === '\\' && next) {
      result += next;
      index += 2;
      continue;
    }
    if ((mode === 'string' && character === '"') || (mode === 'char' && character === "'")) {
      mode = 'code';
    }
    index += 1;
  }
  return result;
}
const javaOffenders = [];
for (const relative of javaFiles) {
  const code = stripJavaComments(read(relative));
  for (const token of javaGuardTokens) {
    if (code.includes(token)) javaOffenders.push(relative + ': ' + token);
  }
}
check(
  'first-party Java passes the repository network-boundary guard',
  javaOffenders.length === 0,
  javaOffenders.join('; '),
);
const guardProbe = stripJavaComments(
  [
    '// SENTINEL_COMMENT',
    'String value = "SENTINEL_LITERAL";',
    '/* SENTINEL_BLOCK */',
  ].join('\n'),
);
check(
  'network-boundary guard keeps string literals while dropping comments',
  guardProbe.includes('SENTINEL_LITERAL')
    && !guardProbe.includes('SENTINEL_COMMENT')
    && !guardProbe.includes('SENTINEL_BLOCK'),
);
check(
  'recovery verification walks first-party Android Java',
  javaFiles.length >= 12,
  'found ' + javaFiles.length,
);

if (failures.length > 0) {
  console.log('');
  console.log('FAILED ' + failures.length + ' of ' + (passed + failures.length) + ' checks: ' + failures.join('; '));
  process.exit(1);
}
console.log('');
console.log('All ' + passed + ' static WebView-recovery checks passed.');
