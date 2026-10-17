import { SavedItem } from '../models/saved-item';
import { displayTitle } from './item-display';

export const REMINDER_DAYS_BEFORE = 7;
export const REMINDER_HOUR = 9;
const DAY_MS = 86_400_000;

export interface WarrantyStatus {
  /** Whole days until the end date; 0 on the day, negative once ended. */
  daysLeft: number;
  state: 'active' | 'ending' | 'ended';
  /** Share of the coverage period still remaining (0-1), when the purchase date is known. */
  remaining: number | null;
}

export interface Reminder {
  id: number;
  itemId: string;
  at: Date;
  title: string;
  body: string;
}

function localDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function warrantyStatus(item: SavedItem, today = new Date()): WarrantyStatus | null {
  if (!item.warrantyUntil) return null;
  const end = localDate(item.warrantyUntil);
  const daysLeft = Math.round((end.getTime() - startOfDay(today).getTime()) / DAY_MS);
  let remaining: number | null = null;
  if (item.purchaseDate) {
    const total = (end.getTime() - localDate(item.purchaseDate).getTime()) / DAY_MS;
    remaining = total > 0 ? Math.min(1, Math.max(0, daysLeft / total)) : null;
  }
  return { daysLeft, state: daysLeft < 0 ? 'ended' : daysLeft <= 30 ? 'ending' : 'active', remaining };
}

/** Items whose coverage ends within `withinDays` (including today), soonest first. */
export function endingSoon(items: SavedItem[], today = new Date(), withinDays = 30): { item: SavedItem; daysLeft: number }[] {
  return items
    .map((item) => ({ item, status: warrantyStatus(item, today) }))
    .filter((entry): entry is { item: SavedItem; status: WarrantyStatus } => !!entry.status && entry.status.daysLeft >= 0 && entry.status.daysLeft <= withinDays)
    .sort((a, b) => a.status.daysLeft - b.status.daysLeft)
    .map(({ item, status }) => ({ item, daysLeft: status.daysLeft }));
}

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return daysLeft === -1 ? 'Ended yesterday' : `Ended ${-daysLeft} days ago`;
  if (daysLeft === 0) return 'Ends today';
  if (daysLeft === 1) return 'Ends tomorrow';
  return `${daysLeft} days left`;
}

/** Stable positive 31-bit id, so rescheduling replaces rather than duplicates a reminder. */
export function reminderId(itemId: string, kind: 'before' | 'due'): number {
  let hash = 2166136261;
  for (const char of `${itemId}:${kind}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 1) || 1;
}

/** Reminders a week before and on the end date at 9:00, skipping times already past. */
export function remindersFor(item: SavedItem, now = new Date()): Reminder[] {
  if (!item.warrantyUntil) return [];
  const end = localDate(item.warrantyUntil);
  const name = displayTitle(item);
  const at = (daysBefore: number) => new Date(end.getFullYear(), end.getMonth(), end.getDate() - daysBefore, REMINDER_HOUR);
  const candidates: Reminder[] = [
    { id: reminderId(item.id, 'before'), itemId: item.id, at: at(REMINDER_DAYS_BEFORE), title: `Warranty ends in ${REMINDER_DAYS_BEFORE} days`, body: `${name}: check it over or claim a return before it runs out.` },
    { id: reminderId(item.id, 'due'), itemId: item.id, at: at(0), title: 'Warranty ends today', body: `${name}: today is the last day of coverage.` },
  ];
  return candidates.filter((reminder) => reminder.at > now);
}
