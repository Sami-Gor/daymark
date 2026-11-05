import { expect, type Locator, type Page } from '@playwright/test';

/*
 * Voice controls in the Today hero: "Hear today" narration and the Ask Daymark
 * microphone. Playback/recognition stubs are provided by the speech fixture;
 * this object only models the visible controls and their state.
 */
export class VoiceControlsPage {
  readonly page: Page;

  readonly hearTodayButton: Locator;
  readonly askButton: Locator;
  readonly preparingStatus: Locator;
  readonly voiceError: Locator;
  readonly askPrivacy: Locator;
  readonly askPanel: Locator;
  readonly askStatus: Locator;
  readonly askError: Locator;
  readonly askQuestion: Locator;
  readonly askAnswer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.hearTodayButton = page.getByTestId('button-hear-today');
    this.askButton = page.getByTestId('button-ask-daymark');
    this.preparingStatus = page.getByTestId('voice-preparing-status');
    this.voiceError = page.getByTestId('voice-error');
    this.askPrivacy = page.getByTestId('ask-privacy');
    this.askPanel = page.getByTestId('ask-panel');
    this.askStatus = page.getByTestId('ask-status');
    this.askError = page.getByTestId('ask-error');
    this.askQuestion = page.getByTestId('ask-question');
    this.askAnswer = page.getByTestId('ask-answer');
  }

  async startNarration(): Promise<void> {
    await this.hearTodayButton.click();
  }

  async stopNarration(): Promise<void> {
    await this.hearTodayButton.click();
  }

  async toggleListening(): Promise<void> {
    await this.askButton.click();
  }

  async expectAskHidden(): Promise<void> {
    await expect(this.askButton).toHaveCount(0);
    await expect(this.askPrivacy).toHaveCount(0);
  }

  async expectQuestion(text: string | RegExp): Promise<void> {
    await expect(this.askQuestion).toContainText(text);
  }

  async expectAnswer(text: string | RegExp): Promise<void> {
    await expect(this.askAnswer).toContainText(text);
  }

  async expectError(text: string | RegExp): Promise<void> {
    await expect(this.askError).toContainText(text);
  }
}
