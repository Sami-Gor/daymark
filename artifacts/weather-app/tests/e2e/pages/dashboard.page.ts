import { expect, type Locator, type Page } from '@playwright/test';

/*
 * Top-level page: brand/header controls, the Today hero, weather error/loading
 * states and page-level layout helpers.
 *
 * Data sections live in WeatherSectionsPage, search in LocationSearchPage and
 * voice in VoiceControlsPage so each object stays focused.
 */
export class DashboardPage {
  readonly page: Page;

  readonly brandName: Locator;
  readonly languageSelect: Locator;
  readonly celsiusButton: Locator;
  readonly fahrenheitButton: Locator;
  readonly useLocationButton: Locator;
  readonly heroLocationButton: Locator;
  readonly privacyLink: Locator;
  readonly openMeteoLink: Locator;

  readonly currentCity: Locator;
  readonly currentDate: Locator;
  readonly currentTemperature: Locator;
  readonly dayCue: Locator;

  readonly loadingLayout: Locator;
  readonly errorPanel: Locator;
  readonly errorRetryButton: Locator;
  readonly refreshError: Locator;
  readonly refreshRetryButton: Locator;
  readonly refreshIndicator: Locator;
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.brandName = page.locator('.brand-name');
    this.languageSelect = page.getByTestId('select-language');
    this.celsiusButton = page.getByTestId('button-unit-celsius');
    this.fahrenheitButton = page.getByTestId('button-unit-fahrenheit');
    this.useLocationButton = page.getByTestId('button-use-location');
    this.heroLocationButton = page.getByTestId('button-refresh-location');
    this.privacyLink = page.getByTestId('link-privacy');
    this.openMeteoLink = page.getByTestId('link-open-meteo');

    this.currentCity = page.getByTestId('text-current-city');
    this.currentDate = page.getByTestId('text-current-date');
    this.currentTemperature = page.getByTestId('text-current-temperature');
    this.dayCue = page.getByTestId('day-cue');

    this.loadingLayout = page.locator('.loading-layout');
    this.errorPanel = page.getByTestId('status-weather-error');
    this.errorRetryButton = page.getByTestId('button-retry-weather');
    this.refreshError = page.getByTestId('refresh-error');
    this.refreshRetryButton = page.getByTestId('button-refresh-retry');
    this.refreshIndicator = page.getByTestId('refresh-indicator');
    this.toast = page.getByTestId('toast');
  }

  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
  }

  /** Navigate to the dashboard and wait for the first weather payload to render. */
  async open(): Promise<void> {
    await this.goto('/');
    await this.expectReady();
  }

  async expectReady(): Promise<void> {
    await expect(this.currentTemperature).toBeVisible();
  }

  async expectBrand(): Promise<void> {
    await expect(this.brandName).toHaveText('daymark');
  }

  async expectCity(city: string | RegExp): Promise<void> {
    await expect(this.currentCity).toHaveText(city);
  }

  async expectTemperature(text: string | RegExp): Promise<void> {
    await expect(this.currentTemperature).toHaveText(text);
  }

  async selectUnit(unit: 'celsius' | 'fahrenheit'): Promise<void> {
    const button = unit === 'celsius' ? this.celsiusButton : this.fahrenheitButton;
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }

  async setLanguage(language: 'en' | 'fr' | 'es'): Promise<void> {
    await this.languageSelect.selectOption(language);
    await expect(this.languageSelect).toHaveValue(language);
  }

  async requestDeviceLocation(): Promise<void> {
    await this.heroLocationButton.click();
  }

  async clickTopbarLocation(): Promise<void> {
    await this.useLocationButton.click();
  }

  async retryWeather(): Promise<void> {
    await this.errorRetryButton.click();
  }

  async openPrivacyPolicy(): Promise<void> {
    await this.privacyLink.click();
  }

  async horizontalOverflow(): Promise<number> {
    return this.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }

}
