import { expect, type Locator, type Page } from '@playwright/test';

/*
 * Internal /store-preview page used to verify the Google Play promo gallery.
 */
export class StorePromoPage {
  readonly page: Page;

  readonly gallery: Locator;
  readonly images: Locator;
  readonly titles: Locator;
  readonly captions: Locator;

  constructor(page: Page) {
    this.page = page;
    this.gallery = page.locator('.store-promo-gallery');
    this.images = page.locator('.store-promo-gallery img');
    this.titles = page.locator('.store-promo-title');
    this.captions = page.locator('.store-promo-caption');
  }

  async goto(): Promise<void> {
    await this.page.goto('/store-preview');
  }

  async imageSources(): Promise<string[]> {
    return this.images.evaluateAll((elements) => elements.map((element) => new URL((element as HTMLImageElement).src).pathname));
  }

  async firstImageNaturalSize(): Promise<{ width: number; height: number }> {
    return this.images.nth(0).evaluate((element) => {
      const image = element as HTMLImageElement;
      return { width: image.naturalWidth, height: image.naturalHeight };
    });
  }

  async expectCount(count: number): Promise<void> {
    await expect(this.images).toHaveCount(count);
  }
}
