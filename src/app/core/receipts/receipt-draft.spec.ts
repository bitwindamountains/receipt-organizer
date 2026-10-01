import { ReceiptDraft, nextReceiptNumber, receiptNotes, receiptTotals } from './receipt-draft';

const draft: ReceiptDraft = {
  mode: 'sold',
  issuer: "Rosa's Kakanin",
  issuerDetails: '',
  customer: 'Maria',
  number: '0001',
  date: '2026-10-01',
  currencyCode: 'PHP',
  payment: 'GCash',
  lines: [
    { description: 'Bibingka', quantity: 3, price: 0.1 },
    { description: 'Puto (dozen)', quantity: 2, price: 120 },
    { description: '', quantity: 1, price: 0 },
  ],
  discount: 20,
  notes: 'Thank you!',
  accent: '#26574b',
};

describe('receipt drafts', () => {
  it('totals in exact minor units and caps the discount', () => {
    expect(receiptTotals(draft.lines, draft.discount)).toEqual({ lineTotals: [30, 24000, 0], subtotal: 24030, discount: 2000, total: 22030 });
    expect(receiptTotals([{ description: 'x', quantity: 1, price: 5 }], 50).total).toBe(0);
    expect(receiptTotals([{ description: 'x', quantity: -2, price: Number.NaN }], 0).total).toBe(0);
  });

  it('itemizes the receipt as searchable notes', () => {
    const notes = receiptNotes(draft);
    expect(notes).toContain('3 × Bibingka');
    expect(notes).toContain('2 × Puto (dozen)');
    expect(notes).toContain('Paid via GCash');
    expect(notes).toContain('Thank you!');
    expect(notes.split('\n').filter((line) => line.includes('×'))).toHaveLength(2);
  });

  it('increments receipt numbers and keeps padding and prefixes', () => {
    expect(nextReceiptNumber(null)).toBe('0001');
    expect(nextReceiptNumber('0009')).toBe('0010');
    expect(nextReceiptNumber('INV-099')).toBe('INV-100');
  });
});
