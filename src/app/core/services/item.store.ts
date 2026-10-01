import { computed, inject, Injectable, signal } from '@angular/core';
import { NewSavedItem, SavedItem } from '../models/saved-item';
import { DatabaseService } from './database.service';

@Injectable({ providedIn: 'root' })
export class ItemStore {
  private readonly database = inject(DatabaseService);
  private readonly state = signal<SavedItem[]>([]);
  private readonly busyState = signal(false);
  private readonly loadedState = signal(false);
  private pending?: Promise<void>;

  readonly items = this.state.asReadonly();
  readonly recent = computed(() => this.state().slice(0, 8));
  readonly favorites = computed(() => this.state().filter((item) => item.isFavorite));
  readonly busy = this.busyState.asReadonly();
  /** True once the library has been read at least once. */
  readonly ready = this.loadedState.asReadonly();

  load(force = false): Promise<void> {
    if (this.loadedState() && !force) return Promise.resolve();
    // Several screens ask for the library at startup; share one read.
    this.pending ??= this.read().finally(() => (this.pending = undefined));
    return this.pending;
  }

  private async read(): Promise<void> {
    this.busyState.set(true);
    try {
      this.state.set(await this.database.list());
      this.loadedState.set(true);
    } finally {
      this.busyState.set(false);
    }
  }

  async create(input: NewSavedItem): Promise<SavedItem> {
    const now = new Date().toISOString();
    const item: SavedItem = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    await this.database.save(item);
    this.state.update((items) => [item, ...items]);
    return item;
  }

  async update(item: SavedItem): Promise<void> {
    const updated = { ...item, updatedAt: new Date().toISOString() };
    await this.database.save(updated);
    this.state.update((items) => items.map((candidate) => (candidate.id === item.id ? updated : candidate)));
  }

  async toggleFavorite(id: string): Promise<void> {
    const item = this.state().find((candidate) => candidate.id === id);
    if (item) await this.update({ ...item, isFavorite: !item.isFavorite });
  }

  async clear(): Promise<void> {
    for (const item of [...this.state()]) await this.database.delete(item.id);
    this.state.set([]);
  }

  async delete(id: string): Promise<SavedItem | undefined> {
    const item = this.state().find((candidate) => candidate.id === id);
    if (!item) return undefined;
    await this.database.delete(id);
    this.state.update((items) => items.filter((candidate) => candidate.id !== id));
    return item;
  }

  async restore(item: SavedItem): Promise<void> {
    await this.database.save(item);
    this.state.update((items) => [item, ...items.filter((candidate) => candidate.id !== item.id)]);
  }

  async byId(id: string): Promise<SavedItem | undefined> {
    await this.load();
    return this.state().find((item) => item.id === id);
  }
}
