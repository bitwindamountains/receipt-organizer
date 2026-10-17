export type ItemType = 'screenshot' | 'receipt';
/** `expense`: something you paid for. `income`: a receipt you issued to a customer. */
export type ItemFlow = 'expense' | 'income';

export interface SavedItem {
  id: string;
  type: ItemType;
  imageKey: string;
  mimeType: string;
  title: string | null;
  notes: string | null;
  category: string;
  tags: string[];
  merchant: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  purchaseDate: string | null;
  isFavorite: boolean;
  flow: ItemFlow;
  /** Warranty or return deadline (YYYY-MM-DD) for reminders. */
  warrantyUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewSavedItem = Omit<SavedItem, 'id' | 'createdAt' | 'updatedAt'>;

export const DEFAULT_CATEGORIES = [
  'Products',
  'Conversations',
  'School',
  'Work',
  'Travel',
  'Documents',
  'Food',
  'Shopping',
  'Bills',
  'Transport',
  'Electronics',
  'Other',
] as const;
