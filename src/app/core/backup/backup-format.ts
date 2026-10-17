import { Unzip, UnzipInflate, Zip, ZipDeflate } from 'fflate';
import { SavedItem } from '../models/saved-item';

/** A problem with the backup file itself; its message is written for the user. */
export class BackupError extends Error {}

export const BACKUP_FORMAT = 'snapsort-backup';
export const BACKUP_VERSION = 1;

/** Last entry of every archive; lists a SHA-256 for each other entry. */
export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  createdAt: string;
  itemCount: number;
  checksums: Record<string, string>;
}

/** The only entry names a backup may contain. Image names have no dots or slashes, so they cannot leave `images/`. */
const IMAGE_KEY = /^images\/[A-Za-z0-9_-]{1,64}\.[a-z0-9]{1,5}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

export function isBackupEntry(name: string): boolean {
  return name === 'manifest.json' || name === 'items.json' || name === 'categories.json' || IMAGE_KEY.test(name);
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Streams a zip archive to `sink` one entry at a time, so only one image is in memory.
 * Entries use deflate level 0: images are already compressed, and stored-with-descriptor
 * entries cannot be streamed back in.
 */
export function createBackupWriter(sink: (chunk: Uint8Array) => Promise<void>, appVersion: string) {
  let pending: Uint8Array[] = [];
  let failure: Error | null = null;
  const checksums: Record<string, string> = {};
  const zip = new Zip((error, chunk, _final) => {
    if (error) failure = error;
    else pending.push(chunk);
  });
  const flush = async () => {
    if (failure) throw failure;
    const chunks = pending;
    pending = [];
    if (chunks.length) await sink(concat(chunks));
  };
  const add = async (name: string, bytes: Uint8Array) => {
    if (!isBackupEntry(name) || name === 'manifest.json') throw new Error(`Unexpected backup entry: ${name}`);
    checksums[name] = await sha256(bytes);
    const entry = new ZipDeflate(name, { level: 0 });
    zip.add(entry);
    entry.push(bytes, true);
    await flush();
  };
  return {
    add,
    addJson: (name: string, value: unknown) => add(name, new TextEncoder().encode(JSON.stringify(value))),
    async finish(itemCount: number): Promise<void> {
      const manifest: BackupManifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion, createdAt: new Date().toISOString(), itemCount, checksums };
      const entry = new ZipDeflate('manifest.json', { level: 0 });
      zip.add(entry);
      entry.push(new TextEncoder().encode(JSON.stringify(manifest)), true);
      zip.end();
      await flush();
    },
  };
}

/** Streams a zip archive and hands each known entry to `onEntry` in archive order. Unknown entries are skipped unread. */
export async function readBackup(stream: ReadableStream<Uint8Array>, onEntry: (name: string, bytes: Uint8Array) => Promise<void>): Promise<void> {
  const ready: { name: string; bytes: Uint8Array }[] = [];
  let failure: unknown = null;
  const unzip = new Unzip((file) => {
    if (!isBackupEntry(file.name)) return;
    const parts: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error) return void (failure ??= error);
      size += chunk.length;
      // Guards against a crafted archive that inflates far past any real image.
      if (size > MAX_ENTRY_BYTES) {
        failure ??= new BackupError('The backup contains a file that is too large.');
        return file.terminate();
      }
      parts.push(chunk);
      if (final) ready.push({ name: file.name, bytes: concat(parts) });
    };
    try {
      file.start();
    } catch (error) {
      failure ??= error;
    }
  });
  unzip.register(UnzipInflate);
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      unzip.push(value ?? new Uint8Array(0), done);
      if (failure) throw failure;
      while (ready.length) {
        const entry = ready.shift()!;
        await onEntry(entry.name, entry.bytes);
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

export function parseManifest(bytes: Uint8Array | undefined): BackupManifest {
  if (!bytes) throw new BackupError('This file is not a SnapSort backup.');
  const value = parseJson(bytes) as Partial<BackupManifest> | null;
  if (value?.format !== BACKUP_FORMAT) throw new BackupError('This file is not a SnapSort backup.');
  if (typeof value.version !== 'number' || value.version > BACKUP_VERSION) throw new BackupError('This backup was made by a newer SnapSort. Update the app, then try again.');
  if (!value.checksums || typeof value.checksums !== 'object') throw new BackupError('The backup is damaged.');
  return value as BackupManifest;
}

/** Validates every record; one malformed record rejects the whole backup rather than restoring part of it silently. */
export function parseItems(bytes: Uint8Array | undefined): SavedItem[] {
  const value = bytes ? parseJson(bytes) : null;
  if (!Array.isArray(value)) throw new BackupError('The backup is damaged.');
  const ids = new Set<string>();
  return value.map((raw, index) => {
    const item = toItem(raw);
    if (!item || ids.has(item.id)) throw new BackupError(`The backup is damaged (record ${index + 1}).`);
    ids.add(item.id);
    return item;
  });
}

export function parseCategories(bytes: Uint8Array | undefined): string[] {
  const value = bytes ? parseJson(bytes) : [];
  return Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string' && name.trim().length > 0 && name.length <= 60) : [];
}

function toItem(raw: unknown): SavedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  // Records saved before warranty dates existed have no field at all.
  const item: Record<string, unknown> = { warrantyUntil: null, ...raw };
  const text = (key: string, max = 2000) => typeof item[key] === 'string' && (item[key] as string).length <= max;
  const optionalText = (key: string, max = 2000) => item[key] === null || text(key, max);
  const optionalDate = (key: string) => item[key] === null || (typeof item[key] === 'string' && DATE.test(item[key] as string));
  const valid =
    text('id', 64) && /^[A-Za-z0-9_-]+$/.test(item['id'] as string) &&
    (item['type'] === 'screenshot' || item['type'] === 'receipt') &&
    typeof item['imageKey'] === 'string' && IMAGE_KEY.test(item['imageKey']) &&
    typeof item['mimeType'] === 'string' && /^image\/[a-z0-9.+-]+$/.test(item['mimeType']) &&
    optionalText('title', 200) && optionalText('notes') && text('category', 60) &&
    Array.isArray(item['tags']) && item['tags'].every((tag) => typeof tag === 'string' && tag.length <= 60) &&
    optionalText('merchant', 200) &&
    (item['amountMinor'] === null || (Number.isSafeInteger(item['amountMinor']) && (item['amountMinor'] as number) >= 0)) &&
    (item['currencyCode'] === null || (typeof item['currencyCode'] === 'string' && /^[A-Z]{3}$/.test(item['currencyCode']))) &&
    optionalDate('purchaseDate') && optionalDate('warrantyUntil') &&
    typeof item['isFavorite'] === 'boolean' &&
    (item['flow'] === 'expense' || item['flow'] === 'income') &&
    text('createdAt', 40) && !Number.isNaN(Date.parse(item['createdAt'] as string)) &&
    text('updatedAt', 40) && !Number.isNaN(Date.parse(item['updatedAt'] as string));
  if (!valid) return null;
  return {
    id: item['id'], type: item['type'], imageKey: item['imageKey'], mimeType: item['mimeType'],
    title: item['title'], notes: item['notes'], category: item['category'], tags: item['tags'],
    merchant: item['merchant'], amountMinor: item['amountMinor'], currencyCode: item['currencyCode'],
    purchaseDate: item['purchaseDate'], isFavorite: item['isFavorite'], flow: item['flow'],
    warrantyUntil: item['warrantyUntil'], createdAt: item['createdAt'], updatedAt: item['updatedAt'],
  } as SavedItem;
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
