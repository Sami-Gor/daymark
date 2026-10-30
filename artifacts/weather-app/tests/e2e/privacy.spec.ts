import { expect, test } from '@playwright/test';
import { expectNoWebVoiceControls, mockLocations, mockOpenMeteo } from './helpers';
test.describe('web demo voice boundary', () => {
  test('renders no web voice controls', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await expectNoWebVoiceControls(page);
  });

  test('never invokes browser speech recognition or synthesis', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__speechCalls = 0;
      (window as any).__recognitionConstructs = 0;
      const synthesis = {
        speaking: false,
        speak() { (window as any).__speechCalls += 1; },
        cancel() { (window as any).__speechCalls += 1; },
        getVoices() { return []; },
      };
      Object.defineProperty(window, 'speechSynthesis', { value: synthesis, configurable: true });
      class FakeUtterance { text: string; constructor(text: string) { this.text = text; } }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
      class FakeRecognition {
        constructor() { (window as any).__recognitionConstructs += 1; }
        start() { (window as any).__recognitionConstructs += 1; }
        stop() {}
      }
      Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRecognition, configurable: true });
    });
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => (window as any).__speechCalls)).toBe(0);
    expect(await page.evaluate(() => (window as any).__recognitionConstructs)).toBe(0);
  });

  test('clearly labels the web build as a limited demo in every language', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    const note = page.getByTestId('web-demo-note');
    await expect(note).toContainText('weather only');
    await expect(note).toContainText('Android app');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(note).toContainText('Démo web : météo uniquement');
    await expect(note).toContainText('application Android');
    await page.getByTestId('select-language').selectOption('es');
    await expect(note).toContainText('Demo web: solo el tiempo');
    await expect(note).toContainText('app de Android');
  });
});
test.describe('persisted storage', () => {
  test('stores only the language preference after switching language', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('select-language')).toHaveValue('es');

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

  test('does not persist location, search, weather or alert state', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    // Search + select a location.
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');

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
    for (const forbidden of ['Paris', '48.85', 'latitude', 'longitude', 'weather']) {
      expect(state.dump).not.toContain(forbidden);
    }
  });
});

test.describe('privacy policy page', () => {
  const policies = [
    { lang: 'en', path: '/privacy', heading: 'Privacy Policy', effective: 'Effective date', back: 'Back to weather' },
    { lang: 'fr', path: '/fr/privacy', heading: 'Politique de confidentialité', effective: 'Date d’entrée en vigueur', back: 'Retour à la météo' },
    { lang: 'es', path: '/es/privacy', heading: 'Política de privacidad', effective: 'Fecha de entrada en vigor', back: 'Volver al tiempo' },
  ] as const;

  for (const policy of policies) {
    test(`direct ${policy.path} route loads the ${policy.lang} policy`, async ({ page }) => {
      await page.goto(policy.path);
      await expect(page.getByTestId('page-privacy')).toBeVisible();
      await expect(page.getByTestId('page-privacy')).toHaveAttribute('data-lang', policy.lang);
      await expect(page.getByRole('heading', { level: 1, name: policy.heading })).toBeVisible();
      await expect(page.getByTestId('text-privacy-effective')).toContainText(policy.effective);
      await expect(page.getByTestId('link-back-home')).toContainText(policy.back);
      await expect(page.getByTestId(`link-privacy-lang-${policy.lang}`)).toHaveAttribute('aria-current', 'page');
    });
  }

  test('does not call weather APIs or persist anything', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    await page.goto('/privacy');
    await expect(page.getByTestId('page-privacy')).toBeVisible();
    expect(requested.filter((url) => url.includes('open-meteo'))).toEqual([]);
    const state = await page.evaluate(() => ({
      local: Object.keys(window.localStorage),
      session: Object.keys(window.sessionStorage),
      cookies: document.cookie,
    }));
    expect(state).toEqual({ local: [], session: [], cookies: '' });
  });

  test('footer Privacy link follows the interface language', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('link-privacy')).toHaveAttribute('href', '/privacy');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('link-privacy')).toHaveText('Confidentialité');
    await expect(page.getByTestId('link-privacy')).toHaveAttribute('href', '/fr/privacy');
    await page.getByTestId('link-privacy').click();
    await expect(page).toHaveURL(/\/fr\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeVisible();
    await page.getByTestId('link-back-home').click();
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('link-privacy')).toHaveText('Privacidad');
    await expect(page.getByTestId('link-privacy')).toHaveAttribute('href', '/es/privacy');
  });

  test('language switcher navigates between concrete policy URLs and is keyboard accessible', async ({ page }) => {
    await page.goto('/privacy');
    await page.getByTestId('link-privacy-lang-fr').focus();
    await expect(page.getByTestId('link-privacy-lang-fr')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/fr\/privacy$/);
    await expect(page.getByTestId('page-privacy')).toHaveAttribute('data-lang', 'fr');
    await page.getByTestId('link-privacy-lang-es').click();
    await expect(page).toHaveURL(/\/es\/privacy$/);
    await expect(page.getByTestId('page-privacy')).toHaveAttribute('data-lang', 'es');
    await page.getByTestId('link-privacy-lang-en').click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByTestId('page-privacy')).toHaveAttribute('data-lang', 'en');
  });

  test('shows the confirmed operator and contact details in every language', async ({ page }) => {
    for (const policy of policies) {
      await page.goto(policy.path);
      const text = await page.getByTestId('page-privacy').innerText();
      expect(text).toContain('Sami');
      expect(text).toContain('skylinelabdev@gmail.com');
    }
  });

  test('contains no placeholders or draft markers', async ({ page }) => {
    for (const policy of policies) {
      await page.goto(policy.path);
      const text = await page.getByTestId('page-privacy').innerText();
      for (const forbidden of ['[OPERATOR NAME]', '[CONTACT EMAIL]', 'DECISION REQUIRED', 'Draft notice', 'placeholder']) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  test('states the current web and Android data practices in every language', async ({ page }) => {
    const expectations = {
      en: {
        location: 'ACCESS_COARSE_LOCATION',
        grid: '0.025-degree grid',
        speech: 'Parakeet TDT 0.6B v3',
        memory: 'held in memory',
        webDemo: 'limited weather demo',
        browserSpeech: 'does not invoke browser speech-recognition',
        offlineVoice: 'not available in V2',
        audience: 'adults aged 18 and over',
        ipMetadata: 'source IP address and requested URL',
        versionNote: 'Daymark 1.0.0',
        precisePermission: 'ACCESS_FINE_LOCATION',
      },
      fr: {
        location: 'ACCESS_COARSE_LOCATION',
        grid: 'grille de 0,025 degré',
        speech: 'Parakeet TDT 0.6B v3',
        memory: 'conservé en mémoire',
        webDemo: 'démo météo limitée',
        browserSpeech: 'API de reconnaissance ou de synthèse vocale',
        offlineVoice: 'pas disponible dans V2',
        audience: 'adultes âgés de 18 ans ou plus',
        ipMetadata: 'adresse IP source et l’URL demandée',
        versionNote: 'Daymark 1.0.0',
        precisePermission: 'ACCESS_FINE_LOCATION',
      },
      es: {
        location: 'ACCESS_COARSE_LOCATION',
        grid: 'cuadrícula de 0,025 grados',
        speech: 'Parakeet TDT 0.6B v3',
        memory: 'mantiene en memoria',
        webDemo: 'demo meteorológica limitada',
        browserSpeech: 'API de reconocimiento ni de síntesis de voz',
        offlineVoice: 'no está disponible en V2',
        audience: 'adultos de 18 años o más',
        ipMetadata: 'dirección IP de origen y la URL solicitada',
        versionNote: 'Daymark 1.0.0',
        precisePermission: 'ACCESS_FINE_LOCATION',
      },
    } as const;
    for (const policy of policies) {
      await page.goto(policy.path);
      const text = await page.getByTestId('page-privacy').innerText();
      for (const host of ['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'geocoding-api.open-meteo.com']) {
        expect(text).toContain(host);
      }
      expect(text).toContain('Open-Meteo');
      expect(text).toContain('daymark.locale');
      expect(text).toContain('daymark.permissions');
      expect(text).toContain('microphone-requested');
      expect(text).toContain(expectations[policy.lang].location);
      expect(text).toContain(expectations[policy.lang].grid);
      expect(text).toContain(expectations[policy.lang].speech);
      expect(text).toContain(expectations[policy.lang].memory);
      expect(text).toContain(expectations[policy.lang].webDemo);
      expect(text).toContain(expectations[policy.lang].browserSpeech);
      expect(text).toContain(expectations[policy.lang].offlineVoice);
      expect(text).toContain(expectations[policy.lang].audience);
      expect(text).toContain(expectations[policy.lang].ipMetadata);
      expect(text).toContain(expectations[policy.lang].versionNote);
      expect(text).toContain(expectations[policy.lang].precisePermission);
      expect(text).not.toMatch(/collects? no data/i);
    }
  });

  for (const policy of policies) {
    for (const width of [320, 390]) {
      test(`${policy.lang} policy has no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(policy.path);
        await expect(page.getByTestId('page-privacy')).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});

test('console boundary redacts synthetic recognition payloads', async ({ page }) => {
  const messages: string[] = [];
  page.on('console', (message) => messages.push(message.text()));
  await mockOpenMeteo(page);
  await page.goto('/');
  await page.evaluate(() => {
    console.log(JSON.stringify({ sessionId: 42, transcript: 'SYNTHETIC_SENTINEL_ALPHA', code: 'result' }));
    console.log({ sessionId: 43, transcript: 'SYNTHETIC_SENTINEL_BETA', audio: 'RAW_AUDIO_SENTINEL' });
  });
  await page.waitForTimeout(150);
  const logged = messages.join('\n');
  expect(logged).not.toContain('SYNTHETIC_SENTINEL');
  expect(logged).not.toContain('RAW_AUDIO_SENTINEL');
  expect(logged).toContain('sessionId');
});
