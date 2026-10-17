import { SavedItem } from '../models/saved-item';

export interface CategorySpend {
  name: string;
  amount: number;
  /** Share of the month's spending, 0-1. */
  share: number;
}

export interface MerchantSpend {
  name: string;
  amount: number;
  count: number;
}

export interface MonthPoint {
  key: string;
  label: string;
  amount: number;
}

/** Spending figures for one month, in minor units of a single currency. */
export interface MonthInsights {
  monthKey: string;
  currency: string;
  spent: number;
  receiptCount: number;
  average: number;
  biggest: { title: string; amount: number; id: string } | null;
  previousSpent: number;
  /** Change vs the previous month as a fraction (0.12 = +12%); null when there's nothing to compare. */
  change: number | null;
  categories: CategorySpend[];
  merchants: MerchantSpend[];
  /** The six months ending with this one, oldest first. */
  trend: MonthPoint[];
  income: { amount: number; count: number };
  /** Receipts this month in other currencies, left out of the totals. */
  otherCurrencyCount: number;
}

/** Local YYYY-MM-DD a receipt counts toward: its purchase date, else when it was saved. */
export function receiptDay(item: SavedItem): string {
  if (item.purchaseDate) return item.purchaseDate;
  const saved = new Date(item.createdAt);
  return `${saved.getFullYear()}-${String(saved.getMonth() + 1).padStart(2, '0')}-${String(saved.getDate()).padStart(2, '0')}`;
}

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  return monthKeyOf(new Date(year, month - 1 + delta, 1));
}

export function monthLabel(monthKey: string, style: 'long' | 'short' = 'long', withYear = false): string {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, withYear ? { month: style, year: 'numeric' } : { month: style }).format(new Date(year, month - 1, 1));
}

const isMoneyReceipt = (item: SavedItem) => item.type === 'receipt' && item.amountMinor !== null && Boolean(item.currencyCode);

/** The currency most spending receipts use; insights are shown in it. */
export function primaryCurrency(items: SavedItem[]): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (isMoneyReceipt(item) && item.flow !== 'income') counts.set(item.currencyCode!, (counts.get(item.currencyCode!) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Months from the earliest receipt through `latest`, newest first. */
export function availableMonths(items: SavedItem[], latest: string): string[] {
  const keys = items.filter(isMoneyReceipt).map((item) => receiptDay(item).slice(0, 7)).filter((key) => key <= latest);
  const earliest = keys.reduce((min, key) => (key < min ? key : min), latest);
  const months: string[] = [];
  for (let key = latest; key >= earliest; key = shiftMonth(key, -1)) months.push(key);
  return months;
}

export function buildInsights(items: SavedItem[], monthKey: string, currency: string, trendLength = 6): MonthInsights {
  const spending = items.filter((item) => isMoneyReceipt(item) && item.flow !== 'income');
  const inMonth = (item: SavedItem, key: string) => receiptDay(item).startsWith(key);
  const inCurrency = (item: SavedItem) => item.currencyCode === currency;

  const month = spending.filter((item) => inMonth(item, monthKey));
  const counted = month.filter(inCurrency);
  const spent = sum(counted);
  const previousKey = shiftMonth(monthKey, -1);
  const previousSpent = sum(spending.filter((item) => inMonth(item, previousKey) && inCurrency(item)));

  const byCategory = new Map<string, number>();
  const byMerchant = new Map<string, MerchantSpend>();
  for (const item of counted) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.amountMinor!);
    const name = item.merchant?.trim();
    if (name) {
      const key = name.toLocaleLowerCase();
      const entry = byMerchant.get(key) ?? { name, amount: 0, count: 0 };
      entry.amount += item.amountMinor!;
      entry.count += 1;
      byMerchant.set(key, entry);
    }
  }
  const biggestItem = counted.reduce<SavedItem | null>((best, item) => (!best || item.amountMinor! > best.amountMinor! ? item : best), null);

  const trend: MonthPoint[] = [];
  for (let offset = trendLength - 1; offset >= 0; offset--) {
    const key = shiftMonth(monthKey, -offset);
    trend.push({ key, label: monthLabel(key, 'short'), amount: sum(spending.filter((item) => inMonth(item, key) && inCurrency(item))) });
  }

  const income = items.filter((item) => isMoneyReceipt(item) && item.flow === 'income' && inMonth(item, monthKey) && inCurrency(item));

  return {
    monthKey,
    currency,
    spent,
    receiptCount: counted.length,
    average: counted.length ? Math.round(spent / counted.length) : 0,
    biggest: biggestItem ? { title: biggestItem.title || biggestItem.merchant || biggestItem.category, amount: biggestItem.amountMinor!, id: biggestItem.id } : null,
    previousSpent,
    change: previousSpent > 0 ? (spent - previousSpent) / previousSpent : null,
    categories: [...byCategory]
      .map(([name, amount]) => ({ name, amount, share: spent ? amount / spent : 0 }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)),
    merchants: [...byMerchant.values()].sort((a, b) => b.amount - a.amount || b.count - a.count).slice(0, 5),
    trend,
    income: { amount: sum(income), count: income.length },
    otherCurrencyCount: month.length - counted.length,
  };
}

function sum(items: SavedItem[]): number {
  return items.reduce((total, item) => total + (item.amountMinor ?? 0), 0);
}
