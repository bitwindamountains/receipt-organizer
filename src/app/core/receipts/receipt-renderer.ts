import { ReceiptDraft, filledLines, formatMinorAmount, receiptTotals } from './receipt-draft';

const WIDTH = 380;
const SCALE = 2;
const PAD = 28;
const PAPER = '#fffdf6';
const INK = '#17201e';
const MUTED = '#6b7672';
const RULE = '#c9cfcb';
const SANS = "'Inter Variable', Inter, system-ui, sans-serif";
const MONO = "ui-monospace, 'Roboto Mono', 'SF Mono', Menlo, Consolas, monospace";
const TOOTH = 7;

/** Draws the receipt as a PNG matching the in-app preview. */
export async function renderReceipt(draft: ReceiptDraft): Promise<Blob> {
  await document.fonts?.load(`700 16px ${SANS}`).catch(() => undefined);
  // First pass measures the height, second pass draws at that size.
  const height = paint(draft, measureContext());
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  context.scale(SCALE, SCALE);
  paint(draft, context, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the receipt image.');
  return blob;
}

function measureContext(): CanvasRenderingContext2D {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  return context;
}

/** Lays out (and, when `height` is given, draws) the receipt. Returns the total height. */
function paint(draft: ReceiptDraft, ctx: CanvasRenderingContext2D, height?: number): number {
  const draw = height !== undefined;
  const sold = draft.mode === 'sold';
  const lines = filledLines(draft.lines);
  const totals = receiptTotals(lines, draft.discount);
  const money = (minor: number) => formatMinorAmount(minor, draft.currencyCode);
  const right = WIDTH - PAD;
  let y = 0;

  if (draw) {
    // Paper with a torn, zigzag bottom edge.
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(WIDTH, 0);
    ctx.lineTo(WIDTH, height - TOOTH);
    for (let x = WIDTH; x > 0; x -= TOOTH * 2) {
      ctx.lineTo(x - TOOTH, height);
      ctx.lineTo(Math.max(0, x - TOOTH * 2), height - TOOTH);
    }
    ctx.closePath();
    ctx.fill();
    if (sold) {
      ctx.fillStyle = draft.accent;
      ctx.fillRect(0, 0, WIDTH, 8);
    }
  }

  const text = (value: string, x: number, top: number, font: string, color = INK, align: CanvasTextAlign = 'left') => {
    ctx.font = font;
    if (!draw) return;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(value, x, top);
  };
  const wrap = (value: string, font: string, maxWidth: number): string[] => {
    ctx.font = font;
    const out: string[] = [];
    for (const paragraph of value.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const attempt = current ? `${current} ${word}` : word;
        if (ctx.measureText(attempt).width > maxWidth && current) {
          out.push(current);
          current = word;
        } else current = attempt;
      }
      out.push(current);
    }
    return out;
  };
  const rule = (top: number) => {
    if (!draw) return;
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD, top + 0.5);
    ctx.lineTo(right, top + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const row = (label: string, value: string, labelFont: string, valueFont: string, color = INK, step = 22) => {
    text(label, PAD, y, labelFont, color === INK ? MUTED : color);
    text(value, right, y, valueFont, color, 'right');
    y += step;
  };

  // Header
  y = sold ? 34 : 30;
  const title = draft.issuer.trim() || (sold ? 'Your business' : 'Purchase');
  for (const line of wrap(title, `800 22px ${SANS}`, WIDTH - PAD * 2)) {
    text(line, WIDTH / 2, y, `800 22px ${SANS}`, INK, 'center');
    y += 28;
  }
  const subtitle = draft.issuerDetails.trim() || (sold ? '' : 'Purchase record');
  if (subtitle) {
    for (const line of wrap(subtitle, `500 12px ${SANS}`, WIDTH - PAD * 2)) {
      text(line, WIDTH / 2, y, `500 12px ${SANS}`, MUTED, 'center');
      y += 16;
    }
  }
  y += 6;
  text(sold ? 'OFFICIAL RECEIPT' : 'RECEIPT', WIDTH / 2, y, `700 11px ${MONO}`, sold ? draft.accent : MUTED, 'center');
  y += 26;

  // Meta
  const date = draft.date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(draft.date)) : '';
  row(sold ? `No. ${draft.number}` : 'Date', sold ? date : date, `500 12px ${MONO}`, `500 12px ${MONO}`);
  if (sold && draft.customer.trim()) row('Customer', draft.customer.trim(), `500 12px ${MONO}`, `600 12px ${SANS}`);
  if (draft.payment) row('Paid via', draft.payment, `500 12px ${MONO}`, `600 12px ${SANS}`);
  y += 4;
  rule(y);
  y += 16;

  // Items
  if (!lines.length) {
    text('No items yet', WIDTH / 2, y, `500 13px ${SANS}`, MUTED, 'center');
    y += 24;
  }
  lines.forEach((line, i) => {
    const amount = money(totals.lineTotals[i]);
    ctx.font = `600 13px ${MONO}`;
    const amountWidth = ctx.measureText(amount).width;
    const description = wrap(line.description.trim() || 'Item', `600 13px ${SANS}`, WIDTH - PAD * 2 - amountWidth - 14);
    description.forEach((part, index) => {
      text(part, PAD, y, `600 13px ${SANS}`);
      if (index === 0) text(amount, right, y, `600 13px ${MONO}`, INK, 'right');
      y += 18;
    });
    text(`${line.quantity} × ${money(Math.round((line.price || 0) * 100))}`, PAD, y, `400 11px ${MONO}`, MUTED);
    y += 22;
  });
  rule(y);
  y += 16;

  // Totals
  if (totals.discount) {
    row('Subtotal', money(totals.subtotal), `500 12px ${MONO}`, `500 12px ${MONO}`);
    row('Discount', `−${money(totals.discount)}`, `500 12px ${MONO}`, `500 12px ${MONO}`);
    y += 4;
  }
  text('TOTAL', PAD, y + 6, `700 12px ${MONO}`, MUTED);
  text(money(totals.total), right, y, `800 24px ${SANS}`, sold ? draft.accent : INK, 'right');
  y += 40;

  // Notes and footer
  if (draft.notes.trim()) {
    rule(y);
    y += 16;
    for (const line of wrap(draft.notes.trim(), `500 12px ${SANS}`, WIDTH - PAD * 2)) {
      text(line, WIDTH / 2, y, `500 12px ${SANS}`, MUTED, 'center');
      y += 17;
    }
    y += 6;
  }
  text('Made with SnapSort', WIDTH / 2, y + 6, `500 10px ${SANS}`, RULE, 'center');
  y += 26 + TOOTH + 10;
  return Math.ceil(y);
}
