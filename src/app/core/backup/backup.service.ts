import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SavedItem } from '../models/saved-item';
import { CategoryStore } from '../services/category.store';
import { ImageStorageService } from '../services/image-storage.service';
import { ItemStore } from '../services/item.store';
import { BackupError, createBackupWriter, isBackupEntry, parseCategories, parseItems, parseManifest, readBackup, sha256 } from './backup-format';

export const APP_VERSION = '0.2.0';
const BACKUP_DIR = 'backups';

export interface ExportResult {
  exported: number;
  /** Items left out because their image file is gone. */
  missing: number;
}

export interface RestoreResult {
  imported: number;
  /** Already in the library (same id or image). */
  skipped: number;
  failed: number;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly store = inject(ItemStore);
  private readonly images = inject(ImageStorageService);
  private readonly categories = inject(CategoryStore);

  /** Writes a backup archive and hands it to the system share sheet (Android) or a download (browser). */
  async export(): Promise<ExportResult> {
    await this.store.load();
    const items = [...this.store.items()];
    const fileName = `snapsort-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    const output = Capacitor.isNativePlatform() ? await this.nativeOutput(fileName) : this.browserOutput(fileName);
    const writer = createBackupWriter(output.write, APP_VERSION);
    const included: SavedItem[] = [];
    await writer.addJson('categories.json', this.categories.custom());
    for (const item of items) {
      if (!isBackupEntry(item.imageKey)) continue;
      const blob = await this.images.readBlob(item.imageKey).catch(() => undefined);
      if (!blob) continue;
      await writer.add(item.imageKey, new Uint8Array(await blob.arrayBuffer()));
      included.push(item);
    }
    await writer.addJson('items.json', included);
    await writer.finish(included.length);
    await output.deliver();
    return { exported: included.length, missing: items.length - included.length };
  }

  /**
   * Merges a backup into the library. The whole archive is verified first, so a damaged or
   * foreign file changes nothing. Items already present are skipped, never overwritten.
   */
  async restore(file: Blob): Promise<RestoreResult> {
    const json = new Map<string, Uint8Array>();
    const hashes = new Map<string, string>();
    await readBackup(file.stream(), async (name, bytes) => {
      if (name.endsWith('.json')) json.set(name, bytes);
      hashes.set(name, await sha256(bytes));
    });
    const manifest = parseManifest(json.get('manifest.json'));
    const items = parseItems(json.get('items.json'));
    const damaged = Object.entries(manifest.checksums).some(([name, hash]) => hashes.get(name) !== hash);
    if (damaged || !manifest.checksums['items.json'] || items.some((item) => !manifest.checksums[item.imageKey])) {
      throw new BackupError('The backup is damaged.');
    }

    await this.store.load();
    const ids = new Set(this.store.items().map((item) => item.id));
    const keys = new Set(this.store.items().map((item) => item.imageKey));
    const incoming = new Map(items.filter((item) => !ids.has(item.id) && !keys.has(item.imageKey)).map((item) => [item.imageKey, item]));
    const skipped = items.length - incoming.size;
    let imported = 0;
    let failed = 0;

    await readBackup(file.stream(), async (name, bytes) => {
      const item = incoming.get(name);
      if (!item) return;
      incoming.delete(name);
      try {
        // The file is read twice; make sure it did not change in between.
        if ((await sha256(bytes)) !== manifest.checksums[name]) throw new Error('Image changed while restoring.');
        await this.images.store(name, new Blob([bytes as BlobPart], { type: item.mimeType }));
        try {
          await this.store.restore(item);
        } catch (error) {
          await this.images.remove(name);
          throw error;
        }
        imported++;
      } catch {
        failed++;
      }
    });
    failed += incoming.size;

    for (const name of parseCategories(json.get('categories.json'))) this.categories.add(name);
    await this.store.load(true);
    return { imported, skipped, failed };
  }

  private async nativeOutput(fileName: string) {
    // One backup in the cache at a time; earlier ones were already handed to the share sheet.
    await Filesystem.rmdir({ path: BACKUP_DIR, directory: Directory.Cache, recursive: true }).catch(() => undefined);
    const path = `${BACKUP_DIR}/${fileName}`;
    await Filesystem.writeFile({ path, directory: Directory.Cache, data: '', recursive: true });
    return {
      write: async (chunk: Uint8Array) => void (await Filesystem.appendFile({ path, directory: Directory.Cache, data: toBase64(chunk) })),
      deliver: async () => {
        const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
        // Closing the share sheet without choosing a destination is not an error.
        await Share.share({ title: fileName, files: [uri] }).catch((error: unknown) => {
          if (!/cancel/i.test(String((error as Error)?.message ?? error))) throw error;
        });
      },
    };
  }

  private browserOutput(fileName: string) {
    const chunks: Uint8Array[] = [];
    return {
      write: async (chunk: Uint8Array) => void chunks.push(chunk),
      deliver: async () => {
        const url = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'application/zip' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    };
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked so String.fromCharCode never gets more arguments than the stack allows.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
