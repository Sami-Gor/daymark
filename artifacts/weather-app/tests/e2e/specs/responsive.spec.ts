import { expect, test } from '../support/fixtures';

/*
 * Cross-breakpoint layout: every supported width must stay free of horizontal
 * overflow, and the redesigned data sections must keep their live values inside
 * the mobile viewport.
 *
 * Each case needs its own viewport installed before the app's first render, so
 * the width is set per test rather than in a shared beforeEach. The canonical
 * Open-Meteo and locality mocks come from the automatic `api` fixture.
 */

test.describe('responsive layout across breakpoints', () => {
  const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440];

  for (const width of widths) {
    test(`no horizontal overflow at ${width}px`, async ({ page, dashboard }) => {
      await page.setViewportSize({ width, height: 900 });
      await dashboard.goto('/');
      await dashboard.expectReady();
      const overflow = await dashboard.horizontalOverflow();
      expect(overflow).toBeLessThanOrEqual(0);
      const uvStrip = await page.evaluate(() => {
        const el = document.querySelector('.uv-days-wrap');
        return el ? el.scrollWidth <= el.clientWidth + 1 : true;
      });
      expect(uvStrip).toBe(true);
    });
  }

  test('redesigned sections fit mobile width with live values', async ({ page, dashboard, sections }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await dashboard.goto('/');
    await expect(sections.temperatureDots).toHaveCount(5);
    await expect(sections.rainPoints).toHaveCount(5);
    const overflow = await dashboard.horizontalOverflow();
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('long location names wrap safely', async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await dashboard.goto('/');
    await dashboard.currentCity.evaluate((el) => {
      el.textContent = 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch';
    });
    const overflow = await dashboard.horizontalOverflow();
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
