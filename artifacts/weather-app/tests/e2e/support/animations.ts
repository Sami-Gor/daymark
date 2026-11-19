import { expect, type Page } from '@playwright/test';

/*
 * Observable animation settling for the axe colour scans.
 *
 * Daymark's entrance, chart and ticker animations are CSS-driven. The
 * accessibility scans run with `prefers-reduced-motion: reduce`, where
 * src/index.css collapses every animation to a single 0.01 ms iteration, but a
 * scan must still not run against a mid-transition colour blend. A fixed sleep
 * only guesses when the page settled; the browser exposes the real signal via
 * `document.getAnimations()`.
 *
 * Finished animations are NOT removed from `document.getAnimations()` (they
 * stay until garbage-collected), so "the array is empty" is the wrong check.
 * The settled state is "no animation is running or pending"; that is what this
 * module asserts, and it retries until true (or the timeout expires).
 */

/**
 * Labels for animations the browser still considers in flight. The label is
 * diagnostic only (it shows up in the assertion diff on timeout): CSS
 * animations are named via `animationName`, transitions via
 * `transitionProperty`, and anything else falls back to the element's tag.
 */
export async function activeAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    if (typeof document.getAnimations !== 'function') return [];
    return document.getAnimations()
      .filter((animation) => animation.playState === 'running' || animation.pending)
      .map((animation) => {
        const named = animation as Animation & { animationName?: string; transitionProperty?: string };
        const effect = animation.effect as KeyframeEffect | null;
        const target = effect?.target ?? null;
        const name = named.animationName
          ?? named.transitionProperty
          ?? (target instanceof Element ? target.tagName.toLowerCase() : 'animation');
        return `${String(name)} (${animation.playState}${animation.pending ? ', pending' : ''})`;
      });
  });
}

/**
 * Retrying assertion used only immediately before an axe scan: resolves once no
 * animation is running or pending. Not a general-purpose sleep — callers must
 * have a real reason to want the colour scan delayed.
 *
 * Precondition: reduced motion must already be emulated on the page. Callers
 * must `await page.emulateMedia({ reducedMotion: 'reduce' })` before invoking
 * this helper (the existing callers do so before navigating, so first-paint
 * animations are already covered). Daymark's stylesheet uses
 * `@media (prefers-reduced-motion: reduce)` in src/index.css to collapse its
 * persistent ticker/chart animations to a single 0.01 ms iteration; without
 * that emulation an infinite animation can stay running and this poll will time
 * out instead of settling. The helper deliberately does not configure media
 * emulation itself, leaving the scan environment explicit at the call site.
 */
export async function expectAnimationsSettled(page: Page, options: { timeout?: number } = {}): Promise<void> {
  await expect
    .poll(() => activeAnimations(page), {
      timeout: options.timeout ?? 5_000,
      message: 'expected every animation to leave the running/pending state before the a11y colour scan',
    })
    .toEqual([]);
}
