import { ItemType, SavedItem } from '../models/saved-item';

/** What the text on an image suggests. Fields are null when nothing reliable was found. */
export interface ReceiptSuggestion {
  type: ItemType;
  merchant: string | null;
  amount: number | null;
  currencyCode: string | null;
  purchaseDate: string | null;
  category: string | null;
}

const RECEIPT_WORDS = /\b(total|subtotal|sub-total|amount due|cash|change|vat|vatable|receipt|invoice|qty|tin|cashier|transaction|ref(?:erence)? no|amount|paid|payment|balance)\b/gi;

// Most specific first; the first matching line wins.
const TOTAL_PATTERNS = [
  /\bgrand\s*total\b/i,
  /\b(amount|total|balance)\s*(due|payable|to\s*pay)\b/i,
  /\btotal\s*(amount|sales|price)\b/i,
  /\bnet\s*(amount|total)\b/i,
  /^\s*total\b/i,
  /\btotal\b/i,
  /\b(amount\s*(paid|sent)|you\s*paid|payment)\b/i,
];
// "TOTAL AMOUNT DUE (VAT INCLUSIVE)" is a real total, so VAT alone doesn't disqualify a line.
const NOT_TOTAL = /\b(sub-?\s*total|total\s*(items?|qty|quantity|discount|savings|vat)|vatable|vat\s*(amount|exempt|zero|12)|discount|change|tendered)\b/i;

const CURRENCY_HINTS: [RegExp, string][] = [
  [/₱|\bphp\b|\bpesos?\b/i, 'PHP'],
  // Thermal printers that lack the ₱ glyph print "P485.00".
  [/\bP\s?\d[\d,]*\.\d{2}\b/, 'PHP'],
  [/€|\beur\b/i, 'EUR'],
  [/£|\bgbp\b/i, 'GBP'],
  [/¥|\bjpy\b|\byen\b/i, 'JPY'],
  [/\busd\b|us\$|\$/i, 'USD'],
];

// Only a comma separates thousands: "TOTAL 3 450.00" is a quantity of 3 and 450.00, not 3,450.
const MONEY = /(?:₱|php|p|\$|usd|€|eur|£|¥)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2}))(?!\d)/gi;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const NOT_MERCHANT = /\b(official\s*receipt|sales\s*invoice|receipt|invoice|tin|vat\s*reg|min\b|sn\b|serial|tel|phone|mobile|www\.|\.com|street|st\.|ave|road|rd\.|brgy|barangay|city|province|cashier|date|time|table|order|welcome|thank)\b/i;

/** Keyword hints per default category, checked against the merchant and the full text. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Food: ['jollibee', 'mcdonald', 'mcdo', 'kfc', 'chowking', 'greenwich', 'mang inasal', 'starbucks', 'coffee', 'cafe', 'café', 'restaurant', 'pizza', 'bakery', 'bakeshop', 'burger', 'grill', 'kitchen', 'milk tea', 'food', 'eatery', 'dine', 'foodpanda', 'grabfood', 'red ribbon', 'goldilocks', 'shakey', 'max\'s', 'bonchon'],
  Transport: ['grab', 'angkas', 'joyride', 'taxi', 'uber', 'lrt', 'mrt', 'toll', 'petron', 'shell', 'caltex', 'seaoil', 'phoenix', 'fuel', 'gasoline', 'diesel', 'parking', 'easytrip', 'autosweep', 'bus', 'jeep', 'fare'],
  Bills: ['meralco', 'maynilad', 'manila water', 'pldt', 'globe', 'smart', 'converge', 'sky cable', 'skycable', 'internet', 'electric', 'water bill', 'statement of account', 'bill', 'insurance', 'philhealth', 'sss', 'pag-ibig', 'pagibig', 'rent', 'load'],
  Shopping: ['sm ', 'supermarket', 'puregold', 'robinsons', 'savemore', 'waltermart', 'landmark', 'mall', 'lazada', 'shopee', 'zalora', 'uniqlo', 'h&m', 'grocery', 'mart', '7-eleven', 'ministop', 'alfamart', 'watsons', 'mercury drug', 'pharmacy', 'department store', 'ace hardware', 'wilcon', 'handyman', 'daiso', 'miniso'],
  Electronics: ['abenson', 'silicon valley', 'octagon', 'samsung', 'apple', 'xiaomi', 'huawei', 'oppo', 'vivo', 'realme', 'laptop', 'gadget', 'electronics', 'power mac', 'datablitz', 'villman', 'pc express', 'asus', 'lenovo'],
  Travel: ['airline', 'airways', 'cebu pacific', 'philippine airlines', 'airasia', 'hotel', 'resort', 'agoda', 'booking.com', 'airbnb', 'boarding pass', 'flight', 'gate', 'seat', 'itinerary', 'check-in', '2go', 'ferry'],
  School: ['school', 'university', 'college', 'tuition', 'national book store', 'nbs', 'bookstore', 'enrollment', 'enrolment', 'academy'],
  Documents: ['certificate', 'license', 'licence', 'passport', 'identification', 'birth', 'nbi clearance', 'clearance', 'contract', 'agreement', 'permit'],
  Conversations: ['messenger', 'whatsapp', 'viber', 'telegram', 'imessage', 'typing', 'seen', 'delivered', 'active now', 'replied'],
  Products: ['add to cart', 'buy now', 'in stock', 'out of stock', 'free shipping', 'sold', 'ratings', 'reviews', 'variation', 'checkout'],
};

/**
 * Reads recognized text and suggests item fields. Pure and synchronous, so the
 * same logic serves ML Kit on Android and Tesseract in the browser.
 */
export function parseReceiptText(rawText: string, options: { fileName?: string; history?: SavedItem[]; categories?: readonly string[]; today?: Date } = {}): ReceiptSuggestion {
  const lines = rawText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const text = lines.join('\n');
  const isReceipt = looksLikeReceipt(text, options.fileName);
  const merchant = isReceipt ? findMerchant(lines) : null;
  const amount = isReceipt ? findTotal(lines) : null;
  return {
    type: isReceipt ? 'receipt' : 'screenshot',
    merchant,
    amount,
    currencyCode: amount !== null ? findCurrency(text) : null,
    purchaseDate: isReceipt ? findDate(text, options.today ?? new Date()) : null,
    category: suggestCategory(merchant, text, isReceipt ? 'receipt' : 'screenshot', options.history ?? [], options.categories),
  };
}

export function looksLikeReceipt(text: string, fileName = ''): boolean {
  const keywordHits = new Set((text.match(RECEIPT_WORDS) ?? []).map((word) => word.toLowerCase())).size;
  const moneyCount = (text.match(/\d+\.\d{2}(?!\d)/g) ?? []).length;
  const score = keywordHits * 2 + Math.min(moneyCount, 6);
  // Screenshots of e-wallet receipts (GCash, Maya) still count, but need stronger evidence.
  const threshold = /screenshot|screen_?shot/i.test(fileName) ? 7 : 5;
  return score >= threshold;
}

export function findTotal(lines: string[]): number | null {
  for (const pattern of TOTAL_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!pattern.test(line) || NOT_TOTAL.test(line)) continue;
      // The amount is usually on the same line, otherwise on the next one.
      const amount = lastAmount(line) ?? (lines[i + 1] && !/[a-z]{4,}/i.test(lines[i + 1]) ? lastAmount(lines[i + 1]) : null);
      if (amount !== null && amount > 0) return amount;
    }
  }
  // No labelled total: fall back to the largest price-looking number.
  const amounts = lines.flatMap((line) => [...line.matchAll(MONEY)].filter((match) => match[1].includes('.')).map((match) => toNumber(match[1])));
  const largest = Math.max(...amounts.filter((value) => value > 0 && value < 10_000_000));
  return Number.isFinite(largest) ? largest : null;
}

function lastAmount(line: string): number | null {
  // Ignore long digit runs (reference numbers, phone numbers).
  const matches = [...line.matchAll(MONEY)].filter((match) => match[1].includes('.') || match[1].replace(/\D/g, '').length <= 6);
  const last = matches.at(-1);
  return last ? toNumber(last[1]) : null;
}

function toNumber(raw: string): number {
  return Number(raw.replace(/[,\s]/g, ''));
}

export function findCurrency(text: string): string | null {
  for (const [pattern, code] of CURRENCY_HINTS) if (pattern.test(text)) return code;
  return null;
}

export function findMerchant(lines: string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    const letters = line.replace(/[^a-z]/gi, '').length;
    if (letters < 3 || letters < line.replace(/\s/g, '').length * 0.6) continue;
    if (NOT_MERCHANT.test(line) || /\d{3,}/.test(line)) continue;
    return tidyName(line.replace(/[*#=_~|]+/g, ' ').trim());
  }
  return null;
}

/** "JOLLIBEE FOODS" -> "Jollibee Foods"; short all-caps words such as "SM" stay as they are. */
function tidyName(name: string): string {
  if (name !== name.toUpperCase()) return name.slice(0, 60);
  return name
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length <= 3 && !/^(the|and|of|de|ng)$/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
    .slice(0, 60);
}

export function findDate(text: string, today: Date): string | null {
  const candidates: Date[] = [];
  const push = (year: number, month: number, day: number) => {
    const fullYear = year < 100 ? 2000 + year : year;
    const date = new Date(fullYear, month - 1, day);
    if (date.getMonth() === month - 1 && date.getDate() === day) candidates.push(date);
  };
  for (const match of text.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) push(+match[1], +match[2], +match[3]);
  // 10/01/2026 is read month-first, as on Philippine and US receipts, unless the first part can't be a month.
  for (const match of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) {
    const [a, b, year] = [+match[1], +match[2], +match[3]];
    if (a > 12) push(year, b, a);
    else push(year, a, b);
  }
  const monthName = MONTHS.join('|');
  for (const match of text.matchAll(new RegExp(`\\b(${monthName})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'))) {
    push(+match[3], MONTHS.indexOf(match[1].toLowerCase().slice(0, 3)) + 1, +match[2]);
  }
  for (const match of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(${monthName})[a-z]*\\.?,?\\s+(\\d{4})\\b`, 'gi'))) {
    push(+match[3], MONTHS.indexOf(match[2].toLowerCase().slice(0, 3)) + 1, +match[1]);
  }
  const latest = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const valid = candidates.find((date) => date.getFullYear() >= 2000 && date <= latest);
  if (!valid) return null;
  return `${valid.getFullYear()}-${String(valid.getMonth() + 1).padStart(2, '0')}-${String(valid.getDate()).padStart(2, '0')}`;
}

/**
 * Prefers what the user chose before for the same merchant, then keyword hints.
 * Only returns categories that exist.
 */
export function suggestCategory(merchant: string | null, text: string, type: ItemType, history: SavedItem[], categories: readonly string[] = Object.keys(CATEGORY_KEYWORDS)): string | null {
  const available = new Set(categories);
  if (merchant) {
    const counts = new Map<string, number>();
    const name = merchant.toLocaleLowerCase();
    for (const item of history) {
      if (item.merchant?.toLocaleLowerCase() === name && available.has(item.category)) {
        counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
      }
    }
    const [learned] = [...counts].sort((a, b) => b[1] - a[1]);
    if (learned) return learned[0];
  }
  const haystack = ` ${(merchant ?? '').toLowerCase()} \n ${text.toLowerCase()} `;
  const receiptOnly = new Set(['Conversations', 'Products', 'Documents']);
  let best: { category: string; score: number } | null = null;
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!available.has(category)) continue;
    if (type === 'receipt' && receiptOnly.has(category)) continue;
    // Merchant matches count triple; they're the strongest signal.
    const score = words.reduce((total, word) => total + (merchant?.toLowerCase().includes(word.trim()) ? 3 : 0) + (haystack.includes(word) ? 1 : 0), 0);
    if (score > (best?.score ?? 0)) best = { category, score };
  }
  return best?.category ?? null;
}
