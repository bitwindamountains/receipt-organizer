import { SavedItem } from '../models/saved-item';
import { displayTitle, formatAmount, groupByMonth, matchesQuery, monthlyReceiptSummary } from './item-display';

const item: SavedItem = {
  id: 'one',
  type: 'receipt',
  imageKey: 'images/one.jpg',
  mimeType: 'image/jpeg',
  title: null,
  notes: 'Two year warranty',
  category: 'Electronics',
  tags: ['laptop', 'work'],
  merchant: 'Lenovo Store',
  amountMinor: 4999500,
  currencyCode: 'PHP',
  purchaseDate: '2026-09-11',
  isFavorite: false,
  flow: 'expense',
  warrantyUntil: null,
  createdAt: '2026-09-11T04:00:00.000Z',
  updatedAt: '2026-09-11T04:00:00.000Z',
};

describe('item display utilities', () => {
  it('uses the merchant when an item has no title', () => {
    expect(displayTitle(item)).toBe('Lenovo Store');
  });

  it('searches category, metadata, and tags without case sensitivity', () => {
    expect(matchesQuery(item, '  TWO   year ')).toBe(true);
    expect(matchesQuery(item, 'ELECTRONICS')).toBe(true);
    expect(matchesQuery(item, 'laptop')).toBe(true);
    expect(matchesQuery(item, 'grocery')).toBe(false);
  });

  it('formats integer minor units as currency', () => {
    expect(formatAmount(item)).toContain('49,995');
  });

  it('matches every query word across different fields', () => {
    expect(matchesQuery(item, 'lenovo laptop')).toBe(true);
    expect(matchesQuery(item, 'laptop lenovo receipt')).toBe(true);
    expect(matchesQuery(item, 'lenovo grocery')).toBe(false);
  });

  it('totals receipts for the current month in the most-used currency', () => {
    const now = new Date(2026, 8, 20);
    const receipts: SavedItem[] = [
      item,
      { ...item, id: 'two', amountMinor: 500, purchaseDate: '2026-09-02' },
      { ...item, id: 'old', amountMinor: 9900, purchaseDate: '2026-08-30' },
      { ...item, id: 'usd', amountMinor: 1000, currencyCode: 'USD' },
      { ...item, id: 'shot', type: 'screenshot' },
      { ...item, id: 'sold', flow: 'income', amountMinor: 999900 },
    ];
    const summary = monthlyReceiptSummary(receipts, now);
    expect(summary?.count).toBe(2);
    expect(summary?.total).toContain('50,000');
    expect(summary?.otherCurrencies).toBe(1);
    expect(monthlyReceiptSummary([], now)).toBeNull();
  });

  it('groups sorted items into months with receipt totals', () => {
    const now = new Date(2026, 9, 15);
    const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();
    const groups = groupByMonth([
      { ...item, id: 'a', createdAt: at(2026, 9, 3), amountMinor: 1000 },
      { ...item, id: 'b', createdAt: at(2026, 9, 1), amountMinor: 2500 },
      { ...item, id: 'c', type: 'screenshot', createdAt: at(2026, 8, 20) },
      { ...item, id: 'd', createdAt: at(2025, 11, 31) },
    ], now);
    expect(groups.map((group) => group.items.map((entry) => entry.id))).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(groups[0].receipts?.count).toBe(2);
    expect(groups[0].receipts?.total).toContain('35');
    expect(groups[1].receipts).toBeNull();
    expect(groups[2].label).toContain('2025');
    expect(groups[0].label).not.toContain('2026');
  });
});
