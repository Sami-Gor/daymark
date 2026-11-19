/**
 * Console boundary guard for recognition payloads.
 *
 * <p>Capacitor delivers plugin events by resolving the listener `PluginCall`.
 * Its JS bridge mirrors every call result into the WebView console with
 * `console.dir(JSON.stringify(result.data))`. Recognition result objects carry
 * the transcript, so the payload would reach the console bridge (and logcat)
 * unless it is stopped here.
 *
 * <p>This wrapper redacts sensitive keys from objects, JSON strings and errors
 * before they reach the platform console. It is independent of
 * `loggingBehavior`: even a debug build cannot forward the payload. Safe
 * metadata (session id, outcome code, durations, locale) is preserved.
 */

const SAFE_CONSOLE_MARK = Symbol.for('daymark.safe-console');

const SENSITIVE_KEY = /^(transcript|transcription|recognized_?text|audio|audio_?buffer|pcm|samples|phrase|speech|payload|request_?body|response_?body)$/i;
const SENSITIVE_JSON_KEY = /"(transcript|transcription|recognized_?text|audio|audio_?buffer|pcm|samples|phrase|speech|payload|request_?body|response_?body)"\s*:\s*"(?:\\\\.|[^"\\\\])*"/gi;
const MAX_DEPTH = 6;

export const REDACTED = '[redacted]';

function redactString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value;
  }
  try {
    return JSON.stringify(redact(JSON.parse(trimmed)));
  } catch {
    // Not valid JSON: at least strip obvious sensitive string fields.
    return value.replace(SENSITIVE_JSON_KEY, (match, key: string) => `"${key}":"${REDACTED}"`);
  }
}

function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (value instanceof Error) {
    const error: Record<string, unknown> = {
      name: value.name,
      message: redactString(value.message),
      // Stack traces do not carry recognition content; keep them short.
      stack: value.stack ? value.stack.split('\n').slice(0, 4).join('\n') : undefined,
    };
    // Errors are often given extra fields (code, context); keep the safe ones.
    for (const [key, entry] of Object.entries(value)) {
      error[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, depth + 1, seen);
    }
    return error;
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1, seen));
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, depth + 1, seen);
  }
  return output;
}

type ConsoleLike = Pick<Console, 'log' | 'info' | 'debug' | 'warn' | 'error' | 'dir' | 'trace' | 'group' | 'groupCollapsed' | 'table'>;

/** Installs the redaction wrapper once; repeated calls are no-ops. */
export function installSafeConsole(target: ConsoleLike = console): void {
  const marked = target as ConsoleLike & { [SAFE_CONSOLE_MARK]?: boolean };
  if (marked[SAFE_CONSOLE_MARK]) return;
  marked[SAFE_CONSOLE_MARK] = true;

  const methods: Array<keyof ConsoleLike> = [
    'log', 'info', 'debug', 'warn', 'error', 'dir', 'trace', 'group', 'groupCollapsed', 'table',
  ];
  for (const method of methods) {
    const original = target[method];
    if (typeof original !== 'function') continue;
    const bound = original.bind(target);
    target[method] = ((...args: unknown[]) => {
      bound(...args.map((argument) => redact(argument)));
    }) as never;
  }
}
