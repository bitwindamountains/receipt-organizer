import { ItemFlow } from '../models/saved-item';

/** A notification as captured by the Android listener. */
export interface CapturedNotification {
  id: string;
  packageName: string;
  title: string;
  text: string;
  /** Epoch milliseconds when the notification was posted. */
  postedAt: number;
}

export interface ParsedTransaction {
  provider: string;
  flow: ItemFlow;
  /** Major units, e.g. 500.25. */
  amount: number;
  currencyCode: string;
  counterparty: string | null;
  reference: string | null;
  /** Short title such as "Sent to Juan D." or "Paid Meralco". */
  title: string;
  postedAt: number;
}

/** Wallet and bank apps we can name; anything else uses the notification title. */
export const KNOWN_PROVIDERS: Record<string, string> = {
  'com.globe.gcash.android': 'GCash',
  'com.paymaya': 'Maya',
  'com.unionbankph.online': 'UnionBank',
  'com.bpi.ng.app': 'BPI',
  'ph.com.bdo.retail': 'BDO',
  'com.metrobank.mobile': 'Metrobank',
  'ph.seabank.seabank': 'SeaBank',
  'ph.gotyme.mobile': 'GoTyme',
  'com.landbank.mobilebanking': 'LANDBANK',
  'com.shopee.ph': 'ShopeePay',
  'com.grabtaxi.passenger': 'GrabPay',
};

const AMOUNT = /(?:₱|\bPHP\b|\bPhp\b|\bP(?=\s?\d))\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
const BALANCE_CONTEXT = /(balance|bal\.?|available|limit)\s*(is|of|:)?\s*$/i;
const PROMO = /\b(promo|cashback|voucher|win|offer|discount|up to|get ₱|earn|rewards?|deal|sale|loan offer|pre-?approved)\b/i;
const INCOME = /\b(received|receive|credited|cash[- ]?in|deposited|incoming|refund(ed)?|sent you)\b/i;
const EXPENSE = /\b(sent|paid|payment|purchase[d]?|debited|transferred|withdraw(n|al)?|cash[- ]?out|spent|charged|bought)\b/i;
// "Ref. No. 1234 567 890123", "Reference #ABC123456": a code with a digit; later groups must start with a digit,
// so the words after it ("has been processed") are left out. The \b after "ref" keeps "refund" out.
const REFERENCE = /\bref(?:erence)?\b\.?\s*(?:no\.?|number|#)?\s*(?:is\s+)?:?\s*([A-Z]*\d[A-Z0-9]*(?:[ -]\d[A-Z0-9]*)*)/i;
// "to JUAN DELA CRUZ", "from MA** S.", "at SM SUPERMARKET", stopping at the usual connectors.
const COUNTERPARTY = /\b(to|from|at)\s+(?!your\b|you\b|the\s+account\b)([A-Za-z0-9*][A-Za-z0-9*.&'’ -]{1,40}?)(?=\s+(?:on|with|via|using|for|thru|through|ref|amount|was|is|has|have|had|successful|completed|\d{4}|0\d{9,})\b|[.,;:]|\s*$|\s+\d)/i;

/**
 * Parses a payment notification into a transaction, or returns null for anything
 * that isn't one (promos, OTPs, balance-only messages). Pure, so it is tested
 * against sample texts and can be tuned without touching native code.
 */
export function parseTransaction(notification: CapturedNotification): ParsedTransaction | null {
  const text = `${notification.title}. ${notification.text}`.replace(/\s+/g, ' ').trim();
  if (/\b(otp|one[- ]time (pin|password)|verification code)\b/i.test(text)) return null;

  const amount = firstAmount(text);
  if (amount === null || amount <= 0) return null;

  const income = INCOME.test(text);
  const expense = EXPENSE.test(text);
  if (!income && !expense) return null;
  // Promotions mention amounts too; only keep them when they read as a completed transaction.
  if (PROMO.test(text) && !/\b(you have|you've|your)\b/i.test(text)) return null;
  const flow: ItemFlow = income && !expense ? 'income' : income && /\b(you (have )?received|credited to your|sent you)\b/i.test(text) ? 'income' : 'expense';

  const provider = KNOWN_PROVIDERS[notification.packageName] ?? (notification.title.trim().split(/[:\-–|]/)[0].trim().slice(0, 30) || 'Payment');
  const counterparty = findCounterparty(text, flow);
  const code = text.match(REFERENCE)?.[1].replace(/\s+/g, ' ').trim();
  // Short codes like "Ref 12" are too likely to repeat to identify a payment.
  const reference = code && code.replace(/[\s-]/g, '').length >= 6 ? code : null;
  return {
    provider,
    flow,
    amount,
    currencyCode: 'PHP',
    counterparty,
    reference,
    title: transactionTitle(flow, counterparty, provider, text),
    postedAt: notification.postedAt,
  };
}

function firstAmount(text: string): number | null {
  for (const match of text.matchAll(AMOUNT)) {
    const before = text.slice(0, match.index);
    if (BALANCE_CONTEXT.test(before)) continue;
    return Number(match[1].replace(/,/g, ''));
  }
  return null;
}

function findCounterparty(text: string, flow: ItemFlow): string | null {
  const preferred = flow === 'income' ? 'from' : null;
  const matches = [...text.matchAll(new RegExp(COUNTERPARTY.source, 'gi'))];
  const match = (preferred && matches.find((candidate) => candidate[1].toLowerCase() === preferred)) || matches[0];
  if (!match) return null;
  const name = match[2].replace(/\s+/g, ' ').trim();
  if (!/[a-z]/i.test(name) || /^(gcash|maya|account|wallet|bank)$/i.test(name)) return null;
  return tidy(name);
}

/** "JUAN DELA CRUZ" -> "Juan Dela Cruz"; masked names like "JU** DE** C." keep their shape. */
function tidy(name: string): string {
  if (name !== name.toUpperCase() || name.includes('*')) return name;
  return name.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function transactionTitle(flow: ItemFlow, counterparty: string | null, provider: string, text: string): string {
  if (flow === 'income') return counterparty ? `Received from ${counterparty}` : `Received via ${provider}`;
  if (counterparty) {
    const verb = /\b(sent|transferred)\b/i.test(text) ? 'Sent to' : 'Paid';
    return `${verb} ${counterparty}`;
  }
  return `${provider} payment`;
}

/**
 * A key that identifies one transaction across repeated or duplicated
 * notifications: the reference number when there is one, else amount and minute.
 */
export function transactionKey(transaction: ParsedTransaction): string {
  if (transaction.reference) return `${transaction.provider}|ref|${transaction.reference.replace(/\s|-/g, '')}`;
  return `${transaction.provider}|${transaction.flow}|${transaction.amount.toFixed(2)}|${Math.floor(transaction.postedAt / 60_000)}`;
}
