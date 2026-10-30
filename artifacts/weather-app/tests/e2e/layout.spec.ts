import { expect, test, type Page } from '@playwright/test';
import { WINDY_FORECAST, mockLocations, mockOpenMeteo } from './helpers';
test.describe('responsive', () => {
  const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440];

  for (const width of widths) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await mockOpenMeteo(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const uvStrip = await page.evaluate(() => {
        const el = document.querySelector('.uv-days-wrap');
        return el ? el.scrollWidth <= el.clientWidth + 1 : true;
      });
      expect(uvStrip).toBe(true);
    });
  }

  test('redesigned sections fit mobile width with live values', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByTestId('list-hourly-forecast').locator('.temp-dot')).toHaveCount(5);
    await expect(page.getByTestId('list-rain-probability').locator('.rain-point')).toHaveCount(5);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('long location names wrap safely', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/');
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="text-current-city"]');
      if (el) el.textContent = 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch';
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('accessibility', () => {
  test('core a11y checks pass at desktop and mobile', async ({ page }) => {
    const { AxeBuilder } = await import('@axe-core/playwright');
    await mockOpenMeteo(page);
    // Settle entrance animations so axe measures final colors, not
    // mid-transition blends (the app honors prefers-reduced-motion).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await page.waitForTimeout(300);

    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious).toEqual([]);
    }
  });

  test('viewport allows pinch zoom and unit controls expose state', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    const content = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute('content'));
    expect(content).not.toContain('maximum-scale');
    expect(content).not.toContain('user-scalable=no');
    await expect(page.getByTestId('button-unit-celsius')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('text-current-city')).toBeVisible();
    const h1 = await page.evaluate(() => document.querySelectorAll('h1').length);
    expect(h1).toBeGreaterThanOrEqual(1);
  });
});

test.describe('hero action hierarchy', () => {
  test('keeps the web weather controls and exposes no voice controls', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');

    await expect(page.getByTestId('input-location-search')).toBeVisible();
    await expect(page.getByTestId('button-refresh-location')).toBeVisible();
    await expect(page.getByTestId('button-hear-today')).toHaveCount(0);
    await expect(page.getByTestId('button-ask-daymark')).toHaveCount(0);
    await expect(page.getByTestId('web-demo-note')).toBeVisible();

    const searchPrecedesLocate = await page.evaluate(() => {
      const search = document.querySelector('[data-testid="input-location-search"]');
      const locate = document.querySelector('[data-testid="button-refresh-location"]');
      if (!search || !locate) return false;
      return (search.compareDocumentPosition(locate) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(searchPrecedesLocate).toBe(true);
  });

  test('keeps the web weather controls visible and unclipped at 320px', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const id of ['input-location-search', 'button-refresh-location', 'web-demo-note']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('button-hear-today')).toHaveCount(0);
    await expect(page.getByTestId('button-ask-daymark')).toHaveCount(0);
  });

  test('keeps localized web labels visible without advertising web voice', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');

    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
    await expect(page.getByTestId('web-demo-note')).toContainText(/Démo web/);
    await expect(page.getByTestId('button-hear-today')).toHaveCount(0);
    await expect(page.getByTestId('button-ask-daymark')).toHaveCount(0);

    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Usar mi ubicación/);
    await expect(page.getByTestId('web-demo-note')).toContainText(/Demo web/);
    await expect(page.getByTestId('button-hear-today')).toHaveCount(0);
    await expect(page.getByTestId('button-ask-daymark')).toHaveCount(0);
  });
});

test.describe('mobile touch targets and legibility', () => {
  async function expectMinHeight(page: Page, selector: string, min: number) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${selector} should be rendered`).not.toBeNull();
    // Allow sub-pixel rendering tolerance; this is a threshold, not a snapshot.
    expect(box!.height, `${selector} height`).toBeGreaterThanOrEqual(min - 0.5);
  }

  test('key mobile controls meet the ~40px target at 390px and 320px', async ({ page }) => {
    await mockOpenMeteo(page);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      for (const selector of [
        '[data-testid="select-language"]',
        '.icon-button',
        '.location-search-field',
        '[data-testid="button-refresh-location"]',
      ]) {
        await expectMinHeight(page, selector, 40);
      }
      const locate = await page.locator('.icon-button').first().boundingBox();
      expect(locate!.width, 'locate control width').toBeGreaterThanOrEqual(39.5);
      const celsius = await page.locator('[data-testid="button-unit-celsius"]').boundingBox();
      expect(celsius!.height, 'unit button height').toBeGreaterThanOrEqual(39.5);
    }
  });

  test('alert disclaimer, severity and web demo note are at least 11px', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.goto('/');

    const alertMeta = page.locator('.alert-meta').first();
    await expect(alertMeta).toBeVisible();
    await expect(alertMeta).toContainText('not an official warning');
    const alertMetaSize = await alertMeta.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(alertMetaSize, 'alert disclaimer font size').toBeGreaterThanOrEqual(11);

    const severitySize = await page.locator('.alert-severity').first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(severitySize, 'alert severity font size').toBeGreaterThanOrEqual(11);

    const demoNoteSize = await page.getByTestId('web-demo-note').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(demoNoteSize, 'web demo note font size').toBeGreaterThanOrEqual(11);
  });

  test('search options are tappable and remain keyboard-selectable', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    const input = page.getByTestId('input-location-search');
    await input.fill('tokyo');
    const option = page.getByTestId('location-option-0');
    await expect(option).toBeVisible();
    const box = await option.boundingBox();
    expect(box!.height, 'location option height').toBeGreaterThanOrEqual(39.5);

    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
  });

  test('EN, FR and ES stay overflow-free at 320px', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    for (const locale of ['en', 'fr', 'es']) {
      await page.getByTestId('select-language').selectOption(locale);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow for ${locale}`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('mobile layout', () => {
  test('header controls stay fully inside the viewport on narrow phones', async ({ page }) => {
    await mockOpenMeteo(page);
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      for (const selector of ['.locale-select', '.unit-switch', '.icon-button']) {
        const box = await page.locator(selector).boundingBox();
        expect(box, `${selector} at ${width}px`).not.toBeNull();
        expect(box!.x, `${selector} left edge at ${width}px`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${selector} right edge at ${width}px`).toBeLessThanOrEqual(width + 0.5);
      }
    }
  });

  test('content keeps a comfortable inset and the search input avoids iOS zoom', async ({ page }) => {
    await mockOpenMeteo(page);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      for (const selector of ['.place-title', '.location-search-field', '.forecast-panel', '.uv-panel']) {
        const box = await page.locator(selector).first().boundingBox();
        expect(box, `${selector} at ${width}px`).not.toBeNull();
        expect(box!.x, `${selector} left inset at ${width}px`).toBeGreaterThanOrEqual(16);
        expect(box!.x + box!.width, `${selector} right inset at ${width}px`).toBeLessThanOrEqual(width - 16 + 0.5);
      }
      const inputSize = await page.getByTestId('input-location-search').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      expect(inputSize, `search input size at ${width}px`).toBeGreaterThanOrEqual(16);
    }
  });

  test('hero temperature scales with narrow phones instead of overflowing its block', async ({ page }) => {
    await mockOpenMeteo(page);
    const sizes: number[] = [];
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      const size = await page.locator('.current-temp').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      sizes.push(size);
      const box = await page.locator('.current-temp').boundingBox();
      expect(box!.x + box!.width, `temperature within viewport at ${width}px`).toBeLessThanOrEqual(width + 0.5);
    }
    expect(sizes[0], 'temperature at 320px').toBeLessThanOrEqual(96);
    expect(sizes[0]).toBeLessThanOrEqual(sizes[1]);
    expect(sizes[1]).toBeLessThanOrEqual(sizes[2]);
  });

  test('hero actions meet 44px and never clip their labels in EN/FR/ES', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toBeVisible();
    for (const locale of ['en', 'fr', 'es']) {
      await page.getByTestId('select-language').selectOption(locale);
      const buttons = page.locator('.today-hero .local-button');
      const count = await buttons.count();
      expect(count, `${locale} action count`).toBeGreaterThanOrEqual(1);
      for (let index = 0; index < count; index += 1) {
        const button = buttons.nth(index);
        const box = await button.boundingBox();
        expect(box!.height, `${locale} button ${index} height`).toBeGreaterThanOrEqual(43.5);
        const labelFits = await button.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
        expect(labelFits, `${locale} button ${index} label clipping`).toBe(true);
      }
    }
  });

  test('privacy pages keep header, text and language switcher inside 320px', async ({ page }) => {
    for (const path of ['/privacy', '/fr/privacy', '/es/privacy']) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(path);
      await expect(page.getByTestId('page-privacy')).toBeVisible();
      const back = await page.getByTestId('link-back-home').boundingBox();
      expect(back!.x + back!.width, `${path} back link right edge`).toBeLessThanOrEqual(320.5);
      const paragraph = await page.locator('.privacy-policy p').first().boundingBox();
      expect(paragraph!.x, `${path} paragraph inset`).toBeGreaterThanOrEqual(16);
      const chip = await page.getByTestId('link-privacy-lang-es').boundingBox();
      expect(chip!.x + chip!.width, `${path} language chip right edge`).toBeLessThanOrEqual(320.5);
    }
  });

  test('search results panel aligns with the field and stays in view', async ({ page }) => {
    await mockLocations(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('tokyo');
    await expect(page.getByTestId('location-option-0')).toBeVisible();
    const field = await page.locator('.location-search-field').boundingBox();
    const panel = await page.getByTestId('location-results').boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(Math.abs(panel!.x - field!.x), 'panel left alignment').toBeLessThanOrEqual(1);
    expect(Math.abs(panel!.width - field!.width), 'panel width alignment').toBeLessThanOrEqual(1);
    expect(panel!.x, 'panel left inset').toBeGreaterThanOrEqual(15.5);
    expect(panel!.x + panel!.width, 'panel right inset').toBeLessThanOrEqual(viewportWidth - 16 + 0.5);
  });
});

test.describe('store promo gallery', () => {
  test('renders the five Play promo images in listing order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/store-preview');

    const images = page.locator('.store-promo-gallery img');
    await expect(images).toHaveCount(5);
    await expect(page.locator('.store-promo-title')).toHaveText([
      'Temperature',
      'Chance of rain',
      'Air quality',
      'Sun & daylight',
      'Privacy',
    ]);
    await expect(page.locator('.store-promo-caption')).toHaveText([
      'Track the day’s temperature in seconds.',
      'Spot the wet hours before you leave.',
      'Air quality, simplified.',
      'Sunrise, sunset, and daylight — beautifully clear.',
      'Private by design.',
    ]);

    const sources = await images.evaluateAll((elements) => elements.map((element) => new URL((element as HTMLImageElement).src).pathname));
    expect(sources).toEqual([
      '/store-assets/daymark-promo/daymark-temperature.png',
      '/store-assets/daymark-promo/daymark-rain.png',
      '/store-assets/daymark-promo/daymark-air-quality.png',
      '/store-assets/daymark-promo/daymark-sun-daylight.png',
      '/store-assets/daymark-promo/daymark-privacy.png',
    ]);

    await expect(images.nth(0)).toHaveAttribute('loading', 'lazy');
    await expect(images.nth(0)).toHaveAttribute('alt', 'Daymark temperature forecast promo showing an hourly line chart from 16 to 21 degrees.');
    await expect(images.nth(4)).toHaveAttribute('alt', 'Daymark privacy promo showing no tracking, no ads and no account.');

    await images.nth(0).scrollIntoViewIfNeeded();
    await expect
      .poll(async () => images.nth(0).evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBe(941);
    const natural = await images.nth(0).evaluate((element) => {
      const image = element as HTMLImageElement;
      return { width: image.naturalWidth, height: image.naturalHeight };
    });
    expect(natural).toEqual({ width: 941, height: 1672 });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
