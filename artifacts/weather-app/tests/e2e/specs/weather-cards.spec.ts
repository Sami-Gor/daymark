import { expect, test } from '../support/fixtures';
import { CANONICAL_FORECAST } from '../support/test-data';

/*
 * Live weather cards: the five live hourly temperature points, the peak-first
 * rain droplet timeline, the clean card surfaces and their responsive ordering.
 * Layout/maths assertions use raw page evaluate where the page objects do not
 * model the geometry.
 */

test.describe('live weather cards', () => {
  test('renders exactly five live hourly points and five live rain bars', async ({ page, dashboard, sections }) => {
    await dashboard.open();

    await expect(sections.temperatureDots).toHaveCount(5);
    expect(await sections.hourlyTemperatures()).toEqual(['20°', '21°', '21°', '21°', '20°']);
    expect(await sections.hourlyTimes()).toEqual(['Now', '1 PM', '2 PM', '3 PM', '4 PM']);

    await expect(sections.rainPoints).toHaveCount(5);
    expect(await sections.rainProbabilityValues()).toEqual(['10%', '20%', '10%', '0%', '0%']);
    expect(await sections.rainProbabilityTimes()).toEqual(['Now', '1 PM', '2 PM', '3 PM', '4 PM']);
    await expect(sections.rainPeak).toHaveText('20%');
    await expect(sections.rainPeakNote).toHaveText('Highest around 1 PM');
    await expect(sections.rainPoints.nth(1)).toHaveClass(/rain-point-peak/);
    await expect(page.getByTestId('list-rain-probability').getByRole('listitem').first()).toHaveAttribute('aria-label', 'Now: 10% chance');

    await expect(sections.currentAqi).toHaveText('33');
    await expect(sections.sunrise).toContainText('6:30 AM');
    await expect(sections.sunset).toContainText('7:40 PM');
    await expect(sections.solarNoon).toHaveText('1:05 PM');
    await expect(page.locator('.sun-total strong')).toHaveText('13h 10m');

    const body = await page.locator('body').innerText();
    for (const fabricated of ['15h 51m', '5:12am', '1:48pm', '9:03pm', '32 AQI']) {
      expect(body).not.toContain(fabricated);
    }
  });

  test('builds a peak-first droplet timeline with no bar-chart elements', async ({ page, dashboard, sections }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await dashboard.goto('/');

    await expect(page.locator('.rain-chart, .rain-bar, .rain-value')).toHaveCount(0);
    const timeline = sections.rainTimeline;
    await expect(timeline).toBeVisible();
    const points = timeline.locator('.rain-point');
    await expect(points).toHaveCount(5);
    await expect(points.nth(1)).toHaveClass(/rain-point-peak/);

    const lefts = await points.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().x)));
    for (let index = 1; index < lefts.length; index += 1) expect(lefts[index]).toBeGreaterThan(lefts[index - 1]);
    const dropCenters = await timeline.locator('.rain-drop-wrap').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.x + rect.width / 2;
    }));
    const labelCenters = await timeline.locator('.rain-point-value').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.x + rect.width / 2;
    }));
    for (let index = 0; index < dropCenters.length; index += 1) {
      expect(Math.abs(labelCenters[index] - dropCenters[index])).toBeLessThanOrEqual(2);
    }
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    const timelineWidth = await timeline.evaluate((element) => element.getBoundingClientRect().width);
    expect(timelineWidth).toBeLessThanOrEqual(440);
  });

  test('handles tied peaks, zero-rain windows and localized peak copy', async ({ api, page, dashboard, sections }) => {
    await api.forecast({
      ...CANONICAL_FORECAST,
      hourly: { ...CANONICAL_FORECAST.hourly, precipitation_probability: [10, 20, 20, 5, 0, 0, 0, 0] },
    });
    await dashboard.open();
    await expect(sections.rainPeak).toHaveText('20%');
    await expect(sections.rainPeakNote).toHaveText('Highest around 1 PM');
    await expect(sections.rainPoints.nth(1)).toHaveClass(/rain-point-peak/);
    await expect(sections.rainPoints.nth(2)).not.toHaveClass(/rain-point-peak/);

    await dashboard.setLanguage('fr');
    await expect(sections.rainPeakNote).toContainText('Maximum vers');
    await dashboard.setLanguage('en');

    await api.forecast({
      ...CANONICAL_FORECAST,
      hourly: { ...CANONICAL_FORECAST.hourly, precipitation_probability: [0, 0, 0, 0, 0, 0, 0, 0] },
    });
    await page.reload();
    await expect(sections.rainPeak).toHaveText('0%');
    await expect(sections.rainPeakNote).toHaveText('No rain expected in the next 5 hours');
    await expect(sections.rainPoints).toHaveCount(5);
  });

  test('live cards use clean surfaces with no scenic artwork', async ({ page, dashboard }) => {
    await dashboard.open();
    await expect(page.locator('.promo-card')).toHaveCount(4);
    await expect(page.locator('.atmos-bg')).toHaveCount(0);
    await expect(page.locator('img[src*="weather-art"], img[src*="store-assets"]')).toHaveCount(0);
    const backgrounds = await page.locator('.promo-card').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundImage));
    for (const image of backgrounds) expect(image).not.toContain('url(');
  });

  test('useful bits follows chance of rain and pairs daily with regional comparison', async ({ page, dashboard, sections }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await dashboard.open();

    const rainBox = await page.getByTestId('list-rain-probability').boundingBox();
    const detailsBox = await sections.weatherDetailsPanel.boundingBox();
    const airBox = await sections.airQualityPanel.boundingBox();
    expect(rainBox && detailsBox && airBox).toBeTruthy();
    expect(detailsBox!.y).toBeGreaterThan(rainBox!.y);
    expect(airBox!.y).toBeGreaterThan(detailsBox!.y);

    const pair = sections.pairSection;
    await expect(pair).toBeVisible();
    await expect(pair).toHaveClass(/pair-card/);
    await expect(pair.getByTestId('list-daily-forecast')).toBeVisible();
    await expect(pair.getByTestId('panel-micro-climate')).toBeVisible();
    const wideColumns = await pair.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(wideColumns).toBe(2);
    const wideXs = await pair.evaluate((element) => Array.from(element.children).map((child) => Math.round(child.getBoundingClientRect().x)));
    expect(wideXs[1]).toBeGreaterThan(wideXs[0]);

    await page.setViewportSize({ width: 390, height: 844 });
    const narrowColumns = await pair.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(narrowColumns).toBe(1);
    const narrowXs = await pair.evaluate((element) => Array.from(element.children).map((child) => Math.round(child.getBoundingClientRect().x)));
    expect(narrowXs[1]).toBe(narrowXs[0]);
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
  });

  test('renders Air around you once, after every other main section', async ({ page, dashboard, sections }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await dashboard.open();

    await expect(sections.airQualityPanel).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Air around you' })).toHaveCount(1);

    const airBox = await sections.airQualityPanel.boundingBox();
    const pairBox = await sections.pairSection.boundingBox();
    const uvBox = await sections.uvPanel.boundingBox();
    expect(airBox && pairBox && uvBox).toBeTruthy();
    expect(airBox!.y).toBeGreaterThan(pairBox!.y);
    expect(airBox!.y).toBeGreaterThan(uvBox!.y);

    await page.setViewportSize({ width: 1280, height: 900 });
    const airWide = await sections.airQualityPanel.boundingBox();
    const pairWide = await sections.pairSection.boundingBox();
    const uvWide = await sections.uvPanel.boundingBox();
    expect(airWide && pairWide && uvWide).toBeTruthy();
    expect(airWide!.y).toBeGreaterThan(pairWide!.y);
    expect(airWide!.y).toBeGreaterThan(uvWide!.y);
  });

  test('collapses redesigned section animation under reduced motion', async ({ page, dashboard, sections }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dashboard.open();
    const dot = sections.temperatureDots.first();
    const duration = await dot.evaluate((element) => getComputedStyle(element).animationDuration);
    expect(parseFloat(duration)).toBeLessThanOrEqual(0.01);
  });
});
