import { Injectable } from '@angular/core';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface SelectedImage {
  sourceUrl: string;
  mimeType: string;
  extension: string;
}

@Injectable({ providedIn: 'root' })
export class ImageStorageService {
  async selectImages(): Promise<SelectedImage[]> {
    const result = await Camera.pickImages({ limit: 10, quality: 95 });
    return result.photos.map((photo) => {
      const extension = (photo.format || 'jpeg').toLowerCase().replace('jpg', 'jpeg');
      return {
        sourceUrl: photo.webPath,
        mimeType: `image/${extension}`,
        extension: extension === 'jpeg' ? 'jpg' : extension,
      };
    });
  }

  async persist(id: string, selected: SelectedImage): Promise<string> {
    const response = await fetch(selected.sourceUrl);
    const blob = await response.blob();
    const key = `images/${id}.${selected.extension}`;
    if (Capacitor.isNativePlatform()) {
      await Filesystem.mkdir({ path: 'images', directory: Directory.Data, recursive: true });
      await Filesystem.writeFile({
        path: key,
        directory: Directory.Data,
        data: await this.blobToBase64(blob),
        recursive: true,
      });
      return key;
    }
    await this.writeBrowserBlob(key, blob);
    return key;
  }

  async urlFor(key: string): Promise<string> {
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.getUri({ path: key, directory: Directory.Data });
      return Capacitor.convertFileSrc(result.uri);
    }
    const blob = await this.readBrowserBlob(key);
    return blob ? URL.createObjectURL(blob) : '';
  }

  /** Frees a URL returned by `urlFor` or `selectImages` once it is no longer displayed. */
  release(url: string | null | undefined): void {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  async remove(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.deleteFile({ path: key, directory: Directory.Data }).catch(() => undefined);
      return;
    }
    const db = await this.openBrowserDb();
    await this.requestToPromise(db.transaction('images', 'readwrite').objectStore('images').delete(key));
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

  private openBrowserDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('snapsort-assets', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  private requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}
