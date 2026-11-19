import { computed, inject, Injectable, signal } from '@angular/core';
import { renderReceipt } from '../receipts/receipt-renderer';
import { CategoryStore } from '../services/category.store';
import { ImageStorageService } from '../services/image-storage.service';
import { ItemStore } from '../services/item.store';
import { DEMO_TAG, demoEntries } from './demo-data';

/** Fills the library with sample receipts to try the app, and removes exactly those again. */
@Injectable({ providedIn: 'root' })
export class DemoService {
  private readonly store = inject(ItemStore);
  private readonly images = inject(ImageStorageService);
  private readonly categories = inject(CategoryStore);

  readonly items = computed(() => this.store.items().filter((item) => item.tags.includes(DEMO_TAG)));
  readonly active = computed(() => this.items().length > 0);
  readonly busy = signal(false);

  async load(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.store.load();
      if (this.active()) return;
      // Oldest first, so the newest demo receipt ends up on top of the library.
      for (const { draft, item } of demoEntries().reverse()) {
        this.categories.add(item.category); // no-op for existing categories
        const imageKey = `images/${crypto.randomUUID()}.png`;
        await this.images.store(imageKey, await renderReceipt(draft));
        await this.store.create({ ...item, imageKey });
      }
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      for (const item of this.items()) {
        await this.store.delete(item.id);
        await this.images.remove(item.imageKey);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
