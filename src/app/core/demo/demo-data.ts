import { NewSavedItem } from '../models/saved-item';
import { ReceiptDraft, ReceiptLine, receiptNotes, receiptTotals } from '../receipts/receipt-draft';
import { localDateKey } from '../utils/item-display';

/** Tag on every demo item; "Remove demo receipts" deletes exactly the items carrying it. Specific so a user's own "demo" tag is never caught. */
export const DEMO_TAG = 'demo receipt';

interface DemoSeed {
  daysAgo: number;
  merchant: string;
  category: string;
  lines: [string, number, number][];
  payment: string;
  sold?: boolean;
  favorite?: boolean;
  /** Days from today the warranty runs out. */
  warrantyDays?: number;
}

// Made-up merchants: demo screens end up in store screenshots, so no real brands.
// Spread over five months so Home, Library months and the Insights chart all have something to show.
const SEEDS: DemoSeed[] = [
  { daysAgo: 0, merchant: 'Corner Cafe', category: 'Food', lines: [['Iced latte', 2, 165], ['Ensaymada', 1, 85]], payment: 'GCash', favorite: true },
  { daysAgo: 2, merchant: 'Luzon Power Co.', category: 'Bills', lines: [['Electricity bill', 1, 2845.5]], payment: 'Maya' },
  { daysAgo: 4, merchant: 'RideNow', category: 'Transport', lines: [['Ride to Makati', 1, 312]], payment: 'GCash' },
  { daysAgo: 6, merchant: 'Lola Nena Bakeshop', category: 'Sales', lines: [['Ube cheese pandesal (dozen)', 3, 180], ['Delivery', 1, 60]], payment: 'Cash', sold: true },
  { daysAgo: 9, merchant: 'Masagana Supermarket', category: 'Shopping', lines: [['Groceries', 1, 1987.25]], payment: 'Card' },
  { daysAgo: 21, merchant: 'Gadget Hub', category: 'Electronics', lines: [['Wireless earbuds', 1, 2499]], payment: 'Card', favorite: true, warrantyDays: 5 },
  { daysAgo: 35, merchant: 'Bida Chicken House', category: 'Food', lines: [['Fried chicken bucket', 1, 599], ['Mango pie', 3, 45]], payment: 'Cash' },
  { daysAgo: 40, merchant: 'Bayan Fiber', category: 'Bills', lines: [['Fiber internet', 1, 1699]], payment: 'GCash' },
  { daysAgo: 58, merchant: 'Isla Air', category: 'Travel', lines: [['MNL–CEB round trip', 1, 4210]], payment: 'Card' },
  { daysAgo: 70, merchant: 'Botika Plus', category: 'Shopping', lines: [['Vitamins', 1, 640], ['Paracetamol', 2, 38]], payment: 'Cash' },
  { daysAgo: 96, merchant: 'Tech Corner', category: 'Electronics', lines: [['USB-C charger', 1, 1890]], payment: 'Card', warrantyDays: 270 },
  { daysAgo: 125, merchant: 'Pahina Bookstore', category: 'School', lines: [['Notebooks', 4, 55], ['Ballpens', 6, 15]], payment: 'Cash' },
];

export interface DemoEntry {
  draft: ReceiptDraft;
  item: Omit<NewSavedItem, 'imageKey'>;
}

/** Sample receipts dated relative to `today`, each with the draft its image is rendered from. */
export function demoEntries(today = new Date()): DemoEntry[] {
  const dayKey = (offset: number) => localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  return SEEDS.map((seed, index) => {
    const lines: ReceiptLine[] = seed.lines.map(([description, quantity, price]) => ({ description, quantity, price }));
    const draft: ReceiptDraft = {
      mode: seed.sold ? 'sold' : 'bought',
      issuer: seed.merchant,
      issuerDetails: 'Demo receipt',
      customer: seed.sold ? 'Ana Reyes' : '',
      number: String(index + 1).padStart(4, '0'),
      date: dayKey(-seed.daysAgo),
      currencyCode: 'PHP',
      payment: seed.payment,
      lines,
      discount: 0,
      notes: '',
      accent: '#26574b',
    };
    return {
      draft,
      item: {
        type: 'receipt',
        mimeType: 'image/png',
        title: seed.sold ? 'Sale to Ana Reyes' : null,
        notes: receiptNotes(draft),
        category: seed.category,
        tags: [DEMO_TAG],
        merchant: seed.merchant,
        amountMinor: receiptTotals(lines, 0).total,
        currencyCode: 'PHP',
        purchaseDate: draft.date,
        isFavorite: seed.favorite ?? false,
        flow: seed.sold ? 'income' : 'expense',
        warrantyUntil: seed.warrantyDays === undefined ? null : dayKey(seed.warrantyDays),
      },
    };
  });
}
