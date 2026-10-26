import { describe, expect, it, vi } from 'vitest';
import { installSafeConsole, REDACTED } from './safe-console';

function fakeConsole() {
  const calls: unknown[][] = [];
  const record = (...args: unknown[]) => calls.push(args);
  return {
    calls,
    target: {
      log: vi.fn(record),
      info: vi.fn(record),
      debug: vi.fn(record),
      warn: vi.fn(record),
      error: vi.fn(record),
      dir: vi.fn(record),
      trace: vi.fn(record),
      group: vi.fn(record),
      groupCollapsed: vi.fn(record),
      table: vi.fn(record),
    },
  };
}

describe('safe console boundary', () => {
  it('redacts the transcript from a recognition result but keeps safe metadata', () => {
    const { calls, target } = fakeConsole();
    installSafeConsole(target);
    target.log({ sessionId: 7, transcript: 'SYNTHETIC_PRIVATE_PHRASE', code: 'result', capturedMs: 1234 });
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain('SYNTHETIC_PRIVATE_PHRASE');
    expect(logged).toContain('sessionId');
    expect(logged).toContain('1234');
    expect(logged).toContain('result');
  });

  it('redacts a serialized JSON payload passed as a string', () => {
    const { calls, target } = fakeConsole();
    installSafeConsole(target);
    target.dir(JSON.stringify({ sessionId: 9, transcript: 'JSON_PRIVATE_PHRASE' }));
    const logged = String(calls[0][0]);
    expect(logged).not.toContain('JSON_PRIVATE_PHRASE');
    expect(logged).toContain('"sessionId":9');
    expect(logged).toContain(REDACTED);
  });

  it('redacts nested payloads and error objects without hiding the category', () => {
    const { calls, target } = fakeConsole();
    installSafeConsole(target);
    const error = Object.assign(new Error('recognition failed'), {
      code: 'offline-unavailable',
      transcript: 'ERROR_PRIVATE_PHRASE',
      context: { audio: 'RAW_AUDIO', sessionId: 11 },
    });
    target.error(error);
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain('ERROR_PRIVATE_PHRASE');
    expect(logged).not.toContain('RAW_AUDIO');
    expect(logged).toContain('offline-unavailable');
  });

  it('is idempotent and leaves non-sensitive values intact', () => {
    const { calls, target } = fakeConsole();
    installSafeConsole(target);
    installSafeConsole(target);
    target.warn('plain message', 42, true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['plain message', 42, true]);
  });
});
