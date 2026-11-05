import { expect, type Locator, type Page } from '@playwright/test';

/*
 * The weather data sections below the hero: hourly temperature, chance of rain,
 * "useful bits" (humidity/dew point), sun/daylight, daily forecast + regional
 * comparison pair, UV and air quality.
 *
 * Kept separate from DashboardPage so neither object becomes an everything-bag.
 */
export class WeatherSectionsPage {
  readonly page: Page;

  readonly temperatureSection: Locator;
  readonly rainSection: Locator;
  readonly detailsSection: Locator;
  readonly sunSection: Locator;
  readonly pairSection: Locator;
  readonly uvSection: Locator;
  readonly airSection: Locator;
  readonly microSection: Locator;

  readonly hourlyForecast: Locator;
  readonly temperatureValues: Locator;
  readonly temperatureTimes: Locator;
  readonly temperatureDots: Locator;
  readonly temperatureChart: Locator;
  readonly rainProbability: Locator;
  readonly rainPoints: Locator;
  readonly rainValues: Locator;
  readonly rainTimes: Locator;
  readonly rainPeak: Locator;
  readonly rainPeakNote: Locator;
  readonly rainTimeline: Locator;

  readonly dailyForecast: Locator;
  readonly dailyUv: Locator;

  readonly airQualityPanel: Locator;
  readonly currentAqi: Locator;
  readonly airContext: Locator;
  readonly pollutionStats: Locator;
  readonly currentAirMarker: Locator;

  readonly weatherDetailsPanel: Locator;
  readonly humidity: Locator;
  readonly dewPoint: Locator;
  readonly dewScale: Locator;
  readonly dewMarker: Locator;
  readonly dewPill: Locator;

  readonly uvPanel: Locator;
  readonly currentUv: Locator;
  readonly uvProtectionWindow: Locator;
  readonly uvProtectionTimeline: Locator;
  readonly uvTimelineColumns: Locator;
  readonly uvHourlyList: Locator;
  readonly uvDailyRows: Locator;

  readonly sunrise: Locator;
  readonly sunset: Locator;
  readonly solarNoon: Locator;

  readonly microClimatePanel: Locator;
  readonly microRows: Locator;

  constructor(page: Page) {
    this.page = page;

    this.temperatureSection = page.locator('section.promo-temperature');
    this.rainSection = page.locator('section.promo-rain');
    this.detailsSection = page.locator('section.details-wide');
    this.sunSection = page.locator('section.promo-sun');
    this.pairSection = page.getByTestId('forecast-pair');
    this.uvSection = page.locator('section.uv-wide');
    this.airSection = page.locator('section.promo-air');
    this.microSection = page.locator('section.micro-wide');

    this.hourlyForecast = page.getByTestId('list-hourly-forecast');
    this.temperatureValues = page.locator('.temp-value');
    this.temperatureTimes = page.locator('.temp-time');
    this.temperatureDots = page.locator('.temp-dot');
    this.temperatureChart = page.locator('.temp-chart-svg');
    this.rainProbability = page.getByTestId('list-rain-probability');
    this.rainPoints = page.locator('.rain-point');
    this.rainValues = page.locator('.rain-point-value');
    this.rainTimes = page.locator('.rain-point-time');
    this.rainPeak = page.getByTestId('text-rain-peak');
    this.rainPeakNote = page.getByTestId('text-rain-peak-note');
    this.rainTimeline = page.locator('.rain-timeline');

    this.dailyForecast = page.getByTestId('list-daily-forecast');
    this.dailyUv = page.getByTestId('list-daily-uv');

    this.airQualityPanel = page.getByTestId('panel-air-quality');
    this.currentAqi = page.getByTestId('text-current-aqi');
    this.airContext = page.getByTestId('air-context');
    this.pollutionStats = page.getByTestId('list-pollution-stats');
    this.currentAirMarker = page.locator('.air-marker-current');

    this.weatherDetailsPanel = page.getByTestId('panel-weather-details');
    this.humidity = page.getByTestId('detail-humidity');
    this.dewPoint = page.getByTestId('detail-dew-point');
    this.dewScale = page.locator('.dew-scale');
    this.dewMarker = page.locator('.dew-scale-marker');
    this.dewPill = page.locator('.dew-pill');

    this.uvPanel = page.getByTestId('panel-uv-forecast');
    this.currentUv = page.getByTestId('text-current-uv');
    this.uvProtectionWindow = page.getByTestId('text-uv-protection-window');
    this.uvProtectionTimeline = page.getByTestId('uv-protection-timeline');
    this.uvTimelineColumns = page.locator('.uv-timeline-col');
    this.uvHourlyList = page.getByTestId('list-hourly-uv');
    this.uvDailyRows = page.locator('.uv-day');

    this.sunrise = page.getByTestId('detail-sunrise');
    this.sunset = page.getByTestId('detail-sunset');
    this.solarNoon = page.locator('.sun-noon');

    this.microClimatePanel = page.getByTestId('panel-micro-climate');
    this.microRows = page.locator('.micro-row');
  }

  async hourlyTemperatures(): Promise<string[]> {
    return this.temperatureValues.allTextContents();
  }

  async hourlyTimes(): Promise<string[]> {
    return this.temperatureTimes.allTextContents();
  }

  async expectRainValues(expected: string[]): Promise<void> {
    await expect(this.rainValues).toHaveText(expected);
  }

  async rainProbabilityValues(): Promise<string[]> {
    return this.rainValues.allTextContents();
  }

  async rainProbabilityTimes(): Promise<string[]> {
    return this.rainTimes.allTextContents();
  }

  async expectCurrentUv(text: string | RegExp): Promise<void> {
    await expect(this.currentUv).toHaveText(text);
  }

  microRow(id: 'temperature' | 'rainfall'): Locator {
    return this.page.getByTestId(`micro-row-${id}`);
  }
}
