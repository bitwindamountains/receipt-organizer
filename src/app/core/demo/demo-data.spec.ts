import { DEMO_TAG, demoEntries } from './demo-data';

describe('demoEntries', () => {
  const today = new Date(2026, 10, 20);
  const entries = demoEntries(today);

  it('tags every item and dates them within the last five months, newest first', () => {
    expect(entries.every(({ item }) => item.tags.includes(DEMO_TAG))).toBe(true);
    const dates = entries.map(({ item }) => item.purchaseDate!);
    expect(dates[0]).toBe('2026-11-20');
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(dates.at(-1)! >= '2026-06-20').toBe(true);
  });

  it('stores the same total the receipt image prints', () => {
    const cafe = entries[0];
    expect(cafe.item.amountMinor).toBe(2 * 16500 + 8500);
    expect(cafe.draft.date).toBe(cafe.item.purchaseDate);
  });

  it('marks sales as income and keeps a future warranty', () => {
    const sale = entries.find(({ item }) => item.flow === 'income')!;
    expect(sale.draft.mode).toBe('sold');
    expect(entries.some(({ item }) => item.warrantyUntil === '2026-11-25')).toBe(true);
  });
});
