import { computed, Injectable, signal } from '@angular/core';
import { DEFAULT_CATEGORIES } from '../models/saved-item';

const STORAGE_KEY = 'snapsort.categories.v1';

@Injectable({ providedIn: 'root' })
export class CategoryStore {
  private readonly customState = signal<string[]>(this.read());
  readonly custom = this.customState.asReadonly();
  readonly all = computed(() => [...DEFAULT_CATEGORIES, ...this.customState()].sort((a, b) => a.localeCompare(b)));

  add(rawName: string): boolean {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (!name || this.all().some((category) => category.toLocaleLowerCase() === name.toLocaleLowerCase())) return false;
    this.customState.update((categories) => [...categories, name]);
    this.persist();
    return true;
  }

  remove(name: string): void {
    this.customState.update((categories) => categories.filter((category) => category !== name));
    this.persist();
  }

  clear(): void {
    this.customState.set([]);
    this.persist();
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.customState()));
  }

  private read(): string[] {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
}
