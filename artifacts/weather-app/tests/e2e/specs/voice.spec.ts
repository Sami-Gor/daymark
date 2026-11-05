import { expect, test } from '../support/fixtures';

/*
 * Voice controls in the Today hero: "Hear today" narration and the Ask Daymark
 * microphone.
 *
 * The `speech` fixture installs the Web Speech playback/recognition stubs before
 * navigation. Fixture options model the two degraded environments covered here:
 * `speechPlaybackFails` (speechSynthesis.speak throws) and
 * `speechRecognitionSupported: false` (the recognition API is absent).
 */

test.describe('voice playback and Ask Daymark', () => {
  test('Hear today speaks the briefing and toggles to Stop', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await expect(voice.hearTodayButton).toBeVisible();
    await expect(voice.hearTodayButton).toHaveText(/Hear today/);

    await voice.startNarration();
    await expect(voice.hearTodayButton).toHaveText(/Stop/);
    await expect(voice.hearTodayButton).toHaveAttribute('aria-label', /Stop reading/);

    const spoken = await speech.spoken();
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain('degrees');

    await voice.stopNarration();
    await expect(voice.hearTodayButton).toHaveText(/Hear today/);
    expect(await speech.cancelCount()).toBeGreaterThanOrEqual(1);
  });

  test('speech end resets the playback control', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await voice.startNarration();
    await expect(voice.hearTodayButton).toHaveText(/Stop/);

    await speech.finishUtterance();
    await expect(voice.hearTodayButton).toHaveText(/Hear today/);
  });

  test('changing the language stops the active narration', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await voice.startNarration();
    await expect(voice.hearTodayButton).toHaveText(/Stop/);

    await dashboard.setLanguage('fr');
    await expect(voice.hearTodayButton).not.toHaveText(/^Stop$/);
    expect(await speech.cancelCount()).toBeGreaterThanOrEqual(1);
  });

  test('Hear today stops an active listening session', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await voice.toggleListening();
    expect((await speech.recognitionState()).starts).toBe(1);

    await voice.startNarration();
    expect((await speech.recognitionState()).stops).toBeGreaterThanOrEqual(1);
  });

  test.describe('when playback cannot start', () => {
    test.use({ speechPlaybackFails: true });

    test('shows a narration error when playback cannot start', async ({ dashboard, speech, voice }) => {
      // Requesting `speech` installs the failing playback stub before navigation.
      void speech;
      await dashboard.open();
      await voice.startNarration();

      await expect(voice.voiceError).toBeVisible();
      await expect(voice.voiceError).toHaveText(/Voice playback isn't available/);
      await expect(voice.hearTodayButton).toHaveText(/Hear today/);
      await expect(voice.hearTodayButton).not.toHaveAttribute('aria-pressed', 'true');
    });
  });

  test.describe('without speech recognition', () => {
    test.use({ speechRecognitionSupported: false });

    test('Ask Daymark hides when speech recognition is unsupported', async ({ dashboard, speech, voice }) => {
      // The fixture installs the unsupported-recognition stub before navigation.
      void speech;
      await dashboard.open();

      await voice.expectAskHidden();
      await expect(voice.hearTodayButton).toBeVisible();
    });
  });

  test('shows a localized voice privacy disclosure when voice is available', async ({ dashboard, speech, voice }) => {
    void speech;
    await dashboard.open();

    const note = voice.askPrivacy;
    await expect(note).toBeVisible();
    await expect(note).toContainText('handled by your browser or device');
    expect(await note.evaluate((element) => element.tabIndex)).toBe(-1);

    await dashboard.setLanguage('fr');
    await expect(note).toContainText('assurée par votre navigateur');

    await dashboard.setLanguage('es');
    await expect(note).toContainText('navegador o dispositivo');
  });

  test('does not request the microphone on load', async ({ dashboard, page, speech }) => {
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

    expect((await speech.recognitionState()).starts).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __mediaRequests: number }).__mediaRequests)).toBe(0);
  });

  test('Ask Daymark resolves a rain question and shows the answer', async ({ dashboard, page, speech, voice }) => {
    await dashboard.open();
    await expect(voice.askButton).toHaveText(/Ask Daymark/);

    await voice.toggleListening();
    await expect(voice.askButton).toHaveText(/Stop/);
    await expect(voice.askStatus).toHaveText(/Listening/);
    expect((await speech.recognitionState()).starts).toBe(1);

    expect(await speech.emitResult('When will it rain?')).toBe(true);
    await speech.emitRecognitionEnd();

    await expect(voice.askButton).toHaveText(/Ask Daymark/);
    await voice.expectQuestion('when will it rain');
    await voice.expectAnswer('chance of rain');
    await voice.expectAnswer('11 PM');

    const spoken = await speech.spoken();
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain('chance of rain');

    // No transcript or question is persisted anywhere.
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  });

  test('unknown questions get the deterministic fallback, not a made-up answer', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await voice.toggleListening();
    await speech.emitResult('what is the meaning of life');
    await speech.emitRecognitionEnd();

    await voice.expectAnswer('I can help with');
    expect(await speech.spoken()).toHaveLength(0);
  });

  test('Stop ends recognition and returns the control to idle', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await voice.toggleListening();
    await expect(voice.askButton).toHaveText(/Stop/);

    await voice.toggleListening();
    await expect(voice.askButton).toHaveText(/Ask Daymark/);
    await expect(voice.askStatus).toHaveCount(0);
    expect((await speech.recognitionState()).stops).toBe(1);
  });

  test('permission errors are readable and return the UI to idle', async ({ dashboard, speech, voice }) => {
    await dashboard.open();
    await voice.toggleListening();
    await speech.emitError('not-allowed');

    await voice.expectError('blocked');
    await expect(voice.askButton).toHaveText(/Ask Daymark/);
    expect((await speech.recognitionState()).starts).toBe(1);
  });

  test('starting recognition stops playback and stale sessions cannot update the UI', async ({ dashboard, page, speech, voice }) => {
    await dashboard.open();
    const hear = voice.hearTodayButton;
    const ask = voice.askButton;

    await hear.click();
    await expect(hear).toHaveText(/Stop/);
    await ask.click();
    await expect(hear).toHaveText(/Hear today/);
    expect(await speech.cancelCount()).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
      (window as unknown as { __staleResult?: (event: unknown) => void }).__staleResult = (window as unknown as {
        __recognition?: { instance?: { onresult?: (event: unknown) => void } | null };
      }).__recognition?.instance?.onresult ?? undefined;
    });
    await ask.click(); // stop the first session
    await ask.click(); // start a new session
    expect((await speech.recognitionState()).starts).toBe(2);
    await page.evaluate(() => {
      (window as unknown as { __staleResult?: (event: unknown) => void }).__staleResult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'will it rain' }, isFinal: true }],
      });
    });
    await expect(voice.askQuestion).toHaveCount(0);

    await speech.emitResult("what's the uv");
    await speech.emitRecognitionEnd();
    await voice.expectQuestion("what's the uv");
    await voice.expectAnswer('UV index');
  });

  test('unmounting aborts recognition and stops background listening', async ({ dashboard, page, speech, voice }) => {
    await dashboard.open();
    await voice.toggleListening();
    await expect(voice.askButton).toHaveText(/Stop/);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/missing');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(voice.askButton).toHaveCount(0);
    expect((await speech.recognitionState()).stops).toBeGreaterThanOrEqual(1);

    const detached = await page.evaluate(() => {
      const instance = (window as unknown as {
        __recognition?: {
          instance?: { onresult?: unknown; onerror?: unknown; onend?: unknown } | null;
        };
      }).__recognition?.instance;
      return instance ? { onresult: instance.onresult, onerror: instance.onerror, onend: instance.onend } : null;
    });
    expect(detached).not.toBeNull();
    expect(detached?.onresult).toBeNull();
    expect(detached?.onerror).toBeNull();
    expect(detached?.onend).toBeNull();
  });
});
