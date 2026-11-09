import { expect, type Page } from '@playwright/test';

/*
 * Narrow, test-only instrumentation for the offline locality Web Worker.
 *
 * The app loads the locality dataset and resolves the place label in a module
 * worker (src/workers/locality.worker.ts). Its `{type:'result'}` message is the
 * only observable signal that a lookup actually finished, and production code
 * deliberately exposes no test hook for it. `install()` wraps `window.Worker`
 * with `addInitScript` before the app boots and records `message` events for
 * workers whose URL contains 'locality.worker' (the built asset is
 * `assets/locality.worker-<hash>.js`); every other Worker is returned untouched
 * and every message is only recorded, never altered, so the app's own handling
 * is unaffected. No production API or bundle change is involved.
 *
 * The recorded messages live on the page global
 * `window.__daymarkLocalityWorkerMessages`.
 */

export type LocalityWorkerMatch = {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  countryCode?: string;
  featureCode?: string;
  distanceKm?: number;
};

export type LocalityWorkerReadyMessage = { type: 'ready'; ok: boolean };

export type LocalityWorkerResultMessage = {
  type: 'result';
  id: number;
  match: LocalityWorkerMatch | null;
};

export type LocalityWorkerMessage = LocalityWorkerReadyMessage | LocalityWorkerResultMessage;

export class LocalityWorkerProbe {
  constructor(private readonly page: Page) {}

  /** Install the recorder. Must be called before the first navigation. */
  async install(): Promise<void> {
    await this.page.addInitScript(() => {
      const probeWindow = window as Window & { __daymarkLocalityWorkerMessages?: unknown[] };
      const messages: unknown[] = [];
      probeWindow.__daymarkLocalityWorkerMessages = messages;
      const OriginalWorker = window.Worker;
      if (typeof OriginalWorker !== 'function') return;
      /**
       * Replacement Worker constructor installed inside the page.
       *
       * Forwards to the real Worker; locality-worker instances also get a
       * message listener that records events into `messages`. Every other
       * worker is passed through untouched and no message is altered, so the
       * app's dataset lookup behaves exactly as it does in production.
       */
      function ProbeWorker(this: unknown, scriptURL: string | URL, options?: WorkerOptions): Worker {
        const worker = new OriginalWorker(scriptURL, options);
        if (String(scriptURL).includes('locality.worker')) {
          worker.addEventListener('message', (event: MessageEvent) => {
            messages.push(event.data);
          });
        }
        return worker;
      }
      window.Worker = ProbeWorker as unknown as typeof Worker;
    });
  }

  /** Every recorded worker message, in delivery order. */
  async messages(): Promise<LocalityWorkerMessage[]> {
    const recorded = await this.page.evaluate(() => {
      const probeWindow = window as Window & { __daymarkLocalityWorkerMessages?: unknown[] };
      return probeWindow.__daymarkLocalityWorkerMessages ?? [];
    });
    return recorded as LocalityWorkerMessage[];
  }

  /** Only the `{type:'result'}` messages (lookups that produced an answer). */
  async results(): Promise<LocalityWorkerResultMessage[]> {
    const messages = await this.messages();
    return messages.filter((message): message is LocalityWorkerResultMessage => message.type === 'result');
  }

  async resultCount(): Promise<number> {
    return (await this.results()).length;
  }

  /**
   * Retrying assertion: resolves with the newest worker result once at least
   * `since + 1` result messages have been recorded. `since` lets a caller wait
   * for a result produced after a marker instead of a pre-existing one.
   */
  async waitForResult(options: { since?: number; timeout?: number } = {}): Promise<LocalityWorkerResultMessage> {
    const since = options.since ?? 0;
    await expect
      .poll(() => this.resultCount(), {
        timeout: options.timeout ?? 5_000,
        message: 'expected the locality Web Worker to post a {type:"result"} message',
      })
      .toBeGreaterThan(since);
    const results = await this.results();
    return results[results.length - 1];
  }
}
