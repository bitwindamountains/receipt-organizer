import { Injectable } from '@angular/core';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { createThumbnail, thumbKeyFor } from '../utils/thumbnail';

export interface SelectedImage {
  sourceUrl: string;
  mimeType: string;
  extension: string;
  /** Native file URI (Android), used for on-device text recognition. */
  fileUri?: string;
  /** Original file name when known, e.g. "Screenshot_20261001.png". */
  fileName?: string;
}

/** `thumb` is a small copy for grids; it falls back to the full image until one exists. */
export type ImageVariant = 'full' | 'thumb';

@Injectable({ providedIn: 'root' })
export class ImageStorageService {
  private browserDb?: Promise<IDBDatabase>;
  private readonly backfilling = new Set<string>();

  async selectImages(limit = 10): Promise<SelectedImage[]> {
    const result = await Camera.pickImages({ limit, quality: 95 });
    // The web picker ignores `limit`, so enforce it here.
    for (const extra of result.photos.slice(limit)) this.release(extra.webPath);
    return result.photos.slice(0, limit).map((photo) => {
      const extension = (photo.format || 'jpeg').toLowerCase().replace('jpg', 'jpeg');
      return {
        sourceUrl: photo.webPath,
        mimeType: `image/${extension}`,
        extension: extension === 'jpeg' ? 'jpg' : extension,
        fileUri: photo.path ? (photo.path.startsWith('/') ? `file://${photo.path}` : photo.path) : undefined,
        fileName: photo.path?.split('/').pop(),
      };
    });
  }

  async persist(id: string, selected: SelectedImage): Promise<string> {
    const response = await fetch(selected.sourceUrl);
    const blob = await response.blob();
    const key = `images/${id}.${selected.extension}`;
    await this.write(key, blob);
    // A missing thumbnail only costs grid performance, so never fail the save over it.
    await this.writeThumbnail(key, blob).catch(() => undefined);
    return key;
  }

  async urlFor(key: string, variant: ImageVariant = 'full'): Promise<string> {
    if (variant === 'thumb') {
      const thumb = await this.storedUrl(thumbKeyFor(key), true).catch(() => '');
      if (thumb) return thumb;
      this.backfillThumbnail(key);
    }
    return this.storedUrl(key, false);
  }

  /** Native file URI of a stored image, for on-device text recognition. */
  async fileUriFor(key: string): Promise<string | undefined> {
    if (!Capacitor.isNativePlatform()) return undefined;
    return (await Filesystem.getUri({ path: key, directory: Directory.Data })).uri;
  }

  /** Frees a URL returned by `urlFor` or `selectImages` once it is no longer displayed. */
  release(url: string | null | undefined): void {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  /** Writes an image under an existing key (backup restore), with its thumbnail. */
  async store(key: string, blob: Blob): Promise<void> {
    await this.write(key, blob);
    await this.writeThumbnail(key, blob).catch(() => undefined);
  }

  async remove(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.deleteFile({ path: key, directory: Directory.Data }).catch(() => undefined);
      await Filesystem.deleteFile({ path: thumbKeyFor(key), directory: Directory.Data }).catch(() => undefined);
      return;
    }
    const db = await this.openBrowserDb();
    const store = db.transaction('images', 'readwrite').objectStore('images');
    store.delete(thumbKeyFor(key));
    await this.requestToPromise(store.delete(key));
  }

  async share(key: string, title: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.getUri({ path: key, directory: Directory.Data });
      await Share.share({ title, files: [result.uri] });
      return;
    }
    const blob = await this.readBrowserBlob(key);
    if (!blob) throw new Error('Image file is missing.');
    const file = new File([blob], title, { type: blob.type });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, files: [file] });
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = title;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async write(key: string, blob: Blob): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      await this.writeBrowserBlob(key, blob);
      return;
    }
    await Filesystem.mkdir({ path: key.split('/')[0], directory: Directory.Data, recursive: true }).catch(() => undefined);
    await Filesystem.writeFile({ path: key, directory: Directory.Data, data: await this.blobToBase64(blob), recursive: true });
  }

  private async writeThumbnail(imageKey: string, source: Blob): Promise<void> {
    const thumbnail = await createThumbnail(source);
    if (thumbnail) await this.write(thumbKeyFor(imageKey), thumbnail);
  }

  /** Creates a missing thumbnail in the background (items saved before thumbnails existed). */
  private backfillThumbnail(imageKey: string): void {
    if (this.backfilling.has(imageKey)) return;
    this.backfilling.add(imageKey);
    void this.readBlob(imageKey)
      .then((blob) => (blob ? this.writeThumbnail(imageKey, blob) : undefined))
      .catch(() => undefined)
      .finally(() => this.backfilling.delete(imageKey));
  }

  /** A displayable URL for a stored file. With `mustExist`, native rejects when the file is missing. */
  private async storedUrl(key: string, mustExist: boolean): Promise<string> {
    if (Capacitor.isNativePlatform()) {
      if (mustExist) await Filesystem.stat({ path: key, directory: Directory.Data });
      const result = await Filesystem.getUri({ path: key, directory: Directory.Data });
      return Capacitor.convertFileSrc(result.uri);
    }
    const blob = await this.readBrowserBlob(key);
    return blob ? URL.createObjectURL(blob) : '';
  }

  async readBlob(key: string): Promise<Blob | undefined> {
    if (!Capacitor.isNativePlatform()) return this.readBrowserBlob(key);
    const result = await Filesystem.getUri({ path: key, directory: Directory.Data });
    const response = await fetch(Capacitor.convertFileSrc(result.uri));
    return response.ok ? response.blob() : undefined;
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.readAsDataURL(blob);
    });
  }

  private async writeBrowserBlob(key: string, blob: Blob): Promise<void> {
    const db = await this.openBrowserDb();
    await this.requestToPromise(
      db.transaction('images', 'readwrite').objectStore('images').put(blob, key),
    );
  }

  private async readBrowserBlob(key: string): Promise<Blob | undefined> {
    const db = await this.openBrowserDb();
    return this.requestToPromise(
      db.transaction('images', 'readonly').objectStore('images').get(key),
    );
  }

  /** One shared connection; opening a new one per call leaked connections. */
  private openBrowserDb(): Promise<IDBDatabase> {
    this.browserDb ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('snapsort-assets', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    }).catch((error) => {
      this.browserDb = undefined;
      throw error;
    });
    return this.browserDb;
  }

  private requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}
