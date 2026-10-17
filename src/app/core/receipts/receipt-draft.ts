/** "bought": a purchase record for yourself. "sold": a receipt you give a customer. */
export type ReceiptMode = 'bought' | 'sold';

export interface ReceiptLine {
  description: string;
  quantity: number;
  /** Unit price in major units, as typed (e.g. 70.5). */
  price: number;
}

export interface ReceiptDraft {
  mode: ReceiptMode;
  /** Store you bought from, or your business when selling. */
  issuer: string;
  /** Line printed under the name: address/contact when selling, or a source note such as "From a GCash notification". */
  issuerDetails: string;
  /** Customer name (sold, optional). */
  customer: string;
  number: string;
  date: string;
  currencyCode: string;
  payment: string;
  lines: ReceiptLine[];
  /** Discount in major units. */
  discount: number;
  notes: string;
  accent: string;
}

export interface ReceiptTotals {
  /** Per-line totals in minor units, same order as `lines`. */
  lineTotals: number[];
  subtotal: number;
  discount: number;
  total: number;
}

const toMinor = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) : 0);

/** Totals in integer minor units, so 3 × 0.10 is exactly 0.30. Blank lines count as zero. */
export function receiptTotals(lines: ReceiptLine[], discount: number): ReceiptTotals {
  const lineTotals = lines.map((line) => Math.round(Math.max(0, line.quantity || 0) * toMinor(Math.max(0, line.price || 0))));
  const subtotal = lineTotals.reduce((sum, value) => sum + value, 0);
  const discountMinor = Math.min(subtotal, toMinor(Math.max(0, discount || 0)));
  return { lineTotals, subtotal, discount: discountMinor, total: subtotal - discountMinor };
}

/** Lines with something worth printing. */
export function filledLines(lines: ReceiptLine[]): ReceiptLine[] {
  return lines.filter((line) => line.description.trim() || line.price > 0);
}

export function formatMinorAmount(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(minor / 100);
}

/**
 * Plain-text itemization stored as the item's notes, so the library search
 * finds a receipt by anything bought or sold on it.
 */
export function receiptNotes(draft: ReceiptDraft): string {
  const lines = filledLines(draft.lines);
  const totals = receiptTotals(lines, draft.discount);
  const rows = lines.map((line, i) => `${line.quantity} × ${line.description.trim() || 'Item'} — ${formatMinorAmount(totals.lineTotals[i], draft.currencyCode)}`);
  if (totals.discount) rows.push(`Discount — ${formatMinorAmount(totals.discount, draft.currencyCode)}`);
  if (draft.payment) rows.push(`Paid via ${draft.payment}`);
  if (draft.notes.trim()) rows.push('', draft.notes.trim());
  return rows.join('\n');
}

/** Next receipt number after `previous`, keeping its zero padding: "0009" -> "0010". */
export function nextReceiptNumber(previous: string | null): string {
  const match = previous?.match(/^(.*?)(\d+)$/);
  if (!match) return '0001';
  const [, prefix, digits] = match;
  return `${prefix}${String(Number(digits) + 1).padStart(digits.length, '0')}`;
}
