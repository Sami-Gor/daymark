import { expect, test } from '../support/fixtures';
import { STORE_PROMO } from '../support/test-data';

/*
 * Internal /store-preview page: the Google Play promo gallery must render the
 * five screenshots in listing order, with their copy, alt text and dimensions.
 */

test.describe('store promo gallery', () => {
  test('renders the five Play promo images in listing order', async ({ page, promo }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await promo.goto();

    await promo.expectCount(5);
    await expect(promo.titles).toHaveText(STORE_PROMO.titles);
    await expect(promo.captions).toHaveText(STORE_PROMO.captions);

    expect(await promo.imageSources()).toEqual(STORE_PROMO.images);

    await expect(promo.images.nth(0)).toHaveAttribute('loading', 'lazy');
    await expect(promo.images.nth(0)).toHaveAttribute('alt', 'Daymark temperature forecast promo showing an hourly line chart from 16 to 21 degrees.');
    await expect(promo.images.nth(4)).toHaveAttribute('alt', 'Daymark privacy promo showing no tracking, no ads and no account.');

    await promo.images.nth(0).scrollIntoViewIfNeeded();
    await expect
      .poll(async () => promo.images.nth(0).evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBe(941);
    expect(await promo.firstImageNaturalSize()).toEqual({ width: 941, height: 1672 });

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
