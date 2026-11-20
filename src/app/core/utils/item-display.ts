import { SavedItem } from '../models/saved-item';

export function displayTitle(item: SavedItem): string {
  return (
    item.title?.trim() ||
    item.merchant?.trim() ||
    `${item.type === 'receipt' ? 'Receipt' : 'Screenshot'} · ${new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(itemDate(item))}`
  );
}

/** The date an item is about: its purchase date, or the day it was saved when it has none. As `YYYY-MM-DD`. */
export function itemDateKey(item: SavedItem): string {
  return item.purchaseDate ?? localDateKey(new Date(item.createdAt));
}

/** `itemDateKey` as a local-midnight Date, for formatting. */
export function itemDate(item: SavedItem): Date {
  const [year, month, day] = itemDateKey(item).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatAmount(item: SavedItem): string | null {
  if (item.amountMinor === null || !item.currencyCode) return null;
  return formatMinor(item.amountMinor, item.currencyCode);
}

function formatMinor(amountMinor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMinor / 100);
}

/** Every word in the query must appear in some searchable field, in any order. */
export function matchesQuery(item: SavedItem, rawQuery: string): boolean {
  const terms = rawQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const amount = item.amountMinor === null ? null : item.amountMinor / 100;
  // Amounts match as typed: "1300", "1300.00" or "1,300.00".
  const amounts = amount === null ? [] : [String(amount), amount.toFixed(2), amount.toLocaleString('en-US', { minimumFractionDigits: 2 })];
  const haystack = [item.title, item.notes, item.merchant, item.category, item.type, ...item.tags, ...amounts]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/**
 * A saved receipt with the same amount on the same date: most likely this purchase saved
 * before. Used to warn on Add and to flag inbox screenshots. `excludeId` skips the item being edited.
 */
export function findDuplicate(items: SavedItem[], amountMinor: number | null, purchaseDate: string | null, excludeId?: string): SavedItem | null {
  if (amountMinor === null || !purchaseDate) return null;
  return items.find((item) => item.id !== excludeId && item.amountMinor === amountMinor && item.purchaseDate === purchaseDate) ?? null;
}

/** Merchants saved before, most used first, matching what's typed (all of them when nothing is typed yet). */
export function merchantSuggestions(items: SavedItem[], typed: string, limit = 4): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    const name = item.merchant?.trim();
    if (!name) continue;
    const entry = counts.get(name.toLocaleLowerCase()) ?? { name, count: 0 };
    entry.count += 1;
    counts.set(name.toLocaleLowerCase(), entry);
  }
  const query = typed.trim().toLocaleLowerCase();
  return [...counts.entries()]
    .filter(([key]) => key !== query && (!query || key.includes(query)))
    .sort(([, a], [, b]) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(([, entry]) => entry.name);
}

/** Money sent to people or other accounts: neither spending nor income. */
export const TRANSFERS = 'Transfers';

/** A receipt that adds to spending totals: has an amount, isn't money in, and isn't a transfer. */
export function countsAsSpending(item: SavedItem): boolean {
  return item.type === 'receipt' && item.flow !== 'income' && item.category !== TRANSFERS && item.amountMinor !== null && Boolean(item.currencyCode);
}

/** A receipt that still needs an amount or a date before it can count anywhere. */
export function needsDetails(item: SavedItem): boolean {
  return item.type === 'receipt' && (item.amountMinor === null || !item.purchaseDate);
}

/** Money received among these items, in their most-used currency, e.g. "+₱600.00"; null when none. */
export function receivedTotal(items: SavedItem[]): string | null {
  const income = items.filter((item) => item.type === 'receipt' && item.flow === 'income' && item.amountMinor !== null && item.currencyCode);
  if (!income.length) return null;
  const currency = income[0].currencyCode!;
  const minor = income.filter((item) => item.currencyCode === currency).reduce((total, item) => total + item.amountMinor!, 0);
  return `+${formatMinor(minor, currency)}`;
}

export interface ReceiptTotal {
  total: string;
  count: number;
  otherCurrencies: number;
}

export interface MonthlyReceiptSummary extends ReceiptTotal {
  month: string;
}

/**
 * Totals spending receipts (not receipts issued to customers) in their most-used
 * currency; null when there are none.
 */
export function receiptTotal(items: SavedItem[]): ReceiptTotal | null {
  const totals = new Map<string, { minor: number; count: number }>();
  for (const item of items) {
    if (!countsAsSpending(item)) continue;
    const total = totals.get(item.currencyCode!) ?? { minor: 0, count: 0 };
    total.minor += item.amountMinor!;
    total.count += 1;
    totals.set(item.currencyCode!, total);
  }
  const [top] = [...totals].sort(([, a], [, b]) => b.count - a.count || b.minor - a.minor);
  if (!top) return null;
  const [currency, total] = top;
  return { total: formatMinor(total.minor, currency), count: total.count, otherCurrencies: totals.size - 1 };
}

/**
 * Totals this month's receipts in the most-used currency. Receipts are dated by
 * purchase date when present, otherwise by when they were saved.
 */
export function monthlyReceiptSummary(items: SavedItem[], now = new Date()): MonthlyReceiptSummary | null {
  const monthKey = localDateKey(now).slice(0, 7);
  const thisMonth = items.filter((item) => itemDateKey(item).startsWith(monthKey));
  const total = receiptTotal(thisMonth);
  return total && { ...total, month: new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now) };
}

export interface MonthGroup {
  key: string;
  label: string;
  items: SavedItem[];
  receipts: ReceiptTotal | null;
}

/** Splits already-sorted items into runs by month of their item date (purchase date, else saved date). */
export function groupByMonth(items: SavedItem[], now = new Date()): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const item of items) {
    const saved = itemDate(item);
    const key = itemDateKey(item).slice(0, 7);
    let group = groups.at(-1);
    if (group?.key !== key) {
      const sameYear = saved.getFullYear() === now.getFullYear();
      const label = new Intl.DateTimeFormat(undefined, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' }).format(saved);
      group = { key, label, items: [], receipts: null };
      groups.push(group);
    }
    group.items.push(item);
  }
  for (const group of groups) group.receipts = receiptTotal(group.items);
  return groups;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
