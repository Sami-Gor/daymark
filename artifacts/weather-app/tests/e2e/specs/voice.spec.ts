import { expect, test } from '../support/fixtures';

/*
 * Web/PWA voice surface.
 *
 * V2 voice is Android-native only. The web build hides "Hear today" and
 * "Ask Daymark", has no ask-privacy disclosure, does not request microphone
 * access and does not run the Android Parakeet/Kokoro path. The Android voice
 * modules and the intent layer are covered by the src/lib unit suites (which
 * cannot run in a browser); this spec pins the web demo's user-visible
 * contract so Android-only controls can never leak into the PWA.
 */

const DEMO_NOTE = /Web demo: weather only\. Ask Daymark and narration are available in the Android app\./;

test.describe('web demo voice surface', () => {
  test('shows the weather-only demo note and hides both voice controls', async ({ dashboard }) => {
    await dashboard.open();

    await expect(dashboard.webDemoNote).toBeVisible();
    await expect(dashboard.webDemoNote).toHaveText(DEMO_NOTE);
    await dashboard.expectVoiceControlsHidden();
  });

  test('localizes the demo note in French and Spanish while keeping voice controls hidden', async ({ dashboard }) => {
    await dashboard.open();

    await dashboard.setLanguage('fr');
    await expect(dashboard.webDemoNote).toContainText('Démo web : météo uniquement.');
    await expect(dashboard.webDemoNote).toContainText('Android');
    await dashboard.expectVoiceControlsHidden();

    await dashboard.setLanguage('es');
    await expect(dashboard.webDemoNote).toContainText('Demo web: solo el tiempo.');
    await expect(dashboard.webDemoNote).toContainText('Android');
    await dashboard.expectVoiceControlsHidden();
  });

  test('does not request microphone access on load or after a locale change', async ({ dashboard, page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __mediaRequests: number }).__mediaRequests = 0;
      const media = navigator.mediaDevices;
      if (media?.getUserMedia) {
        const original = media.getUserMedia.bind(media);
        media.getUserMedia = (constraints) => {
          (window as unknown as { __mediaRequests: number }).__mediaRequests += 1;
          return original(constraints);
        };
      }
    });
    await dashboard.open();
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.setLanguage('fr');
    await expect(dashboard.webDemoNote).toBeVisible();

    expect(await page.evaluate(() => (window as unknown as { __mediaRequests: number }).__mediaRequests)).toBe(0);
  });

  test('never shows a voice privacy disclosure or a transcript panel', async ({ dashboard, page }) => {
    await dashboard.open();
    await expect(dashboard.currentTemperature).toBeVisible();

    await expect(page.locator('[data-testid^="ask-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="button-hear-today"]')).toHaveCount(0);
    await dashboard.expectVoiceControlsHidden();
  });

  test('keeps voice controls hidden at 320px with no horizontal overflow', async ({ dashboard, page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await dashboard.open();
    await dashboard.expectVoiceControlsHidden();

    await expect(dashboard.webDemoNote).toBeVisible();
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
  });

  test('keeps voice controls hidden after a reload that preserves the locale', async ({ dashboard, page }) => {
    await dashboard.open();
    await dashboard.setLanguage('fr');
    await expect(dashboard.webDemoNote).toContainText('Démo web');

    await page.reload();
    await expect(dashboard.languageSelect).toHaveValue('fr');
    await dashboard.expectVoiceControlsHidden();
    await expect(dashboard.webDemoNote).toContainText('Démo web');
  });
});
