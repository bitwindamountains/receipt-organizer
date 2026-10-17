import { detailsForImage } from './batch-details';

// The form after auto-fill read image 1: Jollibee, ₱320, Oct 1.
const form = {
  type: 'receipt' as const,
  category: 'Food',
  title: null,
  notes: null,
  tags: ['trip'],
  merchant: 'Jollibee',
  amountMinor: 32000,
  currencyCode: 'PHP',
  purchaseDate: '2026-10-01',
  isFavorite: false,
  flow: 'expense' as const,
  warrantyUntil: null,
};
const reading = { type: 'receipt' as const, merchant: 'Mercury Drug', amount: 89.5, currencyCode: 'PHP', purchaseDate: '2026-10-03', category: 'Health' };

describe('detailsForImage', () => {
  it("uses the image's own reading, not the amount read from another image", () => {
    const result = detailsForImage(form, reading, new Set(), 'PHP');
    expect(result).toEqual(expect.objectContaining({ merchant: 'Mercury Drug', amountMinor: 8950, purchaseDate: '2026-10-03', category: 'Food', tags: ['trip'] }));
  });

  it('leaves receipt fields blank when the image could not be read', () => {
    const result = detailsForImage(form, null, new Set(), 'PHP');
    expect(result).toEqual(expect.objectContaining({ merchant: null, amountMinor: null, currencyCode: null, purchaseDate: null }));
  });

  it('applies what the user typed to every image', () => {
    const result = detailsForImage(form, reading, new Set(['merchant', 'amount', 'purchaseDate'] as const), 'PHP');
    expect(result).toEqual(expect.objectContaining({ merchant: 'Jollibee', amountMinor: 32000, currencyCode: 'PHP', purchaseDate: '2026-10-01' }));
  });

  it('leaves screenshots unchanged', () => {
    const screenshot = { ...form, type: 'screenshot' as const, merchant: null, amountMinor: null, currencyCode: null, purchaseDate: null };
    expect(detailsForImage(screenshot, reading, new Set(), 'PHP')).toBe(screenshot);
  });
});
