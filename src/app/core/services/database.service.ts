import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { SavedItem } from '../models/saved-item';

const WEB_STORAGE_KEY = 'snapsort.items.v1';
const DATABASE_NAME = 'snapsort';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private db?: SQLiteDBConnection;
  private initialized?: Promise<void>;

  initialize(): Promise<void> {
    this.initialized ??= this.initializeInternal();
    return this.initialized;
  }

  async list(): Promise<SavedItem[]> {
    await this.initialize();
    if (!this.db) return this.readWebItems();
    const result = await this.db.query('SELECT * FROM items ORDER BY created_at DESC');
    return (result.values ?? []).map((row) => this.fromRow(row));
  }

  async get(id: string): Promise<SavedItem | undefined> {
    await this.initialize();
    if (!this.db) return this.readWebItems().find((item) => item.id === id);
    const result = await this.db.query('SELECT * FROM items WHERE id = ? LIMIT 1', [id]);
    return result.values?.[0] ? this.fromRow(result.values[0]) : undefined;
  }

  async save(item: SavedItem): Promise<void> {
    await this.initialize();
    if (!this.db) {
      const items = this.readWebItems();
      const index = items.findIndex((candidate) => candidate.id === item.id);
      if (index === -1) items.unshift(item);
      else items[index] = item;
      localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(items));
      return;
    }

    await this.db.run(
      `INSERT OR REPLACE INTO items (
        id, type, image_key, mime_type, title, notes, category, tags_json,
        merchant, amount_minor, currency_code, purchase_date, is_favorite, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.type,
        item.imageKey,
        item.mimeType,
        item.title,
        item.notes,
        item.category,
        JSON.stringify(item.tags),
        item.merchant,
        item.amountMinor,
        item.currencyCode,
        item.purchaseDate,
        item.isFavorite ? 1 : 0,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await this.initialize();
    if (!this.db) {
      localStorage.setItem(
        WEB_STORAGE_KEY,
        JSON.stringify(this.readWebItems().filter((item) => item.id !== id)),
      );
      return;
    }
    await this.db.run('DELETE FROM items WHERE id = ?', [id]);
  }

  private async initializeInternal(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const consistency = await sqlite.checkConnectionsConsistency();
    const existing = await sqlite.isConnection(DATABASE_NAME, false);
    this.db = consistency.result && existing.result
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false);
    await this.db.open();
    await this.db.execute(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('screenshot', 'receipt')),
        image_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        title TEXT,
        notes TEXT,
        category TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        merchant TEXT,
        amount_minor INTEGER,
        currency_code TEXT,
        purchase_date TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
      CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (1, datetime('now'));
    `);
    const columns = await this.db.query('PRAGMA table_info(items)');
    if (!(columns.values ?? []).some((column) => column['name'] === 'is_favorite')) {
      await this.db.execute('ALTER TABLE items ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;');
    }
  }

  private readWebItems(): SavedItem[] {
    try {
      const items = JSON.parse(localStorage.getItem(WEB_STORAGE_KEY) ?? '[]') as SavedItem[];
      return items.map((item) => ({ ...item, isFavorite: item.isFavorite ?? false }));
    } catch {
      return [];
    }
  }

  private fromRow(row: Record<string, unknown>): SavedItem {
    return {
      id: String(row['id']),
      type: row['type'] as SavedItem['type'],
      imageKey: String(row['image_key']),
      mimeType: String(row['mime_type']),
      title: (row['title'] as string | null) ?? null,
      notes: (row['notes'] as string | null) ?? null,
      category: String(row['category']),
      tags: JSON.parse(String(row['tags_json'] ?? '[]')) as string[],
      merchant: (row['merchant'] as string | null) ?? null,
      amountMinor: (row['amount_minor'] as number | null) ?? null,
      currencyCode: (row['currency_code'] as string | null) ?? null,
      purchaseDate: (row['purchase_date'] as string | null) ?? null,
      isFavorite: Number(row['is_favorite'] ?? 0) === 1,
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
    };
  }
}
