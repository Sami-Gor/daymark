import { expect, test, type Page } from '../support/fixtures';
import { WINDY_FORECAST } from '../support/test-data';

/*
 * Mobile layout: touch-target sizing, text legibility, viewport insets, the
 * hero actions and the search results panel at narrow phone widths.
 *
 * The canonical mocks are installed automatically by the `api` fixture; tests
 * that need alerts use the windy forecast override. Speech stubs are requested
 * through the `speech` fixture so the voice controls render before navigation.
 */

test.describe('mobile touch targets and legibility', () => {
  async function expectMinHeight(page: Page, selector: string, min: number) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${selector} should be rendered`).not.toBeNull();
    // Allow sub-pixel rendering tolerance; this is a threshold, not a snapshot.
    expect(box!.height, `${selector} height`).toBeGreaterThanOrEqual(min - 0.5);
  }

  test('key mobile controls meet the ~40px target at 390px and 320px', async ({ page, dashboard, speech }) => {
    // Requesting `speech` installs the playback and recognition stubs before navigation.
    void speech;
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await dashboard.goto('/');
      for (const selector of [
        '[data-testid="select-language"]',
        '.icon-button',
        '.location-search-field',
        '[data-testid="button-refresh-location"]',
        '[data-testid="button-hear-today"]',
        '[data-testid="button-ask-daymark"]',
      ]) {
        await expectMinHeight(page, selector, 40);
      }
      const locate = await page.locator('.icon-button').first().boundingBox();
      expect(locate!.width, 'locate control width').toBeGreaterThanOrEqual(39.5);
      const celsius = await page.locator('[data-testid="button-unit-celsius"]').boundingBox();
      expect(celsius!.height, 'unit button height').toBeGreaterThanOrEqual(39.5);
    }
  });

  test('alert disclaimer, severity and voice privacy note are at least 11px', async ({ page, api, speech, voice }) => {
    void speech;
    await api.forecast(WINDY_FORECAST);
    await page.goto('/');

    const alertMeta = page.locator('.alert-meta').first();
    await expect(alertMeta).toBeVisible();
    await expect(alertMeta).toContainText('not an official warning');
    const alertMetaSize = await alertMeta.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(alertMetaSize, 'alert disclaimer font size').toBeGreaterThanOrEqual(11);

    const severitySize = await page.locator('.alert-severity').first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(severitySize, 'alert severity font size').toBeGreaterThanOrEqual(11);

    const privacySize = await voice.askPrivacy.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(privacySize, 'voice privacy note font size').toBeGreaterThanOrEqual(11);
  });

  test('search options are tappable and remain keyboard-selectable', async ({ page, api, search, dashboard }) => {
    await api.locations();
    await page.goto('/');
    await search.search('tokyo');
    const option = search.option(0);
    await expect(option).toBeVisible();
    const box = await option.boundingBox();
    expect(box!.height, 'location option height').toBeGreaterThanOrEqual(39.5);

    await search.pressArrowDown();
    await search.pressEnter();
    await dashboard.expectCity('Tokyo');
  });

  test('EN, FR and ES stay overflow-free at 320px', async ({ page, api, dashboard }) => {
    await api.forecast(WINDY_FORECAST);
    await page.setViewportSize({ width: 320, height: 900 });
    await dashboard.goto('/');
    for (const locale of ['en', 'fr', 'es'] as const) {
      await dashboard.setLanguage(locale);
      const overflow = await dashboard.horizontalOverflow();
      expect(overflow, `overflow for ${locale}`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('mobile viewport layout', () => {
  test('header controls stay fully inside the viewport on narrow phones', async ({ page, dashboard }) => {
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await dashboard.goto('/');
      await dashboard.expectReady();
      for (const selector of ['.locale-select', '.unit-switch', '.icon-button']) {
        const box = await page.locator(selector).boundingBox();
        expect(box, `${selector} at ${width}px`).not.toBeNull();
        expect(box!.x, `${selector} left edge at ${width}px`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${selector} right edge at ${width}px`).toBeLessThanOrEqual(width + 0.5);
      }
    }
  });

  test('content keeps a comfortable inset and the search input avoids iOS zoom', async ({ page, dashboard, search }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await dashboard.goto('/');
      await dashboard.expectReady();
      for (const selector of ['.place-title', '.location-search-field', '.forecast-panel', '.uv-panel']) {
        const box = await page.locator(selector).first().boundingBox();
        expect(box, `${selector} at ${width}px`).not.toBeNull();
        expect(box!.x, `${selector} left inset at ${width}px`).toBeGreaterThanOrEqual(16);
        expect(box!.x + box!.width, `${selector} right inset at ${width}px`).toBeLessThanOrEqual(width - 16 + 0.5);
      }
      const inputSize = await search.input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      expect(inputSize, `search input size at ${width}px`).toBeGreaterThanOrEqual(16);
    }
  });

  test('hero temperature scales with narrow phones instead of overflowing its block', async ({ page, dashboard }) => {
    const sizes: number[] = [];
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await dashboard.goto('/');
      await dashboard.expectReady();
      const size = await page.locator('.current-temp').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      sizes.push(size);
      const box = await page.locator('.current-temp').boundingBox();
      expect(box!.x + box!.width, `temperature within viewport at ${width}px`).toBeLessThanOrEqual(width + 0.5);
    }
    expect(sizes[0], 'temperature at 320px').toBeLessThanOrEqual(96);
    expect(sizes[0]).toBeLessThanOrEqual(sizes[1]);
    expect(sizes[1]).toBeLessThanOrEqual(sizes[2]);
  });

  test('hero actions meet 44px and never clip their labels in EN/FR/ES', async ({ page, dashboard, speech }) => {
    void speech;
    await page.setViewportSize({ width: 320, height: 800 });
    await dashboard.goto('/');
    await expect(dashboard.currentCity).toBeVisible();
    for (const locale of ['en', 'fr', 'es'] as const) {
      await dashboard.setLanguage(locale);
      const buttons = page.locator('.today-hero .local-button');
      const count = await buttons.count();
      expect(count, `${locale} action count`).toBeGreaterThanOrEqual(3);
      for (let index = 0; index < count; index += 1) {
        const button = buttons.nth(index);
        const box = await button.boundingBox();
        expect(box!.height, `${locale} button ${index} height`).toBeGreaterThanOrEqual(43.5);
        const labelFits = await button.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
        expect(labelFits, `${locale} button ${index} label clipping`).toBe(true);
      }
    }
  });

  test('privacy pages keep header, text and language switcher inside 320px', async ({ page, privacy }) => {
    for (const path of ['/privacy', '/fr/privacy', '/es/privacy']) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(path);
      await expect(privacy.article).toBeVisible();
      const back = await privacy.backHome.boundingBox();
      expect(back!.x + back!.width, `${path} back link right edge`).toBeLessThanOrEqual(320.5);
      const paragraph = await page.locator('.privacy-policy p').first().boundingBox();
      expect(paragraph!.x, `${path} paragraph inset`).toBeGreaterThanOrEqual(16);
      const chip = await privacy.languageLink('es').boundingBox();
      expect(chip!.x + chip!.width, `${path} language chip right edge`).toBeLessThanOrEqual(320.5);
    }
  });

  test('search results panel aligns with the field and stays in view', async ({ page, api, search }) => {
    await api.locations();
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await search.search('tokyo');
    await expect(search.option(0)).toBeVisible();
    const field = await page.locator('.location-search-field').boundingBox();
    const panel = await search.results.boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(Math.abs(panel!.x - field!.x), 'panel left alignment').toBeLessThanOrEqual(1);
    expect(Math.abs(panel!.width - field!.width), 'panel width alignment').toBeLessThanOrEqual(1);
    expect(panel!.x, 'panel left inset').toBeGreaterThanOrEqual(15.5);
    expect(panel!.x + panel!.width, 'panel right inset').toBeLessThanOrEqual(viewportWidth - 16 + 0.5);
  });
});
