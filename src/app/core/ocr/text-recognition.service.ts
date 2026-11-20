import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import type { Worker } from 'tesseract.js';

const IDLE_SHUTDOWN_MS = 60_000;

/**
 * Reads text from an image entirely on the device: ML Kit on Android, and a
 * bundled Tesseract (served from /ocr, see the `web` and `development` build
 * configurations) in the browser. Both engines are loaded on first use.
 */
@Injectable({ providedIn: 'root' })
export class TextRecognitionService {
  private webWorker?: Promise<Worker>;
  private idleTimer?: ReturnType<typeof setTimeout>;

  /** Whether reading can run here; false only for a native image without a file. */
  canRead(image: { fileUri?: string; sourceUrl: string }): boolean {
    return Capacitor.isNativePlatform() ? Boolean(image.fileUri) : Boolean(image.sourceUrl);
  }

  async read(image: { fileUri?: string; sourceUrl: string }): Promise<string> {
    if (Capacitor.isNativePlatform()) {
      if (!image.fileUri) throw new Error('No file to read.');
      const { TextRecognition } = await import('@capacitor-mlkit/text-recognition');
      return (await TextRecognition.processImage({ path: image.fileUri })).text;
    }
    const worker = await this.worker();
    try {
      return (await worker.recognize(await grayscale(image.sourceUrl))).data.text;
    } finally {
      this.scheduleShutdown();
    }
  }

  private worker(): Promise<Worker> {
    clearTimeout(this.idleTimer);
    this.webWorker ??= (async () => {
      const tesseract = await import('tesseract.js');
      // tesseract.js is CommonJS: the production build exposes it only as `default` (the dev server hides this).
      const { createWorker, OEM } = tesseract.default ?? tesseract;
      // The worker runs from a blob URL, so asset paths must be absolute.
      const base = new URL('ocr/', document.baseURI).href;
      return createWorker('eng', OEM.LSTM_ONLY, { workerPath: `${base}worker.min.js`, corePath: base, langPath: base.replace(/\/$/, '') });
    })().catch((error) => {
      this.webWorker = undefined;
      throw error;
    });
    return this.webWorker;
  }

  /** The browser worker holds ~100 MB; release it when OCR hasn't been used for a while. */
  private scheduleShutdown(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      const worker = this.webWorker;
      this.webWorker = undefined;
      void worker?.then((instance) => instance.terminate()).catch(() => undefined);
    }, IDLE_SHUTDOWN_MS);
  }
}

/** Tesseract misses pale text on coloured screens (GCash's labels, "Sent via GCash"); reading a grayscale copy recovers it. */
async function grayscale(url: string): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
  const context = canvas.getContext('2d')!;
  context.filter = 'grayscale(1)';
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}
