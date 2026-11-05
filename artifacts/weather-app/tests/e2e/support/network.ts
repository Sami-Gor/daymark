import { expect, type ConsoleMessage, type Page } from '@playwright/test';

/*
 * Observation helpers used by privacy, security and no-network assertions.
 * Both are installed as auto fixtures before navigation.
 */

export class RequestLog {
  private readonly urls: string[] = [];

  constructor(page: Page) {
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:')) return;
      this.urls.push(url);
    });
  }

  all(): string[] {
    return [...this.urls];
  }

  clear(): void {
    this.urls.length = 0;
  }

  matching(predicate: (url: string) => boolean): string[] {
    return this.urls.filter(predicate);
  }

  byHostname(hostname: string): string[] {
    return this.matching((url) => {
      try {
        return new URL(url).hostname === hostname;
      } catch {
        return false;
      }
    });
  }

  forecast(): string[] {
    return this.byHostname('api.open-meteo.com');
  }

  airQuality(): string[] {
    return this.byHostname('air-quality-api.open-meteo.com');
  }

  geocoding(): string[] {
    return this.byHostname('geocoding-api.open-meteo.com');
  }

  weatherApi(): string[] {
    // Match on the parsed hostname rather than a URL substring: a substring
    // check can be satisfied by arbitrary hosts such as
    // "open-meteo.com.evil.example" (CodeQL: incomplete URL sanitization).
    return this.matching((url) => {
      try {
        const { hostname } = new URL(url);
        return hostname === 'open-meteo.com' || hostname.endsWith('.open-meteo.com');
      } catch {
        return false;
      }
    });
  }

  external(): string[] {
    return this.matching((url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol.startsWith('http') && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1';
      } catch {
        return false;
      }
    });
  }

  async waitForHostname(hostname: string, timeout = 5_000): Promise<void> {
    await expect.poll(() => this.byHostname(hostname).length, { timeout }).toBeGreaterThan(0);
  }
}

export type ConsoleEntry = { type: string; text: string };

export class BrowserLog {
  private readonly consoleEntries: ConsoleEntry[] = [];
  private readonly pageErrors: string[] = [];

  constructor(page: Page) {
    page.on('console', (message: ConsoleMessage) => {
      this.consoleEntries.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error: Error) => {
      this.pageErrors.push(error.message);
    });
  }

  console(): ConsoleEntry[] {
    return [...this.consoleEntries];
  }

  consoleErrors(): ConsoleEntry[] {
    return this.consoleEntries.filter((entry) => entry.type === 'error');
  }

  cspErrors(): string[] {
    return this.consoleEntries
      .filter((entry) => /content security policy/i.test(entry.text))
      .map((entry) => entry.text);
  }

  errors(): string[] {
    return [...this.pageErrors];
  }

  clear(): void {
    this.consoleEntries.length = 0;
    this.pageErrors.length = 0;
  }
}
