import { Injectable, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { SavedItem } from '../models/saved-item';
import { remindersFor } from '../utils/warranty';
import { ItemStore } from './item.store';

const SOURCE = 'snapsort-warranty';
// Android caps scheduled alarms per app; this stays far below the limit.
const MAX_SCHEDULED = 60;

/**
 * Keeps on-device warranty reminders in step with the library (Android). Each sync
 * cancels SnapSort's pending reminders and schedules the current set, so edits and
 * deletes never leave stale notifications. The browser build shows reminders in the
 * app only.
 */
@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly store = inject(ItemStore);
  private readonly router = inject(Router);
  private syncTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    if (!Capacitor.isNativePlatform()) return;
    effect(() => {
      const items = this.store.items();
      if (!this.store.ready()) return;
      clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => void this.sync(items).catch(() => undefined), 800);
    });
    void this.listenForTaps();
  }

  /** Asks for notification permission the first time a warranty date is saved. */
  async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    let status = await LocalNotifications.checkPermissions();
    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') status = await LocalNotifications.requestPermissions();
    if (status.display === 'granted') void this.sync(this.store.items());
    return status.display === 'granted';
  }

  private async sync(items: SavedItem[]): Promise<void> {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter((notification) => notification.extra?.source === SOURCE);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(({ id }) => ({ id })) });
    const reminders = items
      .flatMap((item) => remindersFor(item))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, MAX_SCHEDULED);
    if (!reminders.length) return;
    await LocalNotifications.schedule({
      notifications: reminders.map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        body: reminder.body,
        schedule: { at: reminder.at, allowWhileIdle: true },
        extra: { source: SOURCE, itemId: reminder.itemId },
      })),
    });
  }

  /** Tapping a reminder opens the receipt it's about. */
  private async listenForTaps(): Promise<void> {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      const itemId = notification.extra?.itemId;
      if (notification.extra?.source === SOURCE && typeof itemId === 'string') void this.router.navigate(['/item', itemId]);
    });
  }
}
