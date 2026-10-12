import { CapturedNotification, parseTransaction, transactionKey } from './transaction-parser';

const at = new Date(2026, 9, 1, 20, 15).getTime();
const note = (packageName: string, title: string, text: string): CapturedNotification => ({ id: 'n', packageName, title, text, postedAt: at });

describe('transaction parser', () => {
  it('reads a GCash send and ignores the balance', () => {
    const result = parseTransaction(note('com.globe.gcash.android', 'GCash', 'You have sent PHP 500.00 of GCash to JU** DE** C. 09171234567 on 10-01-2026 08:15 PM. Your new balance is PHP 1,234.56. Ref. No. 1234 567 890123.'));
    expect(result).toEqual(expect.objectContaining({ provider: 'GCash', flow: 'expense', amount: 500, counterparty: 'JU** DE** C', reference: '1234 567 890123', title: 'Sent to JU** DE** C' }));
  });

  it('reads money received as income', () => {
    const result = parseTransaction(note('com.globe.gcash.android', 'GCash', 'You have received PHP 1,000.00 of GCash from MARIA SANTOS. Your new balance is PHP 2,234.56. Ref. No. 9876543210.'));
    expect(result).toEqual(expect.objectContaining({ flow: 'income', amount: 1000, counterparty: 'Maria Santos', title: 'Received from Maria Santos' }));
  });

  it('reads Maya merchant payments', () => {
    const result = parseTransaction(note('com.paymaya', 'Payment successful', 'Your payment of ₱320.00 to Jollibee was successful.'));
    expect(result).toEqual(expect.objectContaining({ provider: 'Maya', flow: 'expense', amount: 320, counterparty: 'Jollibee', title: 'Paid Jollibee' }));
  });

  it('reads bank debit alerts with a merchant', () => {
    const result = parseTransaction(note('ph.com.bdo.retail', 'BDO', 'Your account ending 1234 was debited PHP 2,500.00 on 01 Oct 2026 for POS purchase at SM SUPERMARKET.'));
    expect(result).toEqual(expect.objectContaining({ provider: 'BDO', flow: 'expense', amount: 2500, counterparty: 'Sm Supermarket' }));
  });

  it('names unknown apps from the notification title', () => {
    const result = parseTransaction(note('com.example.bank', 'MyBank: Transfer', "You've received PHP 5,000.00 via InstaPay from JUAN DELA CRUZ."));
    expect(result).toEqual(expect.objectContaining({ provider: 'MyBank', flow: 'income', amount: 5000, counterparty: 'Juan Dela Cruz' }));
  });

  it('ignores promos, OTPs, and messages without a transaction', () => {
    expect(parseTransaction(note('com.globe.gcash.android', 'GCash', 'Get ₱50 cashback when you pay bills this weekend!'))).toBeNull();
    expect(parseTransaction(note('com.paymaya', 'Maya', 'Your OTP is 123456. Do not share it. Payment of ₱500.00'))).toBeNull();
    expect(parseTransaction(note('com.paymaya', 'Maya', 'Your balance is ₱1,200.00.'))).toBeNull();
    expect(parseTransaction(note('com.globe.gcash.android', 'GCash', 'Your GCash was sent successfully.'))).toBeNull();
  });

  it('does not read "refund" as a reference number', () => {
    const a = parseTransaction(note('com.globe.gcash.android', 'GCash', 'You received a refund of PHP 200.00 from Lazada.'))!;
    expect(a.reference).toBeNull();
    const b = parseTransaction(note('com.globe.gcash.android', 'GCash', 'Your refund of PHP 250.00 from Lazada has been credited. Ref 9988776655'))!;
    expect(b.reference).toBe('9988776655');
  });

  it('stops the reference at the words after it', () => {
    expect(parseTransaction(note('com.paymaya', 'Maya', 'Payment of ₱99.00 to 7-Eleven. Ref. No. 1234567890 has been processed'))!.reference).toBe('1234567890');
    expect(parseTransaction(note('com.paymaya', 'Maya', 'You paid ₱99.00 to 7-Eleven. Your Ref no is ABC123456'))!.reference).toBe('ABC123456');
  });

  it('reads "sent you" as income', () => {
    const result = parseTransaction(note('com.globe.gcash.android', 'GCash', 'JUAN DELA CRUZ sent you PHP 500.00. Ref No. 1234567890.'));
    expect(result).toEqual(expect.objectContaining({ flow: 'income', amount: 500 }));
  });

  it('keys duplicates by reference, or by amount and minute', () => {
    const a = parseTransaction(note('com.globe.gcash.android', 'GCash', 'You have sent PHP 500.00 to JUAN. Ref. No. 1234-5678-90'))!;
    const b = parseTransaction(note('com.globe.gcash.android', 'GCash', 'Sent PHP 500.00 to JUAN. Ref No. 1234567890'))!;
    expect(transactionKey(a)).toBe(transactionKey(b));
    const c = parseTransaction(note('com.paymaya', 'Maya', 'You paid ₱99.00 to 7-Eleven.'))!;
    expect(transactionKey(c)).toContain('99.00');
  });
});
