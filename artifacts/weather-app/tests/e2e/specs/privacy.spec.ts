import { expect, test } from '../support/fixtures';
import { PRIVACY_EXPECTATIONS, PRIVACY_POLICIES } from '../support/test-data';

/*
 * Privacy: what the app persists (only the language preference) and the public
 * policy pages, which are permanent per-language URLs with confirmed copy.
 */

test.describe('privacy-safe persisted storage', () => {
  test('stores only the language preference after switching language', async ({ dashboard, page }) => {
    await dashboard.open();
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.setLanguage('es');

    const state = await page.evaluate(() => ({
      keys: Object.keys(window.localStorage).sort(),
      locale: window.localStorage.getItem('daymark.locale'),
      sessionKeys: Object.keys(window.sessionStorage),
      cookie: document.cookie,
    }));
    expect(state.keys).toEqual(['daymark.locale']);
    expect(state.locale).toBe('es');
    expect(state.sessionKeys).toEqual([]);
    expect(state.cookie).toBe('');
  });

  test('does not persist location, search, transcript, weather or alert state', async ({ api, dashboard, page, search, speech, voice }) => {
    await api.locations();
    await dashboard.open();
    await expect(dashboard.currentTemperature).toBeVisible();

    // Search + select a location.
    await search.searchAndSelect('paris');
    await dashboard.expectCity('Paris');

    // Voice interaction with a mocked transcript.
    await voice.toggleListening();
    await speech.emitResult('Will it rain later?');
    await speech.emitRecognitionEnd();
    await expect(voice.askAnswer).toBeVisible();

    // Language was never changed, so no localStorage entries at all are valid.
    const state = await page.evaluate(() => ({
      keys: Object.keys(window.localStorage),
      dump: JSON.stringify(window.localStorage),
      sessionKeys: Object.keys(window.sessionStorage),
      cookie: document.cookie,
    }));
    expect(state.keys).toEqual([]);
    expect(state.sessionKeys).toEqual([]);
    expect(state.cookie).toBe('');
    for (const forbidden of ['Paris', '48.85', 'latitude', 'longitude', 'rain later', 'transcript', 'weather']) {
      expect(state.dump).not.toContain(forbidden);
    }
  });
});

test.describe('privacy policy pages', () => {
  for (const policy of PRIVACY_POLICIES) {
    test(`direct ${policy.path} route loads the ${policy.lang} policy`, async ({ page, privacy }) => {
      await privacy.goto(policy.path);
      await privacy.expectLoaded();
      await expect(privacy.article).toHaveAttribute('data-lang', policy.lang);
      await expect(page.getByRole('heading', { level: 1, name: policy.heading })).toBeVisible();
      await expect(privacy.effective).toContainText(policy.effective);
      await expect(privacy.backHome).toContainText(policy.back);
      await expect(privacy.languageLink(policy.lang)).toHaveAttribute('aria-current', 'page');
    });
  }

  test('does not call weather APIs or persist anything', async ({ page, privacy, requests }) => {
    await privacy.goto('/privacy');
    await privacy.expectLoaded();

    expect(requests.weatherApi()).toEqual([]);
    const state = await page.evaluate(() => ({
      local: Object.keys(window.localStorage),
      session: Object.keys(window.sessionStorage),
      cookies: document.cookie,
    }));
    expect(state).toEqual({ local: [], session: [], cookies: '' });
  });

  test('footer Privacy link follows the interface language', async ({ dashboard, page, privacy }) => {
    await dashboard.open();
    await expect(dashboard.privacyLink).toHaveAttribute('href', '/privacy');

    await dashboard.setLanguage('fr');
    await expect(dashboard.privacyLink).toHaveText('Confidentialité');
    await expect(dashboard.privacyLink).toHaveAttribute('href', '/fr/privacy');
    await dashboard.privacyLink.click();
    await expect(page).toHaveURL(/\/fr\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeVisible();

    await privacy.backHome.click();
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.setLanguage('es');
    await expect(dashboard.privacyLink).toHaveText('Privacidad');
    await expect(dashboard.privacyLink).toHaveAttribute('href', '/es/privacy');
  });

  test('language switcher navigates between concrete policy URLs and is keyboard accessible', async ({ page, privacy }) => {
    await privacy.goto('/privacy');
    await privacy.languageLink('fr').focus();
    await expect(privacy.languageLink('fr')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/fr\/privacy$/);
    await expect(privacy.article).toHaveAttribute('data-lang', 'fr');

    await privacy.languageLink('es').click();
    await expect(page).toHaveURL(/\/es\/privacy$/);
    await expect(privacy.article).toHaveAttribute('data-lang', 'es');

    await privacy.languageLink('en').click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(privacy.article).toHaveAttribute('data-lang', 'en');
  });

  test('shows the confirmed operator and contact details in every language', async ({ privacy }) => {
    for (const policy of PRIVACY_POLICIES) {
      await privacy.goto(policy.path);
      const text = await privacy.text();
      expect(text).toContain('Sami Belhadj');
      expect(text).toContain('skylinelabdev@gmail.com');
    }
  });

  test('contains no placeholders or draft markers', async ({ privacy }) => {
    for (const policy of PRIVACY_POLICIES) {
      await privacy.goto(policy.path);
      const text = await privacy.text();
      for (const forbidden of ['[OPERATOR NAME]', '[CONTACT EMAIL]', 'DECISION REQUIRED', 'Draft notice', 'placeholder']) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  test('states the verified data practices in every language', async ({ privacy }) => {
    for (const policy of PRIVACY_POLICIES) {
      await privacy.goto(policy.path);
      const text = await privacy.text();
      for (const host of ['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'geocoding-api.open-meteo.com']) {
        expect(text).toContain(host);
      }
      expect(text).toContain('Open-Meteo');
      expect(text).toContain('daymark.locale');
      expect(text).toContain(PRIVACY_EXPECTATIONS[policy.lang].location);
      expect(text).toContain(PRIVACY_EXPECTATIONS[policy.lang].speech);
      expect(text).toContain(PRIVACY_EXPECTATIONS[policy.lang].audience);
      expect(text).not.toMatch(/collects? no data/i);
    }
  });

  for (const policy of PRIVACY_POLICIES) {
    for (const width of [320, 390]) {
      test(`${policy.lang} policy has no horizontal overflow at ${width}px`, async ({ page, privacy }) => {
        await page.setViewportSize({ width, height: 900 });
        await privacy.goto(policy.path);
        await privacy.expectLoaded();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});
