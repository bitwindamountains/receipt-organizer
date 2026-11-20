import { SavedItem } from '../models/saved-item';
import { availableMonths, buildInsights, openingMonth, primaryCurrency, shiftMonth } from './insights';

let counter = 0;
const receipt = (fields: Partial<SavedItem>): SavedItem => ({
  id: `r${++counter}`, type: 'receipt', imageKey: 'images/x.jpg', mimeType: 'image/jpeg', title: null, notes: null,
  category: 'Food', tags: [], merchant: null, amountMinor: 1000, currencyCode: 'PHP', purchaseDate: '2026-10-05',
  isFavorite: false, flow: 'expense', warrantyUntil: null, createdAt: '2026-10-05T04:00:00.000Z', updatedAt: '2026-10-05T04:00:00.000Z',
  ...fields,
});

const items: SavedItem[] = [
  receipt({ merchant: 'Jollibee', amountMinor: 48500, category: 'Food' }),
  receipt({ merchant: 'jollibee', amountMinor: 20000, category: 'Food' }),
  receipt({ merchant: 'Grab', amountMinor: 31500, category: 'Transport', title: 'Airport ride' }),
  receipt({ amountMinor: 5000, currencyCode: 'USD' }),
  receipt({ amountMinor: 80000, flow: 'income', category: 'Sales' }),
  receipt({ amountMinor: 50000, purchaseDate: '2026-09-20' }),
  receipt({ amountMinor: 70000, purchaseDate: '2026-05-02' }),
  receipt({ type: 'screenshot', amountMinor: null, currencyCode: null }),
];

describe('insights', () => {
  it('opens on this month when it has spending, else the newest month that does', () => {
    expect(openingMonth(items, '2026-10')).toBe('2026-10');
    // November is empty, so the October receipts must not be hidden behind it.
    expect(openingMonth(items, '2026-11')).toBe('2026-10');
    // Only a May receipt: open on May. Future-dated receipts don't count.
    const mayOnly = [receipt({ purchaseDate: '2026-05-09' }), receipt({ purchaseDate: '2027-01-01' })];
    expect(openingMonth(mayOnly, '2026-11')).toBe('2026-05');
    expect(openingMonth([], '2026-11')).toBe('2026-11');
  });

  it('shows transfers on their own instead of counting them as spending', () => {
    const withTransfer = [...items, receipt({ category: 'Transfers', amountMinor: 15000, merchant: 'Jl...Y B.' })];
    const result = buildInsights(withTransfer, '2026-10', 'PHP');
    expect(result.spent).toBe(100000);
    expect(result.transfers).toEqual({ amount: 15000, count: 1 });
    expect(result.categories.map((c) => c.name)).not.toContain('Transfers');
  });

  it('still shows money in when there is no spending at all', () => {
    const receivedOnly = [receipt({ purchaseDate: '2026-05-09', flow: 'income', amountMinor: 15000 })];
    expect(primaryCurrency(receivedOnly)).toBe('PHP');
    expect(openingMonth(receivedOnly, '2026-11')).toBe('2026-05');
    expect(buildInsights(receivedOnly, '2026-05', 'PHP')).toEqual(expect.objectContaining({ spent: 0, income: { amount: 15000, count: 1 } }));
  });

  it('summarizes one month of spending in a single currency', () => {
    const result = buildInsights(items, '2026-10', 'PHP');
    expect(result.spent).toBe(100000);
    expect(result.receiptCount).toBe(3);
    expect(result.average).toBe(33333);
    expect(result.biggest).toEqual(expect.objectContaining({ title: 'Jollibee', amount: 48500 }));
    expect(result.previousSpent).toBe(50000);
    expect(result.change).toBeCloseTo(1);
    expect(result.otherCurrencyCount).toBe(1);
    expect(result.income).toEqual({ amount: 80000, count: 1 });
    // All PHP spending in any month (Oct 100,000 + Sep 50,000 + May 70,000); no USD, no money in.
    expect(result.allTime).toEqual({ amount: 220000, count: 5 });
  });

  it('ranks categories with shares and merges merchants case-insensitively', () => {
    const result = buildInsights(items, '2026-10', 'PHP');
    expect(result.categories.map((c) => [c.name, c.amount])).toEqual([['Food', 68500], ['Transport', 31500]]);
    expect(result.categories[0].share).toBeCloseTo(0.685);
    expect(result.merchants[0]).toEqual({ name: 'Jollibee', amount: 68500, count: 2 });
  });

  it('builds a six-month trend ending at the selected month', () => {
    const trend = buildInsights(items, '2026-10', 'PHP').trend;
    expect(trend.map((point) => point.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(trend.map((point) => point.amount)).toEqual([70000, 0, 0, 0, 50000, 100000]);
  });

  it('has no change figure without a previous month', () => {
    expect(buildInsights(items, '2026-05', 'PHP').change).toBeNull();
  });

  it('finds the main currency and the months that have receipts', () => {
    expect(primaryCurrency(items)).toBe('PHP');
    expect(availableMonths(items, '2026-10')).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
