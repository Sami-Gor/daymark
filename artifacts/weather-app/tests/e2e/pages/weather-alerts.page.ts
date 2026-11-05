import { expect, type Locator, type Page } from '@playwright/test';

export type AlertHazard = 'wind' | 'rain' | 'snow' | 'heat' | 'cold' | 'thunderstorm';

/*
 * Forecast-derived weather risk cards. The section renders nothing at all when
 * there is no risk, so absence is asserted with a zero count rather than a
 * "nothing to show" placeholder.
 */
export class WeatherAlertsPage {
  readonly page: Page;

  readonly section: Locator;
  readonly list: Locator;
  readonly title: Locator;

  constructor(page: Page) {
    this.page = page;
    this.section = page.locator('section.alerts-wide');
    this.list = page.getByTestId('list-weather-alerts');
    this.title = page.locator('#alerts-title');
  }

  alert(hazard: AlertHazard): Locator {
    return this.page.getByTestId(`alert-${hazard}`);
  }

  alertTime(hazard: AlertHazard): Locator {
    return this.page.getByTestId(`alert-time-${hazard}`);
  }

  async expectNone(): Promise<void> {
    await expect(this.section).toHaveCount(0);
    await expect(this.list).toHaveCount(0);
  }

  async expectAlert(hazard: AlertHazard): Promise<void> {
    await expect(this.alert(hazard)).toBeVisible();
  }
}
