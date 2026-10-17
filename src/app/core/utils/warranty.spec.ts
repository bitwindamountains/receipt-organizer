import { SavedItem } from '../models/saved-item';
import { daysLeftLabel, endingSoon, reminderId, remindersFor, warrantyStatus } from './warranty';

const item = (fields: Partial<SavedItem>): SavedItem => ({
  id: 'laptop', type: 'receipt', imageKey: 'images/x.jpg', mimeType: 'image/jpeg', title: 'Laptop', notes: null, category: 'Electronics',
  tags: [], merchant: 'Lazada', amountMinor: 1, currencyCode: 'PHP', purchaseDate: '2026-01-01', isFavorite: false, flow: 'expense',
  warrantyUntil: '2026-12-31', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...fields,
});

const today = new Date(2026, 9, 1, 15, 30);

describe('warranty', () => {
  it('counts whole days left and the share of coverage remaining', () => {
    const status = warrantyStatus(item({}), today)!;
    expect(status.daysLeft).toBe(91);
    expect(status.state).toBe('active');
    expect(status.remaining).toBeCloseTo(91 / 364, 2);
    expect(warrantyStatus(item({ warrantyUntil: '2026-10-01' }), today)?.daysLeft).toBe(0);
    expect(warrantyStatus(item({ warrantyUntil: '2026-09-28' }), today)?.state).toBe('ended');
    expect(warrantyStatus(item({ warrantyUntil: null }), today)).toBeNull();
  });

  it('lists coverage ending within 30 days, soonest first', () => {
    const items = [item({ id: 'a', warrantyUntil: '2026-10-20' }), item({ id: 'b', warrantyUntil: '2026-10-02' }), item({ id: 'c' }), item({ id: 'd', warrantyUntil: '2026-09-01' })];
    expect(endingSoon(items, today).map((entry) => [entry.item.id, entry.daysLeft])).toEqual([['b', 1], ['a', 19]]);
  });

  it('schedules future reminders a week before and on the day at 9:00', () => {
    const reminders = remindersFor(item({ warrantyUntil: '2026-10-05' }), today);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].at).toEqual(new Date(2026, 9, 5, 9));
    expect(reminders[0].body).toContain('Laptop');
    expect(remindersFor(item({}), today).map((reminder) => reminder.at)).toEqual([new Date(2026, 11, 24, 9), new Date(2026, 11, 31, 9)]);
  });

  it('uses stable, distinct, positive reminder ids', () => {
    expect(reminderId('laptop', 'due')).toBe(reminderId('laptop', 'due'));
    expect(reminderId('laptop', 'due')).not.toBe(reminderId('laptop', 'before'));
    expect(reminderId('x', 'before')).toBeGreaterThan(0);
  });

  it('labels days left in plain words', () => {
    expect(daysLeftLabel(0)).toBe('Ends today');
    expect(daysLeftLabel(1)).toBe('Ends tomorrow');
    expect(daysLeftLabel(12)).toBe('12 days left');
    expect(daysLeftLabel(-3)).toBe('Ended 3 days ago');
  });
});
