import { Injectable, signal } from '@angular/core';

const AUTO_READ_KEY = 'snapsort.autoRead';
const LAST_CURRENCY_KEY = 'snapsort.currency.last';
const INBOX_KEY = 'snapsort.inbox.enabled';

/** Small on-device preferences, kept in localStorage. */
@Injectable({ providedIn: 'root' })
export class PreferencesStore {
  private readonly autoReadState = signal(read(AUTO_READ_KEY) !== 'false');
  /** Read text from newly picked images and fill in the details. */
  readonly autoRead = this.autoReadState.asReadonly();

  private readonly inboxState = signal(read(INBOX_KEY) === 'true');
  /** Look for new payment screenshots and offer to add them. */
  readonly screenshotInbox = this.inboxState.asReadonly();

  setScreenshotInbox(enabled: boolean): void {
    this.inboxState.set(enabled);
    write(INBOX_KEY, String(enabled));
  }

  setAutoRead(enabled: boolean): void {
    this.autoReadState.set(enabled);
    write(AUTO_READ_KEY, String(enabled));
  }

  /** Currency of the last saved receipt, used as the default for the next one. */
  lastCurrency(): string {
    return read(LAST_CURRENCY_KEY) || 'PHP';
  }

  rememberCurrency(code: string): void {
    write(LAST_CURRENCY_KEY, code);
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences are a convenience; the default applies next time.
  }
}
