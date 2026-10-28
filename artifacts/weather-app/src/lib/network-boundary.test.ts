import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

/**
 * Guard for the Daymark network boundary.
 *
 * The privacy model is: exactly three Open-Meteo endpoints are contacted from
 * the app (forecast, air quality, place search), every other fetch is
 * same-origin (bundled assets / locality data), and no analytics, crash or
 * update service exists. The CSP `connect-src` allowlist is enforced in three
 * places (hosting `_headers`, the Vite build, and the bundled Android WebView
 * shell) and must stay identical to the hosts actually used by `weather.ts`.
 *
 * Beyond the CSP copies, this file also pins:
 *  - every `fetch(` call site in non-test web source and `sw.js`, plus every
 *    re-reference of the `fetch` binding (so it cannot be aliased or imported
 *    somewhere new without this guard being updated);
 *  - the absence of every other web network API (XHR, WebSocket, EventSource,
 *    sendBeacon, WebRTC), of cleartext/dynamically assembled/protocol-relative
 *    URLs, and of remote resources in the service worker and app shell;
 *  - zero network APIs and zero URL literals in first-party Android Java
 *    (the live Capacitor tree), with the retired root TWA tree explicitly
 *    excluded but tripwired (see that check for the rationale);
 *  - that the Capacitor native HTTP bridge, which would move fetches to
 *    OkHttp outside the WebView and outside the CSP, stays disabled;
 *  - that the shipped Android speech wiring can never select the WebView
 *    Web Speech adapter, whose voices may be served by a network provider.
 *
 * Comment stripping uses the real TypeScript scanner (mirroring the token
 * logic of TypeScript's own syntax classifier) rather than regexes: the naive
 * `//`-regex stripper previously used here silently ate every `https://`
 * literal at its own `//`, which made the origin check vacuous. The final
 * self-test check proves the detectors actually fire.
 *
 * Evidence, destination inventory and the limits of what a source guard can
 * and cannot prove are documented in docs/security/network-evidence.md.
 */
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');

const EXPECTED_HOSTS = [
  'api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'geocoding-api.open-meteo.com',
] as const;

/*
 * Hosts that may appear only as user-clicked navigation anchors
 * (`<a href="https://…" target="_blank" rel="noreferrer">`) in the footer and
 * privacy pages. These are disclosed in the in-app privacy pages; they are
 * navigation, not data transfer, and must never appear as a fetch target.
 */
const NAVIGATION_HOSTS = [
  'open-meteo.com',
  'www.cloudflare.com',
  'www.geonames.org',
  'huggingface.co',
] as const;

const headersFile = path.join(appRoot, 'public', '_headers');
const viteConfigFile = path.join(appRoot, 'vite.config.ts');
const weatherFile = path.join(appRoot, 'src', 'lib', 'weather.ts');
const bundledIndexFile = path.join(
  appRoot,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'public',
  'index.html',
);
const serviceWorkerFile = path.join(appRoot, 'public', 'sw.js');
const appShellIndexFile = path.join(appRoot, 'index.html');

function connectSrcHosts(csp: string): string[] {
  const match = csp.match(/connect-src[^;]*/);
  expect(match).not.toBeNull();
  return (match![0] as string)
    .split(/\s+/)
    .slice(1)
    .filter((token) => token.startsWith('https://'))
    .map((token) => token.replace('https://', ''));
}

function collectSourceFiles(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'test-results') continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry.endsWith('.test') || full.includes(`${path.sep}tests${path.sep}`)) continue;
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function collectJavaSources(directory: string, out: string[] = []): string[] {
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory)) {
    if (entry === 'build' || entry === '.gradle') continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) collectJavaSources(full, out);
    else if (entry.endsWith('.java')) out.push(full);
  }
  return out;
}

/*
 * Strip comments from TS/TSX/JS while keeping string and regex literal contents
 * intact. Mirrors the token-level logic of TypeScript's own syntax classifier
 * (services/classifier.ts): a bare `/` is a regex literal unless it follows a
 * token after which division is the only reading, and `}` inside a template
 * interpolation re-scans as the template middle/tail. This is what makes the
 * URL scans below sound: URLs inside comments are removed, URLs inside string
 * literals survive, and a quote inside a regex literal cannot corrupt the scan.
 */
function stripTsComments(text: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const noRegexAfter = new Set<number>([
    ts.SyntaxKind.Identifier,
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NumericLiteral,
    ts.SyntaxKind.BigIntLiteral,
    ts.SyntaxKind.RegularExpressionLiteral,
    ts.SyntaxKind.ThisKeyword,
    ts.SyntaxKind.PlusPlusToken,
    ts.SyntaxKind.MinusMinusToken,
    ts.SyntaxKind.CloseParenToken,
    ts.SyntaxKind.CloseBracketToken,
    ts.SyntaxKind.CloseBraceToken,
    ts.SyntaxKind.TrueKeyword,
    ts.SyntaxKind.FalseKeyword,
  ]);
  const trivia = new Set<number>([
    ts.SyntaxKind.WhitespaceTrivia,
    ts.SyntaxKind.NewLineTrivia,
  ]);
  let out = '';
  let previous = ts.SyntaxKind.Unknown;
  const templateStack: number[] = [];
  for (;;) {
    let kind = scanner.scan();
    if (kind === ts.SyntaxKind.EndOfFileToken) break;
    if (!trivia.has(kind)) {
      if (kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken) {
        if (!noRegexAfter.has(previous) && scanner.reScanSlashToken() === ts.SyntaxKind.RegularExpressionLiteral) {
          kind = ts.SyntaxKind.RegularExpressionLiteral;
        }
      } else if (kind === ts.SyntaxKind.TemplateHead) {
        templateStack.push(kind);
      } else if (kind === ts.SyntaxKind.OpenBraceToken && templateStack.length > 0) {
        templateStack.push(kind);
      } else if (kind === ts.SyntaxKind.CloseBraceToken && templateStack.length > 0) {
        if (templateStack[templateStack.length - 1] === ts.SyntaxKind.TemplateHead) {
          const rescan = scanner.reScanTemplateToken(false);
          if (rescan === ts.SyntaxKind.TemplateTail) templateStack.pop();
          else if (rescan !== ts.SyntaxKind.TemplateMiddle) kind = rescan;
        } else {
          templateStack.pop();
        }
      }
    }
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) continue;
    out += scanner.getTokenText();
    if (!trivia.has(kind)) previous = kind;
  }
  return out;
}

/*
 * Strip comments from Java while keeping string/char literal contents intact
 * (license headers and the one GitHub-issue link in the retired tree live in
 * comments; a URL literal inside Java code must survive to be caught).
 */
function stripJavaComments(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
    } else if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (text[i] === '\\') {
          out += text[i] + (text[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (text[i] === quote || text[i] === '\n') {
          out += text[i] ?? '';
          i++;
          break;
        }
        out += text[i];
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/* All non-test web sources plus the service worker, comment-stripped. */
function webCodeUnits(): { rel: string; code: string }[] {
  const units = collectSourceFiles(path.join(appRoot, 'src')).map((file) => ({
    rel: path.relative(appRoot, file),
    code: stripTsComments(readFileSync(file, 'utf8')),
  }));
  units.push({ rel: 'public/sw.js', code: stripTsComments(readFileSync(serviceWorkerFile, 'utf8')) });
  return units;
}

function javaOffenders(files: string[], rootForRelative: string): string[] {
  const tokens = [
    'HttpURLConnection',
    'URLConnection', // also matches HttpURLConnection; both are fetch-capable
    'OkHttpClient',
    'java.net.Socket',
    'java.net.', // any java.net import (URL/URI/…) must be a deliberate addition
    'WebSocket',
    'openConnection(', // the activation verb for java.net.URL objects
    'http://', // cleartext literal
    'https://', // any remote URL literal
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const code = stripJavaComments(readFileSync(file, 'utf8'));
    for (const token of tokens) {
      if (code.includes(token)) offenders.push(`${path.relative(rootForRelative, file)}: ${token}`);
    }
  }
  return offenders;
}

describe('network boundary', () => {
  it('weather.ts declares exactly the three expected Open-Meteo endpoints', () => {
    const source = readFileSync(weatherFile, 'utf8');
    const urls = [...source.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((match) => match[0].replace('https://', ''));
    expect(new Set(urls)).toEqual(new Set(EXPECTED_HOSTS));
  });

  it('the hosting _headers CSP allows exactly those hosts', () => {
    const csp = readFileSync(headersFile, 'utf8');
    expect(connectSrcHosts(csp).sort()).toEqual([...EXPECTED_HOSTS].sort());
  });

  it('the Vite build CSP allows exactly those hosts', () => {
    const config = readFileSync(viteConfigFile, 'utf8');
    const cspLine = config.split('\n').find((line) => line.includes('connect-src'));
    expect(cspLine).toBeDefined();
    expect(connectSrcHosts(cspLine!).sort()).toEqual([...EXPECTED_HOSTS].sort());
  });

  it('the bundled Android WebView CSP allows exactly those hosts', () => {
    const html = readFileSync(bundledIndexFile, 'utf8');
    const meta = html.split('\n').find((line) => line.includes('connect-src'));
    expect(meta).toBeDefined();
    expect(connectSrcHosts(meta!).sort()).toEqual([...EXPECTED_HOSTS].sort());
  });

  it('no non-test source file references any other https origin that could be fetched', () => {
    const files = collectSourceFiles(path.join(appRoot, 'src'));
    expect(files.length).toBeGreaterThan(50);
    const unexpectedFetchable: string[] = [];
    const unexpectedNavigational: string[] = [];
    for (const file of files) {
      // Comments are stripped with the real TypeScript scanner (see
      // stripTsComments) so documentation links do not count while URL
      // literals in strings survive; the previous regex stripper ate every
      // `https://` at its own `//` and made this check vacuous.
      const code = stripTsComments(readFileSync(file, 'utf8'));
      for (const match of code.matchAll(/https:\/\/([a-zA-Z0-9.-]+)/g)) {
        const host = match[1];
        const before = code.slice(Math.max(0, (match.index ?? 0) - 6), match.index ?? 0);
        const location = `${path.relative(appRoot, file)}: ${host}`;
        // JSX <a href="https://…"> anchors (footer + privacy pages) are
        // user-clicked navigation, not fetched data; they must stay within
        // the documented navigation set. Everything else is a fetchable
        // origin and must be one of the three Open-Meteo hosts.
        if (before.endsWith('href="')) {
          if (!(NAVIGATION_HOSTS as readonly string[]).includes(host)) unexpectedNavigational.push(location);
        } else if (!(EXPECTED_HOSTS as readonly string[]).includes(host)) {
          unexpectedFetchable.push(location);
        }
      }
    }
    expect(unexpectedFetchable).toEqual([]);
    expect(unexpectedNavigational).toEqual([]);
  });

  it('every fetch call site is enumerated and same-origin or an Open-Meteo host', () => {
    const units = webCodeUnits();
    expect(units.length).toBeGreaterThan(50);

    // 1. Word-level inventory: any alias (`const f = fetch`), rename-import or
    //    property use (`window.fetch`) leaves the bare `fetch` word in code, so
    //    pinning where the word may appear closes the aliasing evasion.
    const expectedWordCounts = new Map([
      ['src/lib/weather.ts', 1], // the getJson helper; its URLs are the three pinned constants
      ['src/lib/locality-load.ts', 1], // the same-origin locality dataset fetch
      ['public/sw.js', 3], // the "fetch" event registration + the two gated pass-through calls
    ]);
    for (const { rel, code } of units) {
      const words = [...code.matchAll(/\bfetch\b/g)].length;
      const expected = expectedWordCounts.get(rel) ?? 0;
      expect(words, `${rel} references fetch ${words}x, expected ${expected}x`).toBe(expected);
    }

    // 2. Call-site inventory: every `fetch(` call site, with its argument.
    // (Sorted so the assertion does not depend on directory iteration order.)
    const callSites = units
      .flatMap(({ rel, code }) =>
        [...code.matchAll(/\bfetch\s*\(\s*([^,\s)]*)/g)].map((match) => ({ file: rel, argument: match[1] })),
      )
      .sort((a, b) => (a.file === b.file ? a.argument.localeCompare(b.argument) : a.file.localeCompare(b.file)));
    expect(callSites).toEqual([
      // Both service-worker calls pass the `request` object that the
      // same-origin gate below has already cleared.
      { file: 'public/sw.js', argument: 'request' },
      { file: 'public/sw.js', argument: 'request' },
      // The locality dataset fetch; same-origin by construction (asserted below).
      { file: 'src/lib/locality-load.ts', argument: 'url' },
      // getJson's `url` parameter; its only producers are the three constants
      // pinned by the host checks above.
      { file: 'src/lib/weather.ts', argument: 'url' },
    ]);

    // 3. The locality fetch must be same-origin: same-origin credentials, and
    //    a dataset URL that is BASE_URL-relative (no scheme, no host).
    const localityLoad = readFileSync(path.join(appRoot, 'src', 'lib', 'locality-load.ts'), 'utf8');
    expect(localityLoad).toContain("fetch(url, { credentials: 'same-origin' })");
    const locality = readFileSync(path.join(appRoot, 'src', 'lib', 'locality.ts'), 'utf8');
    const datasetUrl = locality.match(/LOCALITY_DATASET_URL\s*=\s*`([^`]*)`/);
    expect(datasetUrl, 'LOCALITY_DATASET_URL must stay a template literal').not.toBeNull();
    expect(datasetUrl![1].startsWith('${import.meta.env.BASE_URL}')).toBe(true);
    expect(datasetUrl![1]).not.toMatch(/:\/\//); // no scheme, so no remote origin
    expect(datasetUrl![1]).not.toMatch(/^\/\//); // and not protocol-relative

    // 4. The service worker must keep its cross-origin early return, which is
    //    what confines its two fetch calls to same-origin requests.
    const serviceWorker = readFileSync(serviceWorkerFile, 'utf8');
    expect(serviceWorker).toContain('if (url.origin !== self.location.origin) return;');
  });

  it('no other network API is used anywhere in web code', () => {
    const forbidden = ['XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'RTCPeerConnection'];
    const offenders: string[] = [];
    for (const { rel, code } of webCodeUnits()) {
      for (const token of forbidden) {
        if (code.includes(token)) offenders.push(`${rel}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no cleartext, dynamically assembled, or protocol-relative URL exists in web code', () => {
    const offenders: string[] = [];
    for (const { rel, code } of webCodeUnits()) {
      // (A `https://` literal never contains the substring `http://`, so this
      // matches cleartext literals only.)
      if (code.includes('http://')) offenders.push(`${rel}: cleartext http:// literal`);
      // `https://` immediately followed by a non-host character means a URL
      // being assembled at runtime (`'https://' + host`), which the
      // host-literal checks above could not see.
      if (/https:\/\/(?![a-zA-Z0-9.-])/.test(code)) {
        offenders.push(`${rel}: dynamically assembled https:// URL`);
      }
      // A string starting `//host` is protocol-relative and inherits the
      // page scheme; it must be treated as a remote origin, not a path.
      if (/["'`]\/\/[a-zA-Z0-9]/.test(code)) offenders.push(`${rel}: protocol-relative URL string`);
    }
    expect(offenders).toEqual([]);
  });

  it('the service worker and the app shell reference only same-origin resources', () => {
    const code = stripTsComments(readFileSync(serviceWorkerFile, 'utf8'));
    // No remote script loading and no absolute or protocol-relative URL in any
    // service-worker string literal (the precache list and fetch paths are
    // same-origin-relative by construction).
    expect(code).not.toContain('importScripts');
    const offenders: string[] = [];
    for (const match of code.matchAll(/"([^"]*)"|'([^']*)'/g)) {
      const value = match[1] ?? match[2];
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('//')) {
        offenders.push(`public/sw.js: ${value}`);
      }
    }
    expect(offenders).toEqual([]);

    // The unbuilt app shell must only reference local files; a remote script or
    // stylesheet href here would be a fetch the source checks above cannot see.
    const html = readFileSync(appShellIndexFile, 'utf8');
    const remoteResources: string[] = [];
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const value = match[1];
      if (!value.startsWith('./') && !value.startsWith('/') && !value.startsWith('#')) {
        remoteResources.push(`index.html: ${value}`);
      }
    }
    expect(remoteResources).toEqual([]);
  });

  it('first-party Android Java contains no network API and no URL literal', () => {
    // First-party modules of the live Capacitor tree only.
    // `capacitor-cordova-android-plugins` is Capacitor-generated (third-party
    // placeholder, no Java today); `parakeet-assets` currently ships only
    // model assets but is walked so Java appearing there would be scanned.
    const roots = ['app', 'daymark-voice', 'parakeet-assets'].map((module) =>
      path.join(appRoot, 'android', module, 'src'),
    );
    const files = roots.flatMap((root) => collectJavaSources(root));
    expect(files.length).toBeGreaterThanOrEqual(12);
    // Key first-party files must be present so the walk cannot silently shrink.
    const relative = files.map((file) => path.relative(appRoot, file));
    for (const key of [
      'android/app/src/main/java/io/github/sami_gor/daymark/MainActivity.java',
      'android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/ParakeetSpeechRecognitionPlugin.java',
      'android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/DaymarkVoicePlugin.java',
      'android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/SystemSpeechPlugin.java',
      'android/daymark-voice/src/main/java/io/github/sami_gor/daymark/tts/KokoroLocalTtsEngine.java',
    ]) {
      expect(relative).toContain(key);
    }
    expect(javaOffenders(files, appRoot)).toEqual([]);
  });

  it('the retired root TWA tree stays outside the network boundary', () => {
    /*
     * Decision: the repo-root `/android` bubblewrap/TWA tree is EXCLUDED from
     * the shipped-boundary scans above, on purpose, and this check documents
     * why while keeping a revival tripwire:
     *
     *  - It is a frozen rollback shell, not the production app (its README
     *    says so), and it cannot currently build: its AndroidManifest.xml
     *    references `@string/` / `@bool/` resources (hostName, launchUrl,
     *    webManifestUrl, enableNotification, appName, launcherName,
     *    orientation, fallbackType, generatorApp, providerAuthority) that its
     *    res/values/strings.xml does not define (it defines only
     *    assetStatements).
     *  - If it were ever revived, its network path is androidbrowserhelper's
     *    Custom Tabs delegation to the user's browser at
     *    daymark-weather.pages.dev: the browser process performs the loading;
     *    the tree's own Java carries no network code (asserted below).
     *  - Scanning its Gradle/manifest files would false-positive on the
     *    `com.google.androidbrowserhelper:androidbrowserhelper` dependency
     *    string, which is a library reference, not first-party network code.
     *    Dependency strings are therefore never scanned, in either tree.
     *  - `android/kokoro-poc/` scripts download a SHA-256-pinned sherpa-onnx
     *    AAR at build time only; they never ship and are not scanned.
     *
     * Tripwire: the tree's first-party Java must stay free of direct network
     * APIs and URL literals (comment-stripped: its license headers and its one
     * GitHub-issue link live in comments), so a revival that adds network
     * code fails here. Deleting the tree outright also passes: there is then
     * nothing left to guard.
     */
    const retiredRoot = path.join(repoRoot, 'android', 'app', 'src');
    const files = existsSync(retiredRoot) ? collectJavaSources(retiredRoot) : [];
    expect(javaOffenders(files, repoRoot)).toEqual([]);
  });

  it('the Capacitor native HTTP bridge that would bypass the CSP stays disabled', () => {
    // If `plugins.CapacitorHttp` were enabled, WebView fetches would be routed
    // through Capacitor's native OkHttp stack, outside the WebView and outside
    // the CSP that every check above leans on. The bundled JSON is what the
    // Android shell actually reads at runtime.
    const config = readFileSync(path.join(appRoot, 'capacitor.config.ts'), 'utf8');
    expect(config).not.toContain('CapacitorHttp');
    expect(config).not.toMatch(/^\s*plugins\s*:/m);
    expect(config).toContain("androidScheme: 'https'");
    expect(config).toContain('allowMixedContent: false');
    const bundled = JSON.parse(
      readFileSync(path.join(appRoot, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json'), 'utf8'),
    ) as { plugins?: unknown; server?: { androidScheme?: string }; android?: { allowMixedContent?: boolean } };
    expect(bundled.plugins).toBeUndefined();
    expect(bundled.server?.androidScheme).toBe('https');
    expect(bundled.android?.allowMixedContent).toBe(false);
  });

  it('the web/PWA has no production browser speech path', () => {
    // The V2 web demo is weather-only. Android voice is native only; no source
    // module may construct or call the browser speech-recognition/synthesis
    // APIs. The policy pages may describe the absence in prose but do not use
    // these API identifiers.
    const files = collectSourceFiles(path.join(appRoot, 'src'))
      .filter((file) => !/src[\\/]pages[\\/]/.test(file));
    const forbidden = ['speechSynthesis', 'SpeechSynthesisUtterance', 'webkitSpeechRecognition', 'window.SpeechRecognition', 'new SpeechRecognition'];
    const offenders = files
      .filter((file) => {
        const code = stripTsComments(readFileSync(file, 'utf8'));
        return forbidden.some((token) => code.includes(token));
      })
      .map((file) => path.relative(appRoot, file));
    expect(offenders).toEqual([]);
  });

  it('the detectors actually fire (the guard is not vacuous)', () => {
    // URLs inside comments must be invisible to every scan above…
    const commented = stripTsComments(
      '// fetch("https://comment.example.com")\n/* https://block.example.com */',
    );
    expect(commented).not.toContain('comment.example.com');
    expect(commented).not.toContain('block.example.com');
    // …while URLs inside string literals survive stripping. This is exactly
    // what the previous regex stripper silently destroyed.
    const fetched = stripTsComments("const u = 'https://evil.example.com';");
    expect(fetched).toContain('https://evil.example.com');

    // A quote inside a regex literal must not corrupt scanning of later code.
    const afterRegex = stripTsComments(
      "const re = /[^a-z0-9'\\s-]/g; const u = 'https://after-regex.example.com';",
    );
    expect(afterRegex).toContain("/[^a-z0-9'\\s-]/g");
    expect(afterRegex).toContain('https://after-regex.example.com');

    // href anchors classify as navigation; bare URLs classify as fetchable.
    const mixed = stripTsComments(
      'const el = <a href="https://docs.example.com">x</a>; const u = "https://evil.example.com";',
    );
    const classified = [...mixed.matchAll(/https:\/\/([a-zA-Z0-9.-]+)/g)].map((match) => ({
      host: match[1],
      before: mixed.slice(Math.max(0, (match.index ?? 0) - 6), match.index ?? 0),
    }));
    expect(classified).toEqual([
      { host: 'docs.example.com', before: 'href="' },
      { host: 'evil.example.com', before: ' u = "' },
    ]);

    // A bare https:// before a non-host character is detected as dynamic
    // assembly (a URL the host-literal checks could never see).
    expect('fetch("https://" + host)'.match(/https:\/\/(?![a-zA-Z0-9.-])/)).not.toBeNull();
    // Protocol-relative URL strings are detected.
    expect('const b = "//tracker.example.com/px.gif";'.match(/["'`]\/\/[a-zA-Z0-9]/)).not.toBeNull();
    // Aliasing leaves the bare `fetch` word, which the word-level inventory catches.
    expect([...'const f = fetch; f(u);'.matchAll(/\bfetch\b/g)].length).toBe(1);

    // Java: license headers are ignored, string URL literals are caught.
    const java = stripJavaComments(
      '/* http://www.apache.org/licenses/LICENSE-2.0 */\n' +
        'String u = "https://java-string.example.com";\n' +
        'URLConnection c = new URL("http://cleartext.example.com").openConnection();\n',
    );
    expect(java).not.toContain('apache.org');
    expect(java).toContain('https://java-string.example.com');
    expect(java).toContain('http://cleartext.example.com');
    expect(java).toContain('openConnection(');
  });
});
