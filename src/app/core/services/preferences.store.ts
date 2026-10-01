import { Injectable, signal } from '@angular/core';

const AUTO_READ_KEY = 'snapsort.autoRead';

/** Small on-device preferences, kept in localStorage. */
@Injectable({ providedIn: 'root' })
export class PreferencesStore {
  private readonly autoReadState = signal(read(AUTO_READ_KEY) !== 'false');
  /** Read text from newly picked images and fill in the details. */
  readonly autoRead = this.autoReadState.asReadonly();

  setAutoRead(enabled: boolean): void {
    this.autoReadState.set(enabled);
    write(AUTO_READ_KEY, String(enabled));
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
