import { SavedItem } from '../models/saved-item';

export function displayTitle(item: SavedItem): string {
  return (
    item.title?.trim() ||
    item.merchant?.trim() ||
    `${item.type === 'receipt' ? 'Receipt' : 'Screenshot'} · ${new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(new Date(item.createdAt))}`
  );
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
  const haystack = [item.title, item.notes, item.merchant, item.category, item.type, ...item.tags]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
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
    if (item.type !== 'receipt' || item.flow === 'income' || item.amountMinor === null || !item.currencyCode) continue;
    const total = totals.get(item.currencyCode) ?? { minor: 0, count: 0 };
    total.minor += item.amountMinor;
    total.count += 1;
    totals.set(item.currencyCode, total);
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
  const thisMonth = items.filter((item) => (item.purchaseDate ?? localDateKey(new Date(item.createdAt))).startsWith(monthKey));
  const total = receiptTotal(thisMonth);
  return total && { ...total, month: new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now) };
}

export interface MonthGroup {
  key: string;
  label: string;
  items: SavedItem[];
  receipts: ReceiptTotal | null;
}

/** Splits already-sorted items into runs by the local month they were saved in. */
export function groupByMonth(items: SavedItem[], now = new Date()): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const item of items) {
    const saved = new Date(item.createdAt);
    const key = localDateKey(saved).slice(0, 7);
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

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
