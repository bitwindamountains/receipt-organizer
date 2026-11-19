import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NewSavedItem, SavedItem } from '../models/saved-item';
import { CategoryStore } from '../services/category.store';
import { ImageStorageService } from '../services/image-storage.service';
import { ItemStore } from '../services/item.store';
import { DEMO_TAG } from './demo-data';
import { DemoService } from './demo.service';

// jsdom has no canvas: a context that accepts every drawing call lets the real renderer run.
const context = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });

const mine: SavedItem = {
  id: 'mine', type: 'receipt', imageKey: 'images/mine.jpg', mimeType: 'image/jpeg', title: null, notes: null, category: 'Food',
  tags: ['demo'], merchant: null, amountMinor: 100, currencyCode: 'PHP', purchaseDate: null, isFavorite: false, flow: 'expense',
  warrantyUntil: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};

function setup(failOnCreate = Infinity) {
  const items = signal<SavedItem[]>([mine]);
  let created = 0;
  const store = {
    items,
    load: vi.fn(async () => undefined),
    create: vi.fn(async (input: NewSavedItem) => {
      if (++created >= failOnCreate) throw new Error('disk full');
      const item = { ...input, id: `d${created}`, createdAt: '', updatedAt: '' } as SavedItem;
      items.update((all) => [item, ...all]);
      return item;
    }),
    delete: vi.fn(async (id: string) => items.update((all) => all.filter((item) => item.id !== id))),
  };
  const images = { store: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
  TestBed.configureTestingModule({
    providers: [
      { provide: ItemStore, useValue: store },
      { provide: ImageStorageService, useValue: images },
      { provide: CategoryStore, useValue: { add: vi.fn() } },
    ],
  });
  return { demo: TestBed.inject(DemoService), items, images };
}

describe('DemoService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(new Blob(['png'])));
  });

  it('removes only demo receipts, keeping a user item tagged "demo"', async () => {
    const { demo, items, images } = setup();
    await demo.load();
    expect(items().filter((item) => item.tags.includes(DEMO_TAG))).toHaveLength(12);
    await demo.remove();
    expect(items()).toEqual([mine]);
    expect(images.remove).toHaveBeenCalledTimes(12);
    expect(images.remove).not.toHaveBeenCalledWith(mine.imageKey);
  });

  it('undoes a load that fails partway, so it can be retried', async () => {
    const { demo, items, images } = setup(5);
    await expect(demo.load()).rejects.toThrow('disk full');
    expect(items()).toEqual([mine]);
    expect(demo.active()).toBe(false);
    expect(images.remove).toHaveBeenCalledTimes(5); // 4 saved items plus the image of the failed one
  });
});
