import type { Page } from '@playwright/test';

/*
 * Geolocation stubs for the app's "Use my location" flows.
 *
 * The real app calls navigator.geolocation.getCurrentPosition with success /
 * error callbacks and a 12 s timeout. These harnesses let a test decide when a
 * fix arrives (defer), how late it is (timed) and whether it fails.
 *
 * Tests that need the browser's own permission/geolocation emulation create
 * their own context with browser.newContext({ permissions, geolocation }); the
 * harness is not needed there.
 */
export class GeolocationHarness {
  constructor(private readonly page: Page) {}

  /** Install a stub whose callbacks fire only when the test resolves them. */
  async defer(): Promise<void> {
    await this.page.addInitScript(() => {
      const state = { calls: 0, pending: [] as Array<{ success: PositionCallback; error: PositionErrorCallback }> };
      (window as unknown as { __geo: typeof state }).__geo = state;
      navigator.geolocation.getCurrentPosition = ((success: PositionCallback, error: PositionErrorCallback) => {
        state.calls += 1;
        state.pending.push({ success, error });
      }) as typeof navigator.geolocation.getCurrentPosition;
    });
  }

  /**
   * Install a stub that simulates a fix after `simulatedDelayMs`, honouring the
   * app's own timeout option. Reports code 3 (timeout) when the delay exceeds
   * it, otherwise succeeds with a representative London fix.
   */
  async timed(simulatedDelayMs: number): Promise<void> {
    await this.page.addInitScript((delay: number) => {
      const state = { calls: 0, options: null as PositionOptions | null };
      (window as unknown as { __geo: typeof state }).__geo = state;
      navigator.geolocation.getCurrentPosition = ((success: PositionCallback, error: PositionErrorCallback, options?: PositionOptions) => {
        state.calls += 1;
        state.options = options ?? null;
        window.setTimeout(() => {
          if (options && delay > (options.timeout ?? 0)) {
            error({ code: 3, message: 'simulated timeout' } as GeolocationPositionError);
          } else {
            success({ coords: { latitude: 51.5074567, longitude: -0.12789012 } } as GeolocationPosition);
          }
        }, 10);
      }) as typeof navigator.geolocation.getCurrentPosition;
    }, simulatedDelayMs);
  }

  /** Resolve every pending request with the same fix. */
  async resolve(latitude: number, longitude: number): Promise<void> {
    await this.page.evaluate(([lat, lon]) => {
      const state = (window as unknown as { __geo: { pending: Array<{ success: (position: unknown) => void }> } }).__geo;
      for (const entry of state.pending.splice(0)) {
        entry.success({ coords: { latitude: lat, longitude: lon } });
      }
    }, [latitude, longitude] as const);
  }

  /** Resolve pending requests in submission order (for repeated-tap scenarios). */
  async resolveEach(coords: Array<{ latitude: number; longitude: number }>): Promise<void> {
    await this.page.evaluate((fixes) => {
      const state = (window as unknown as { __geo: { pending: Array<{ success: (position: unknown) => void }> } }).__geo;
      const pending = state.pending.splice(0);
      pending.forEach((entry, index) => {
        const fix = fixes[index] ?? fixes[fixes.length - 1];
        entry.success({ coords: { latitude: fix.latitude, longitude: fix.longitude } });
      });
    }, coords);
  }

  /** Fail every pending request with a GeolocationPositionError code. */
  async fail(code: number): Promise<void> {
    await this.page.evaluate((errorCode) => {
      const state = (window as unknown as { __geo: { pending: Array<{ error: (error: unknown) => void }> } }).__geo;
      for (const entry of state.pending.splice(0)) {
        entry.error({ code: errorCode, message: 'stub' });
      }
    }, code);
  }

  async calls(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { __geo?: { calls?: number } }).__geo?.calls ?? 0);
  }

  async pendingCount(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { __geo?: { pending?: unknown[] } }).__geo?.pending?.length ?? 0);
  }

  async options(): Promise<PositionOptions | null> {
    return this.page.evaluate(() => (window as unknown as { __geo?: { options?: PositionOptions | null } }).__geo?.options ?? null);
  }
}
