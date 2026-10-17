import { NewSavedItem } from '../../core/models/saved-item';
import { ReceiptSuggestion } from '../../core/ocr/receipt-parser';

type Details = Omit<NewSavedItem, 'imageKey' | 'mimeType'>;
export type TypedField = 'merchant' | 'amount' | 'currencyCode' | 'purchaseDate';

/**
 * Details for one image of a batch. The form's merchant, amount, and date may have been
 * auto-filled from a different image, so unless the user typed them (they then apply to
 * every image), this image gets its own reading, or nothing when it couldn't be read.
 */
export function detailsForImage(shared: Details, own: ReceiptSuggestion | null, typed: ReadonlySet<TypedField>, currency: string): Details {
  if (shared.type !== 'receipt') return shared;
  const reading = own?.type === 'receipt' ? own : null;
  const amountMinor = typed.has('amount') ? shared.amountMinor : reading?.amount == null ? null : Math.round(reading.amount * 100);
  return {
    ...shared,
    merchant: typed.has('merchant') ? shared.merchant : (reading?.merchant ?? null),
    amountMinor,
    currencyCode: amountMinor === null ? null : typed.has('currencyCode') || typed.has('amount') ? currency : (reading?.currencyCode ?? currency),
    purchaseDate: typed.has('purchaseDate') ? shared.purchaseDate : (reading?.purchaseDate ?? null),
  };
}
