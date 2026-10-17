import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SavedItem } from '../models/saved-item';
import { CategoryStore } from '../services/category.store';
import { ImageStorageService } from '../services/image-storage.service';
import { ItemStore } from '../services/item.store';
import { createBackupWriter } from './backup-format';
import { BackupService } from './backup.service';

const base: SavedItem = {
  id: 'a', type: 'receipt', imageKey: 'images/a.jpg', mimeType: 'image/jpeg', title: null, notes: null, category: 'Food',
  tags: [], merchant: null, amountMinor: 100, currencyCode: 'PHP', purchaseDate: null, isFavorite: false, flow: 'expense',
  warrantyUntil: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};
const b: SavedItem = { ...base, id: 'b', imageKey: 'images/b.jpg' };

async function archive(items: SavedItem[], tamper = false): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  const writer = createBackupWriter(async (chunk) => void chunks.push(chunk), 'test');
  await writer.addJson('categories.json', ['Pets']);
  for (const item of items) await writer.add(item.imageKey, new Uint8Array([item.id.charCodeAt(0)]));
  await writer.addJson('items.json', items);
  await writer.finish(items.length);
  const bytes = new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
  // Flip image a's one data byte: it follows the 12-byte name and a 5-byte stored-block header.
  if (tamper) bytes[indexOf(bytes, new TextEncoder().encode('images/a.jpg')) + 12 + 5] ^= 1;
  return { stream: () => streamOf(bytes) } as unknown as Blob;
}

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  return haystack.findIndex((_, start) => needle.every((byte, i) => haystack[start + i] === byte));
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start: (controller) => (controller.enqueue(bytes), controller.close()) });
}

function setup(existing: SavedItem[]) {
  const items = signal(existing);
  const store = { items, load: vi.fn(async () => undefined), restore: vi.fn(async (item: SavedItem) => items.update((all) => [...all, item])) };
  const images = { store: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
  const categories = { add: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: ItemStore, useValue: store },
      { provide: ImageStorageService, useValue: images },
      { provide: CategoryStore, useValue: categories },
    ],
  });
  return { service: TestBed.inject(BackupService), store, images, categories };
}

describe('BackupService.restore', () => {
  it('adds new items and their images, skipping ones already in the library', async () => {
    const { service, store, images, categories } = setup([base]);
    const result = await service.restore(await archive([base, b]));
    expect(result).toEqual({ imported: 1, skipped: 1, failed: 0 });
    expect(store.restore).toHaveBeenCalledExactlyOnceWith(b);
    expect(images.store).toHaveBeenCalledExactlyOnceWith('images/b.jpg', expect.any(Blob));
    expect(categories.add).toHaveBeenCalledWith('Pets');
  });

  it('removes the image again when saving the record fails', async () => {
    const { service, store, images } = setup([]);
    store.restore.mockRejectedValueOnce(new Error('disk full'));
    const result = await service.restore(await archive([b]));
    expect(result).toEqual({ imported: 0, skipped: 0, failed: 1 });
    expect(images.remove).toHaveBeenCalledWith('images/b.jpg');
  });

  it('changes nothing when an image does not match its checksum', async () => {
    const { service, store, images } = setup([]);
    await expect(service.restore(await archive([base], true))).rejects.toThrow('damaged');
    expect(images.store).not.toHaveBeenCalled();
    expect(store.restore).not.toHaveBeenCalled();
  });
});
