import { SavedItem } from '../models/saved-item';
import { findDate, findMerchant, findTotal, parseReceiptText, suggestCategory } from './receipt-parser';

const today = new Date(2026, 9, 1);

const fastFood = `JOLLIBEE
Jollibee Foods Corporation
SM City North EDSA, Quezon City
VAT REG TIN 000-388-474-00012
OFFICIAL RECEIPT
Date: 09/28/2026 Time: 12:41 PM
1 Chickenjoy 1pc w/ Rice 99.00
2 Jolly Spaghetti 140.00
1 Peach Mango Pie 46.00
1 Burger Steak 2pc 200.00
SUBTOTAL 485.00
VATable Sales 433.04
VAT 12% 51.96
TOTAL AMOUNT DUE (VAT INCLUSIVE) P485.00
CASH 500.00
CHANGE 15.00
THANK YOU FOR DINING WITH US!`;

const gcash = `Express Send
Sent via GCash
Amount
1,250.00
Total Amount Sent
₱1,250.00
Ref No. 9012 345 678901
Oct 1, 2026 9:14 AM`;

const chat = `Messenger
Aling Rosa
Active now
Hi! Is the apartment still available?
Yes po, ₱8,000 per month
Can I visit on Saturday?
Seen`;

const history = (merchant: string, category: string): SavedItem => ({
  id: merchant, type: 'receipt', imageKey: 'images/x.jpg', mimeType: 'image/jpeg', title: null, notes: null, category, tags: [],
  merchant, amountMinor: 100, currencyCode: 'PHP', purchaseDate: null, isFavorite: false, flow: 'expense', warrantyUntil: null,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
});

describe('receipt parser', () => {
  it('reads a Philippine fast-food receipt', () => {
    expect(parseReceiptText(fastFood, { today })).toEqual({
      type: 'receipt',
      merchant: 'Jollibee',
      amount: 485,
      currencyCode: 'PHP',
      purchaseDate: '2026-09-28',
      category: 'Food',
    });
  });

  it('reads an e-wallet transfer screenshot as a receipt', () => {
    const result = parseReceiptText(gcash, { today, fileName: 'Screenshot_20261001.png' });
    expect(result.type).toBe('receipt');
    expect(result.amount).toBe(1250);
    expect(result.currencyCode).toBe('PHP');
    expect(result.purchaseDate).toBe('2026-10-01');
  });

  it('treats a chat as a screenshot and suggests Conversations', () => {
    const result = parseReceiptText(chat, { today, fileName: 'Screenshot_1.png' });
    expect(result.type).toBe('screenshot');
    expect(result.amount).toBeNull();
    expect(result.category).toBe('Conversations');
  });

  it('prefers the labelled total over subtotal and change', () => {
    expect(findTotal(['Subtotal 90.00', 'Total 100.00', 'Change 0.00'])).toBe(100);
    expect(findTotal(['GRAND TOTAL', '1,234.50'])).toBe(1234.5);
    expect(findTotal(['Item A 12.00', 'Item B 30.50'])).toBe(30.5);
  });

  it('skips address and header lines when finding the merchant', () => {
    expect(findMerchant(['OFFICIAL RECEIPT', '123 Rizal St.', 'SM SUPERMARKET', 'Item 10.00'])).toBe('SM Supermarket');
  });

  it('parses common date formats and rejects future dates', () => {
    expect(findDate('Date 2026-09-03', today)).toBe('2026-09-03');
    expect(findDate('25/09/2026', today)).toBe('2026-09-25');
    expect(findDate('03 Sep 2026', today)).toBe('2026-09-03');
    expect(findDate('12/31/2030', today)).toBeNull();
  });

  it('learns categories from past items before using keywords', () => {
    expect(suggestCategory('Corner Shop', '', 'receipt', [history('Corner Shop', 'Work')], ['Work', 'Food'])).toBe('Work');
    expect(suggestCategory('Grab', 'trip fare', 'receipt', [])).toBe('Transport');
    expect(suggestCategory('Unknown Place', 'nothing useful', 'receipt', [])).toBeNull();
  });
});
