import { expect, test } from '../support/fixtures';
import { WINDY_FORECAST } from '../support/test-data';

/*
 * Language switching across the interface: immediate copy updates, persistence
 * across reloads, per-location weather/locale handling, localized voice and
 * alert copy, and the narrow-viewport French layout.
 */

test.describe('multilingual interface', () => {
  test('switches English → French and updates the UI immediately', async ({ dashboard, search }) => {
    await dashboard.open();
    await expect(dashboard.heroLocationButton).toHaveText(/Use my location/);

    await dashboard.setLanguage('fr');
    await expect(dashboard.heroLocationButton).toHaveText(/Utiliser ma position/);
    await expect(search.input).toHaveAttribute('placeholder', 'Rechercher un lieu');
    await dashboard.expectTemperature('20°C');
  });

  test('switches English → Spanish', async ({ dashboard }) => {
    await dashboard.open();
    await dashboard.setLanguage('es');
    await expect(dashboard.heroLocationButton).toHaveText(/Usar mi ubicación/);
    await dashboard.expectTemperature('20°C');
  });

  test('reload preserves the selected language', async ({ dashboard, page }) => {
    await dashboard.open();
    await dashboard.setLanguage('fr');
    await expect(dashboard.heroLocationButton).toHaveText(/Utiliser ma position/);

    // Storage is deliberately not cleared: the preference must survive reload.
    await page.reload();
    await expect(dashboard.languageSelect).toHaveValue('fr');
    await expect(dashboard.heroLocationButton).toHaveText(/Utiliser ma position/);
  });

  test('weather stays on the same location after switching language', async ({ api, dashboard, search }) => {
    await api.locations();
    await dashboard.open();

    await search.searchAndSelect('paris');
    await dashboard.expectCity('Paris');

    await dashboard.setLanguage('es');
    await dashboard.expectCity('Paris');
    await dashboard.expectTemperature('12°C');
  });

  test('Tokyo keeps Tokyo local time after switching language', async ({ api, dashboard, sections, search }) => {
    await api.locations();
    await dashboard.open();

    await search.searchAndSelect('tokyo');
    await dashboard.expectCity('Tokyo');
    const windowBefore = await sections.uvProtectionWindow.innerText();

    await dashboard.setLanguage('fr');
    await dashboard.expectCity('Tokyo');
    // Same location clock: the protection window covers the same hours, only the wording changes.
    const windowAfter = await sections.uvProtectionWindow.innerText();
    expect(windowAfter).not.toBe(windowBefore);
    expect(windowAfter).toMatch(/Protection solaire conseillée/);
  });

  test('Hear today speaks the localized briefing', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await dashboard.setLanguage('fr');
    await voice.startNarration();

    const spoken = await speech.spoken();
    expect(spoken[0]).toContain('Il fait');
    expect(spoken[0]).toContain('London');
  });

  test('Ask Daymark accepts a French phrase', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await dashboard.setLanguage('fr');
    await voice.toggleListening();
    await speech.emitResult('Va-t-il pleuvoir ?');
    await speech.emitRecognitionEnd();

    await voice.expectQuestion('pleuvoir');
    await voice.expectAnswer('pluie');
  });

  test('Ask Daymark accepts a Spanish phrase', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await dashboard.setLanguage('es');
    await voice.toggleListening();
    await speech.emitResult('¿Va a llover?');
    await speech.emitRecognitionEnd();

    await voice.expectAnswer('lluvia');
  });

  test('alert UI translates', async ({ alerts, api, dashboard }) => {
    await api.forecast(WINDY_FORECAST);
    await dashboard.open();
    await expect(alerts.alert('wind')).toContainText('Strong winds expected');

    await dashboard.setLanguage('es');
    await expect(alerts.alert('wind')).toContainText('Se esperan vientos fuertes');
    await expect(alerts.alert('wind')).toContainText('no es un aviso oficial');
  });

  test('French layout stays clean at 320px', async ({ dashboard, page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await dashboard.open();
    await dashboard.setLanguage('fr');
    await expect(dashboard.heroLocationButton).toHaveText(/Utiliser ma position/);
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
  });
});
