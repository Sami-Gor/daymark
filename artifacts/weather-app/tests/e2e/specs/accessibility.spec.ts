import { expectAnimationsSettled } from '../support/animations';
import { expect, test } from '../support/fixtures';

/*
 * Accessibility and zoom: axe must find no serious/critical violations at
 * desktop and mobile widths, and the viewport must not block pinch zoom.
 *
 * The axe test needs reduced motion so it measures final colours rather than
 * mid-transition blends (the app honours prefers-reduced-motion); that
 * emulation is scoped to that test, matching the original suite.
 */

test.describe('accessibility and zoom', () => {
  test('core a11y checks pass at desktop and mobile', async ({ page, dashboard }) => {
    const { AxeBuilder } = await import('@axe-core/playwright');
    // Reduced motion collapses the entrance animations to one 0.01 ms
    // iteration; the retrying helper below then waits on the browser's own
    // animation timeline (no running/pending animation) instead of sleeping a
    // guessed interval before each colour scan.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dashboard.open();

    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      // Resizing can start layout transitions, so settle before every scan.
      await expectAnimationsSettled(page);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious).toEqual([]);
    }
  });

  test('viewport allows pinch zoom and unit controls expose state', async ({ page, dashboard }) => {
    await dashboard.open();
    const content = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute('content'));
    expect(content).not.toContain('maximum-scale');
    expect(content).not.toContain('user-scalable=no');
    await expect(dashboard.celsiusButton).toHaveAttribute('aria-pressed', 'true');
    await expect(dashboard.currentCity).toBeVisible();
    const h1 = await page.evaluate(() => document.querySelectorAll('h1').length);
    expect(h1).toBeGreaterThanOrEqual(1);
  });
});
