import { Zip, ZipDeflate } from 'fflate';
import { SavedItem } from '../models/saved-item';
import { createBackupWriter, isBackupEntry, parseItems, parseManifest, readBackup, sha256 } from './backup-format';

const item: SavedItem = {
  id: 'a1b2', type: 'receipt', imageKey: 'images/a1b2.jpg', mimeType: 'image/jpeg', title: 'Lunch', notes: null,
  category: 'Food', tags: ['work'], merchant: 'Jollibee', amountMinor: 32000, currencyCode: 'PHP', purchaseDate: '2026-10-01',
  isFavorite: false, flow: 'expense', warrantyUntil: null, createdAt: '2026-10-01T04:00:00.000Z', updatedAt: '2026-10-01T04:00:00.000Z',
};

async function build(): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const writer = createBackupWriter(async (chunk) => void chunks.push(chunk), '0.2.0');
  await writer.addJson('items.json', [item]);
  await writer.add('images/a1b2.jpg', new Uint8Array([1, 2, 3, 4, 5]));
  await writer.finish(1);
  return new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
}

async function read(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  // Small chunks so entries straddle reads, as they do when streaming a real file.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
      controller.close();
    },
  });
  await readBackup(stream, async (name, data) => void entries.set(name, data));
  return entries;
}

describe('backup format', () => {
  it('round-trips items, images, and checksums through a streamed zip', async () => {
    const entries = await read(await build());
    const manifest = parseManifest(entries.get('manifest.json'));
    expect(manifest.itemCount).toBe(1);
    expect(parseItems(entries.get('items.json'))).toEqual([item]);
    const image = entries.get('images/a1b2.jpg')!;
    expect([...image]).toEqual([1, 2, 3, 4, 5]);
    expect(manifest.checksums['images/a1b2.jpg']).toBe(await sha256(image));
  });

  it('skips entries outside the known names, including path traversal', async () => {
    expect(isBackupEntry('images/../../databases/snapsort.db')).toBe(false);
    expect(isBackupEntry('images/a.b.jpg')).toBe(false);
    const chunks: Uint8Array[] = [];
    const zip = new Zip((_error, chunk) => void chunks.push(chunk));
    const evil = new ZipDeflate('../evil.jpg', { level: 0 });
    zip.add(evil);
    evil.push(new Uint8Array([9]), true);
    zip.end();
    const entries = await read(new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer()));
    expect(entries.size).toBe(0);
  });

  it('rejects other files, newer versions, and malformed records', () => {
    const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    expect(() => parseManifest(undefined)).toThrow('not a SnapSort backup');
    expect(() => parseManifest(json({ format: 'snapsort-backup', version: 99, checksums: {} }))).toThrow('newer SnapSort');
    expect(() => parseItems(json([{ ...item, imageKey: '../x.jpg' }]))).toThrow('record 1');
    expect(() => parseItems(json([{ ...item, amountMinor: -5 }]))).toThrow('record 1');
    expect(() => parseItems(json([item, item]))).toThrow('record 2');
    const { warrantyUntil: _, ...older } = item;
    expect(parseItems(json([older]))[0].warrantyUntil).toBeNull();
  });
});
