import type { Page } from '@playwright/test';

/*
 * Browser speech API stubs.
 *
 * Installed through addInitScript so they exist before the app's hooks run.
 * The fixture (support/fixtures.ts) installs them for tests that request
 * `speech`, with options for unsupported recognition and failing playback.
 */

export type SpeechPlaybackOptions = {
  failOnSpeak?: boolean;
};

export class SpeechHarness {
  constructor(private readonly page: Page) {}

  /** Stub SpeechSynthesisUtterance + speechSynthesis, recording spoken text. */
  async installPlayback(options: SpeechPlaybackOptions = {}): Promise<void> {
    await this.page.addInitScript((failOnSpeak: boolean) => {
      class FakeUtterance {
        text: string;
        lang = '';
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }
      const state = { spoken: [] as string[], cancelCount: 0, last: null as { onend?: () => void } | null };
      const synthesis = {
        speaking: false,
        speak(utterance: { text: string }) {
          if (failOnSpeak) throw new Error('no audio output');
          state.last = utterance as { onend?: () => void };
          state.spoken.push(utterance.text);
        },
        cancel() {
          state.cancelCount += 1;
        },
        getVoices() {
          return [];
        },
      };
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
      Object.defineProperty(window, 'speechSynthesis', { value: synthesis, configurable: true });
      (window as unknown as { __speech: typeof state }).__speech = state;
    }, Boolean(options.failOnSpeak));
  }

  /** Stub the SpeechRecognition API, optionally absent to model an unsupported browser. */
  async installRecognition(supported = true): Promise<void> {
    await this.page.addInitScript((isSupported: boolean) => {
      const state = {
        starts: 0,
        stops: 0,
        aborts: 0,
        instance: null as unknown as {
          onresult?: ((event: unknown) => void) | null;
          onerror?: ((event: unknown) => void) | null;
          onend?: (() => void) | null;
        } | null,
      };
      class FakeRecognition {
        lang = '';
        continuous = true;
        interimResults = true;
        maxAlternatives = 1;
        onstart: (() => void) | null = null;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        constructor() {
          state.instance = this;
        }
        start() {
          state.starts += 1;
        }
        stop() {
          state.stops += 1;
        }
        abort() {
          state.aborts += 1;
        }
      }
      Object.defineProperty(window, 'SpeechRecognition', { value: isSupported ? FakeRecognition : undefined, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
      (window as unknown as { __recognition: typeof state }).__recognition = state;
    }, supported);
  }

  async playbackState(): Promise<{ spoken: string[]; cancelCount: number }> {
    return this.page.evaluate(() => {
      const state = (window as unknown as { __speech?: { spoken: string[]; cancelCount: number } }).__speech;
      return { spoken: state?.spoken ?? [], cancelCount: state?.cancelCount ?? 0 };
    });
  }

  async spoken(): Promise<string[]> {
    return (await this.playbackState()).spoken;
  }

  async cancelCount(): Promise<number> {
    return (await this.playbackState()).cancelCount;
  }

  /** Fire the current utterance's end callback, as a real browser would. */
  async finishUtterance(): Promise<void> {
    await this.page.evaluate(() => (window as unknown as { __speech?: { last?: { onend?: () => void } | null } }).__speech?.last?.onend?.());
  }

  async recognitionState(): Promise<{ starts: number; stops: number; aborts: number }> {
    return this.page.evaluate(() => {
      const state = (window as unknown as { __recognition?: { starts: number; stops: number; aborts: number } }).__recognition;
      return { starts: state?.starts ?? 0, stops: state?.stops ?? 0, aborts: state?.aborts ?? 0 };
    });
  }

  async emitResult(transcript: string): Promise<boolean> {
    return this.page.evaluate((text: string) => {
      const instance = (window as unknown as { __recognition?: { instance?: { onresult?: (event: unknown) => void } | null } }).__recognition?.instance;
      if (!instance?.onresult) return false;
      instance.onresult({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true }] });
      return true;
    }, transcript);
  }

  async emitRecognitionEnd(): Promise<void> {
    await this.page.evaluate(() => (window as unknown as { __recognition?: { instance?: { onend?: (() => void) | null } | null } }).__recognition?.instance?.onend?.());
  }

  async emitError(error: string): Promise<void> {
    await this.page.evaluate((code: string) => (window as unknown as { __recognition?: { instance?: { onerror?: (event: unknown) => void } | null } }).__recognition?.instance?.onerror?.({ error: code }), error);
  }
}
