import { expect, type Locator, type Page } from '@playwright/test';
import type { PrivacyLang } from '../support/test-data';

/*
 * Public privacy policy pages (one permanent URL per language).
 */
export class PrivacyPolicyPage {
  readonly page: Page;

  readonly article: Locator;
  readonly heading: Locator;
  readonly effective: Locator;
  readonly backHome: Locator;
  readonly languageSwitcher: Locator;
  readonly brandName: Locator;

  constructor(page: Page) {
    this.page = page;
    this.article = page.getByTestId('page-privacy');
    this.heading = page.getByTestId('text-privacy-heading');
    this.effective = page.getByTestId('text-privacy-effective');
    this.backHome = page.getByTestId('link-back-home');
    this.languageSwitcher = page.getByTestId('privacy-language-switcher');
    this.brandName = page.locator('.brand-name');
  }

  languageLink(lang: PrivacyLang): Locator {
    return this.page.getByTestId(`link-privacy-lang-${lang}`);
  }

  async goto(path = '/privacy'): Promise<void> {
    await this.page.goto(path);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.article).toBeVisible();
  }

  async text(): Promise<string> {
    return this.article.innerText();
  }
}
