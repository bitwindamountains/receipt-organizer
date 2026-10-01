import { Injectable, signal } from '@angular/core';
import { nextReceiptNumber } from './receipt-draft';

const PROFILE_KEY = 'snapsort.business.v1';
const NUMBER_KEY = 'snapsort.receiptNumber';

export interface BusinessProfile {
  name: string;
  details: string;
  accent: string;
}

export const RECEIPT_ACCENTS = ['#26574b', '#2f5fb3', '#b2433a', '#7d4fb8', '#b36b00', '#17201e'] as const;

/** The seller's details and receipt numbering for "I sold" receipts, kept on the device. */
@Injectable({ providedIn: 'root' })
export class BusinessProfileStore {
  private readonly profileState = signal<BusinessProfile>(readProfile());
  readonly profile = this.profileState.asReadonly();

  save(profile: BusinessProfile): void {
    this.profileState.set(profile);
    write(PROFILE_KEY, JSON.stringify(profile));
  }

  /** The number to suggest for the next receipt. */
  nextNumber(): string {
    return nextReceiptNumber(read(NUMBER_KEY));
  }

  recordNumber(number: string): void {
    write(NUMBER_KEY, number);
  }
}

function readProfile(): BusinessProfile {
  try {
    const value = JSON.parse(read(PROFILE_KEY) ?? 'null') as Partial<BusinessProfile> | null;
    return {
      name: typeof value?.name === 'string' ? value.name : '',
      details: typeof value?.details === 'string' ? value.details : '',
      accent: typeof value?.accent === 'string' ? value.accent : RECEIPT_ACCENTS[0],
    };
  } catch {
    return { name: '', details: '', accent: RECEIPT_ACCENTS[0] };
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
    // Not critical; the details can be typed again.
  }
}
