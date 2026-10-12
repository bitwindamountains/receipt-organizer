import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ToastController } from '@ionic/angular';
import { ItemFlow, SavedItem } from '../models/saved-item';
import { ReceiptSuggestion, parseReceiptText, suggestCategory } from '../ocr/receipt-parser';
import { TextRecognitionService } from '../ocr/text-recognition.service';
import { ReceiptDraft } from '../receipts/receipt-draft';
import { renderReceipt } from '../receipts/receipt-renderer';
import { CategoryStore } from '../services/category.store';
import { ImageStorageService, SelectedImage } from '../services/image-storage.service';
import { ItemStore } from '../services/item.store';
import { PreferencesStore } from '../services/preferences.store';
import { DeviceScreenshot, SnapSortCapture } from './capture-plugin';
import { CapturedNotification, ParsedTransaction, parseTransaction, transactionKey } from './transaction-parser';

const DAY_MS = 86_400_000;
const CAPTURED_KEYS = 'snapsort.capture.keys';
const INBOX_SEEN = 'snapsort.inbox.seen';
const INBOX_SINCE = 'snapsort.inbox.since';
const INBOX_ENTRIES = 'snapsort.inbox.v1';
const MAX_REMEMBERED = 1000;
const SCAN_LIMIT = 20;

/** A payment screenshot found by the inbox, waiting for the user to add or skip it. */
export interface InboxEntry {
  id: string;
  source: 'device' | 'folder';
  /** Gallery content:// URI (Android). */
  uri?: string;
  /** Displayable URL; for folder entries it is recreated each session. */
  previewUrl: string;
  fileName: string;
  takenAt: number;
  mimeType: string;
  suggestion: ReceiptSuggestion;
  flow: ItemFlow;
  /** An existing item with the same amount and date, if any. */
  duplicateOf: string | null;
}

// Minimal File System Access API typings (Chromium); not in TypeScript's DOM lib yet.
interface FolderHandle {
  name: string;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string; getFile?: () => Promise<File> }>;
  getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>;
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
}
type PickerWindow = Window & { showDirectoryPicker?: (options: { id?: string; mode?: 'read' }) => Promise<FolderHandle> };

/**
 * Automatic capture, all on the device:
 * - payment notifications from GCash, Maya, and banks become receipts (Android);
 * - new payment screenshots are found and offered in an inbox (Android gallery,
 *   or a chosen folder in Chromium browsers);
 * - images shared into SnapSort open on the Add page (Android).
 */
@Injectable({ providedIn: 'root' })
export class CaptureService {
  private readonly store = inject(ItemStore);
  private readonly images = inject(ImageStorageService);
  private readonly recognition = inject(TextRecognitionService);
  private readonly categories = inject(CategoryStore);
  private readonly preferences = inject(PreferencesStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastController);

  readonly native = Capacitor.isNativePlatform();
  readonly supportsFolder = typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';

  /** Notification capture: whether Android access is granted and the user turned it on. */
  readonly status = signal({ accessGranted: false, enabled: false });
  /** Payments captured from notifications in this session, newest first. */
  readonly recent = signal<SavedItem[]>([]);
  readonly inbox = signal<InboxEntry[]>(readEntries());
  readonly scanning = signal(false);
  readonly folderName = signal<string | null>(null);
  /** The browser forgot folder access (after a reload); a tap re-grants it. */
  readonly folderNeedsPermission = signal(false);
  readonly pendingShares = signal<SelectedImage[]>([]);

  private started = false;
  private queue: Promise<void> = Promise.resolve();
  private folder?: FolderHandle;

  /** Called once by the app shell. */
  start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.refresh();
    });
    if (this.native) {
      void SnapSortCapture.addListener('notificationCaptured', (notification) => void this.importQueued([notification]));
      void SnapSortCapture.addListener('imagesShared', () => void this.collectShares());
    } else if (this.supportsFolder) {
      void this.restoreFolder();
    }
    void this.store.load().then(() => this.refresh());
  }

  /** Imports anything that arrived while SnapSort was in the background. */
  async refresh(): Promise<void> {
    if (this.native) {
      this.status.set(await SnapSortCapture.getCaptureStatus().catch(() => this.status()));
      const { notifications } = await SnapSortCapture.getCapturedNotifications().catch(() => ({ notifications: [] as CapturedNotification[] }));
      if (notifications.length) void this.importQueued(notifications);
      await this.collectShares();
    }
    if (this.preferences.screenshotInbox()) void this.scanScreenshots();
  }

  // ---------- Payment notifications ----------

  async setCaptureEnabled(enabled: boolean): Promise<void> {
    if (!this.native) return;
    await SnapSortCapture.setCaptureEnabled({ enabled });
    this.status.update((status) => ({ ...status, enabled }));
    if (enabled && !this.status().accessGranted) await SnapSortCapture.openNotificationAccessSettings();
  }

  async openAccessSettings(): Promise<void> {
    if (this.native) await SnapSortCapture.openNotificationAccessSettings();
  }

  /** Runs a sample GCash notification through the real pipeline, so the feature can be tried anywhere. */
  async addSample(): Promise<SavedItem | null> {
    const reference = String(Date.now()).slice(-10);
    const before = this.recent()[0];
    await this.importNotifications([
      { id: `sample-${reference}`, packageName: 'com.globe.gcash.android', title: 'GCash', text: `You have paid PHP 1,250.00 to MERALCO. Ref. No. ${reference}.`, postedAt: Date.now() },
    ]);
    const added = this.recent()[0];
    return added && added !== before ? added : null;
  }

  /** Files notifications from the native queue, then removes only the ones handled, so a failed save is retried. */
  private async importQueued(notifications: CapturedNotification[]): Promise<void> {
    const handled = await this.importNotifications(notifications);
    if (handled.size) await SnapSortCapture.ackCapturedNotifications({ ids: [...handled] }).catch(() => undefined);
  }

  /**
   * Parses, de-duplicates, and files captured notifications, one batch at a time.
   * Resolves with the ids that are done with: saved, duplicates, or not a payment.
   */
  importNotifications(notifications: CapturedNotification[]): Promise<Set<string>> {
    const result = this.queue.then(() => this.importBatch(notifications)).catch(() => new Set<string>());
    this.queue = result.then(() => undefined);
    return result;
  }

  private async importBatch(notifications: CapturedNotification[]): Promise<Set<string>> {
    await this.store.load();
    const seen = readSet(CAPTURED_KEYS);
    const added: SavedItem[] = [];
    const handled = new Set<string>();
    for (const notification of notifications) {
      const transaction = parseTransaction(notification);
      const key = transaction && transactionKey(transaction);
      if (!transaction || !key || seen.has(key) || (transaction.reference && this.store.items().some((item) => item.notes?.includes(transaction.reference!)))) {
        handled.add(notification.id);
        continue;
      }
      try {
        added.push(await this.saveTransaction(transaction, notification));
        seen.add(key);
        handled.add(notification.id);
      } catch {
        // Not handled: it stays in the native queue and is tried again on the next open.
      }
    }
    writeSet(CAPTURED_KEYS, seen);
    if (!added.length) return handled;
    this.recent.update((recent) => [...added, ...recent].slice(0, 6));
    const first = added[0];
    const amount = new Intl.NumberFormat(undefined, { style: 'currency', currency: first.currencyCode ?? 'PHP' }).format((first.amountMinor ?? 0) / 100);
    // The toast is a courtesy; it must not keep saved payments from being acknowledged.
    void this.toasts
      .create({ message: added.length === 1 ? `Captured ${amount}: ${first.title}` : `Captured ${added.length} payments`, duration: 2600, icon: 'flash' })
      .then((toast) => toast.present())
      .catch(() => undefined);
    return handled;
  }

  private async saveTransaction(transaction: ParsedTransaction, notification: CapturedNotification): Promise<SavedItem> {
    const date = localDateKey(new Date(transaction.postedAt));
    // Notifications carry no image, so draw a receipt for the library.
    const draft: ReceiptDraft = {
      mode: 'bought',
      issuer: transaction.provider,
      issuerDetails: `From a ${transaction.provider} notification`,
      customer: '',
      number: '',
      date,
      currencyCode: transaction.currencyCode,
      payment: transaction.provider,
      lines: [{ description: transaction.title, quantity: 1, price: transaction.amount }],
      discount: 0,
      notes: transaction.reference ? `Ref. ${transaction.reference}` : '',
      accent: '#26574b',
    };
    const imageKey = await this.persistBlob(await renderReceipt(draft), 'png');
    const text = [notification.title, notification.text].filter(Boolean).join('\n');
    const category = transaction.flow === 'income'
      ? 'Other'
      : suggestCategory(transaction.counterparty, text, 'receipt', this.store.items(), this.categories.all()) ?? 'Other';
    return this.store.create({
      type: 'receipt',
      imageKey,
      mimeType: 'image/png',
      title: transaction.title,
      // The reference must be in the notes: it is how later duplicates are recognized.
      notes: transaction.reference && !text.includes(transaction.reference) ? `${text}\nRef. ${transaction.reference}` : text,
      category,
      tags: ['auto-captured', transaction.provider.toLowerCase()],
      merchant: transaction.counterparty ?? transaction.provider,
      amountMinor: Math.round(transaction.amount * 100),
      currencyCode: transaction.currencyCode,
      purchaseDate: date,
      isFavorite: false,
      flow: transaction.flow,
      warrantyUntil: null,
    });
  }

  // ---------- Screenshot inbox ----------

  /** Turns the inbox on after getting access (gallery on Android, a folder in the browser). */
  async enableInbox(): Promise<boolean> {
    if (this.native) {
      const { state } = await SnapSortCapture.requestPhotosPermission();
      if (state !== 'granted') return false;
    } else if (!(await this.chooseFolder())) {
      return false;
    }
    // Start with the last few days so recent payments show up right away.
    if (readNumber(INBOX_SINCE) === null) writeNumber(INBOX_SINCE, Date.now() - 3 * DAY_MS);
    this.preferences.setScreenshotInbox(true);
    void this.scanScreenshots();
    return true;
  }

  disableInbox(): void {
    this.preferences.setScreenshotInbox(false);
    for (const entry of this.inbox()) this.images.release(entry.previewUrl);
    this.inbox.set([]);
    persistEntries([]);
  }

  async scanScreenshots(): Promise<void> {
    if (this.scanning()) return;
    this.scanning.set(true);
    try {
      await this.store.load();
      let since = readNumber(INBOX_SINCE) ?? Date.now() - 3 * DAY_MS;
      const seen = readSet(INBOX_SEEN);
      // Candidates come oldest first, a page at a time, so `since` never jumps past a screenshot not yet read.
      // ponytail: more than SCAN_LIMIT screenshots in the same second would skip the extras; page by id if that shows up.
      let candidates: Awaited<ReturnType<CaptureService['deviceCandidates']>>;
      do {
        candidates = this.native ? await this.deviceCandidates(since) : await this.folderCandidates(since);
        for (const candidate of candidates) {
          since = Math.max(since, candidate.takenAt);
          if (seen.has(candidate.id)) {
            if (candidate.source === 'folder') this.images.release(candidate.previewUrl);
            continue;
          }
          seen.add(candidate.id);
          const entry = await this.readCandidate(candidate).catch(() => null);
          if (entry) this.inbox.update((entries) => [entry, ...entries]);
          else if (candidate.source === 'folder') this.images.release(candidate.previewUrl);
        }
        writeNumber(INBOX_SINCE, since);
        writeSet(INBOX_SEEN, seen);
        persistEntries(this.inbox());
      } while (candidates.length === SCAN_LIMIT);
    } finally {
      this.scanning.set(false);
    }
  }

  private async readCandidate(candidate: Omit<InboxEntry, 'suggestion' | 'flow' | 'duplicateOf'>): Promise<InboxEntry | null> {
    const text = await this.recognition.read({ fileUri: candidate.uri, sourceUrl: candidate.previewUrl });
    let suggestion = parseReceiptText(text, { fileName: candidate.fileName, history: this.store.items(), categories: this.categories.all() });
    if (suggestion.type !== 'receipt' || suggestion.amount === null) return null;
    const amountMinor = Math.round(suggestion.amount * 100);
    // "You received ₱500" screenshots are money in, not spending; "Sent to X" names the merchant.
    const asTransaction = parseTransaction({ id: candidate.id, packageName: '', title: '', text, postedAt: candidate.takenAt });
    if (asTransaction?.counterparty) suggestion = { ...suggestion, merchant: asTransaction.counterparty };
    const flow: ItemFlow = asTransaction?.flow ?? 'expense';
    const day = suggestion.purchaseDate ?? localDateKey(new Date(candidate.takenAt));
    const duplicate = this.store.items().find((item) => item.amountMinor === amountMinor && item.purchaseDate === day);
    return { ...candidate, suggestion, flow, duplicateOf: duplicate?.id ?? null };
  }

  async addFromInbox(entry: InboxEntry): Promise<SavedItem> {
    const extension = entry.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    const imageKey = await this.images.persist(crypto.randomUUID(), { sourceUrl: entry.previewUrl, fileUri: entry.uri, mimeType: entry.mimeType, extension, fileName: entry.fileName });
    const suggestion = entry.suggestion;
    const item = await this.store.create({
      type: 'receipt',
      imageKey,
      mimeType: entry.mimeType,
      title: null,
      notes: null,
      category: suggestion.category ?? 'Other',
      tags: ['screenshot inbox'],
      merchant: suggestion.merchant,
      amountMinor: suggestion.amount === null ? null : Math.round(suggestion.amount * 100),
      currencyCode: suggestion.currencyCode ?? this.preferences.lastCurrency(),
      purchaseDate: suggestion.purchaseDate ?? localDateKey(new Date(entry.takenAt)),
      isFavorite: false,
      flow: entry.flow,
      warrantyUntil: null,
    });
    this.removeEntry(entry);
    return item;
  }

  dismiss(entry: InboxEntry): void {
    this.removeEntry(entry);
  }

  private removeEntry(entry: InboxEntry): void {
    if (entry.source === 'folder') this.images.release(entry.previewUrl);
    this.inbox.update((entries) => entries.filter((candidate) => candidate.id !== entry.id));
    persistEntries(this.inbox());
  }

  private async deviceCandidates(since: number): Promise<Omit<InboxEntry, 'suggestion' | 'flow' | 'duplicateOf'>[]> {
    const { state } = await SnapSortCapture.getPhotosPermission();
    if (state !== 'granted') return [];
    const { screenshots } = await SnapSortCapture.getRecentScreenshots({ since, limit: SCAN_LIMIT });
    return screenshots.map((shot: DeviceScreenshot) => ({
      id: shot.uri,
      source: 'device' as const,
      uri: shot.uri,
      previewUrl: Capacitor.convertFileSrc(shot.uri),
      fileName: shot.fileName,
      takenAt: shot.takenAt,
      mimeType: shot.mimeType || 'image/png',
    }));
  }

  // ---------- Browser folder (Chromium) ----------

  async chooseFolder(): Promise<boolean> {
    const picker = (window as PickerWindow).showDirectoryPicker;
    if (!picker) return false;
    const handle = await picker.call(window, { id: 'snapsort-screenshots', mode: 'read' }).catch(() => null);
    if (!handle) return false;
    this.folder = handle;
    await saveFolderHandle(handle).catch(() => undefined);
    this.folderName.set(handle.name);
    this.folderNeedsPermission.set(false);
    await this.restoreFolderPreviews();
    return true;
  }

  /** Browsers drop folder access on reload; this must run from a tap. */
  async reconnectFolder(): Promise<void> {
    if (!this.folder) return;
    const state = await this.folder.requestPermission({ mode: 'read' }).catch(() => 'denied' as PermissionState);
    this.folderNeedsPermission.set(state !== 'granted');
    if (state === 'granted') {
      await this.restoreFolderPreviews();
      void this.scanScreenshots();
    }
  }

  private async restoreFolder(): Promise<void> {
    const handle = await loadFolderHandle().catch(() => null);
    if (!handle) return;
    this.folder = handle;
    this.folderName.set(handle.name);
    const state = await handle.queryPermission({ mode: 'read' }).catch(() => 'prompt' as PermissionState);
    this.folderNeedsPermission.set(state !== 'granted');
    if (state === 'granted') await this.restoreFolderPreviews();
  }

  /** Re-creates previews for folder entries saved in an earlier session. */
  private async restoreFolderPreviews(): Promise<void> {
    const folder = this.folder;
    if (!folder) return;
    const entries = await Promise.all(this.inbox().map(async (entry) => {
      if (entry.source !== 'folder' || entry.previewUrl) return entry;
      const file = await folder.getFileHandle(entry.fileName).then((handle) => handle.getFile()).catch(() => null);
      return file ? { ...entry, previewUrl: URL.createObjectURL(file) } : null;
    }));
    this.inbox.set(entries.filter((entry): entry is InboxEntry => entry !== null));
    persistEntries(this.inbox());
  }

  private async folderCandidates(since: number): Promise<Omit<InboxEntry, 'suggestion' | 'flow' | 'duplicateOf'>[]> {
    if (!this.folder || this.folderNeedsPermission()) return [];
    const files: File[] = [];
    for await (const entry of this.folder.values()) {
      if (entry.kind !== 'file' || !/\.(png|jpe?g|webp)$/i.test(entry.name) || !entry.getFile) continue;
      const file = await entry.getFile();
      if (file.lastModified > since) files.push(file);
    }
    return files
      .sort((a, b) => a.lastModified - b.lastModified)
      .slice(0, SCAN_LIMIT)
      .map((file) => ({
        id: `folder:${file.name}:${file.lastModified}`,
        source: 'folder' as const,
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
        takenAt: file.lastModified,
        mimeType: file.type || 'image/png',
      }));
  }

  // ---------- Shared into SnapSort ----------

  private async collectShares(): Promise<void> {
    if (!this.native) return;
    const { images } = await SnapSortCapture.takeSharedImages().catch(() => ({ images: [] }));
    if (!images.length) return;
    const shared: SelectedImage[] = images.map((image) => {
      const extension = image.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      return { sourceUrl: Capacitor.convertFileSrc(image.fileUri), fileUri: image.fileUri, mimeType: image.mimeType, extension, fileName: image.fileName };
    });
    this.pendingShares.update((pending) => [...pending, ...shared]);
    await this.router.navigateByUrl('/add');
  }

  /** Hands shared images to the Add page, once. */
  takeShares(): SelectedImage[] {
    const shares = this.pendingShares();
    if (shares.length) this.pendingShares.set([]);
    return shares;
  }

  private async persistBlob(blob: Blob, extension: string): Promise<string> {
    const sourceUrl = URL.createObjectURL(blob);
    try {
      return await this.images.persist(crypto.randomUUID(), { sourceUrl, mimeType: blob.type || `image/${extension}`, extension });
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readSet(key: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, values: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...values].slice(-MAX_REMEMBERED)));
  } catch {
    // Worst case a duplicate can be offered again; nothing is lost.
  }
}

function readNumber(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // The next scan starts from the default window instead.
  }
}

function readEntries(): InboxEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(INBOX_ENTRIES) ?? '[]') as InboxEntry[];
    // Folder previews were session-only blob URLs; they are recreated once access is restored.
    return Array.isArray(value) ? value.map((entry) => (entry.source === 'folder' ? { ...entry, previewUrl: '' } : entry)) : [];
  } catch {
    return [];
  }
}

function persistEntries(entries: InboxEntry[]): void {
  try {
    localStorage.setItem(INBOX_ENTRIES, JSON.stringify(entries.map((entry) => (entry.source === 'folder' ? { ...entry, previewUrl: '' } : entry))));
  } catch {
    // The inbox is rebuilt from the next scan.
  }
}

// The chosen folder handle lives in IndexedDB (handles can't go in localStorage).
function handleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('snapsort-handles', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function saveFolderHandle(handle: FolderHandle): Promise<void> {
  const db = await handleDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('handles', 'readwrite');
    transaction.objectStore('handles').put(handle, 'screenshots');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function loadFolderHandle(): Promise<FolderHandle | null> {
  const db = await handleDb();
  const handle = await new Promise<FolderHandle | null>((resolve, reject) => {
    const request = db.transaction('handles').objectStore('handles').get('screenshots');
    request.onsuccess = () => resolve((request.result as FolderHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}
