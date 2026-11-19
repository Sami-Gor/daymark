import { expect, type Locator, type Page } from '@playwright/test';

/*
 * Debounced location search combobox: input, status line, listbox and options.
 */
export class LocationSearchPage {
  readonly page: Page;

  readonly root: Locator;
  readonly input: Locator;
  readonly clearButton: Locator;
  readonly results: Locator;
  readonly status: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('location-search');
    this.input = page.getByTestId('input-location-search');
    this.clearButton = page.getByTestId('button-clear-location-search');
    this.results = page.getByTestId('location-results');
    this.status = page.getByTestId('location-status');
  }

  option(index: number): Locator {
    return this.page.getByTestId(`location-option-${index}`);
  }

  async search(query: string): Promise<void> {
    await this.input.fill(query);
  }

  async waitForResults(): Promise<void> {
    await expect(this.results).toBeVisible();
    await expect(this.option(0)).toBeVisible();
  }

  async selectOption(index = 0): Promise<void> {
    await this.option(index).click();
  }

  /** Type a query, wait for the debounced results and choose one. */
  async searchAndSelect(query: string, index = 0): Promise<void> {
    await this.search(query);
    await this.waitForResults();
    await this.selectOption(index);
  }

  async pressArrowDown(times = 1): Promise<void> {
    for (let index = 0; index < times; index += 1) await this.input.press('ArrowDown');
  }

  async pressEnter(): Promise<void> {
    await this.input.press('Enter');
  }
}
