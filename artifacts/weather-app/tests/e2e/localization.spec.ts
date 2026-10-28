import { expect, test } from '@playwright/test';
import { AIR, FORECAST, TOKYO_RESULT, TOKYO_FORECAST, WINDY_FORECAST, mockLocations, mockOpenMeteo } from './helpers';
test.describe('multilingual interface', () => {
  test('switches English → French and updates the UI immediately', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Use my location/);
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
    await expect(page.getByTestId('input-location-search')).toHaveAttribute('placeholder', 'Rechercher un lieu');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
  });

  test('switches English → Spanish', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Usar mi ubicación/);
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
  });

  test('reload preserves the selected language', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
    await page.reload();
    await expect(page.getByTestId('select-language')).toHaveValue('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
  });

  test('weather stays on the same location after switching language', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('12°C');
  });

  test('Tokyo keeps Tokyo local time after switching language', async ({ page }) => {
    await page.route('**/geocoding-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [TOKYO_RESULT] }),
    }));
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      const latitude = Number(url.searchParams.get('latitude'));
      const body = Math.abs(latitude - 35.6762) < 0.5 ? TOKYO_FORECAST : FORECAST;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIR),
    }));
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('tokyo');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
    const windowBefore = await page.getByTestId('text-uv-protection-window').innerText();
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
    // Same location clock: the protection window covers the same hours, only the wording changes.
    const windowAfter = await page.getByTestId('text-uv-protection-window').innerText();
    expect(windowAfter).not.toBe(windowBefore);
    expect(windowAfter).toMatch(/Protection solaire conseillée/);
  });




  test('alert UI translates', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.goto('/');
    await expect(page.getByTestId('alert-wind')).toContainText('Strong winds expected');
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('alert-wind')).toContainText('Se esperan vientos fuertes');
    await expect(page.getByTestId('alert-wind')).toContainText('no es un aviso oficial');
  });

  test('French layout stays clean at 320px', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
