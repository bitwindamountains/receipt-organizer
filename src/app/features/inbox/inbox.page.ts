import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, copyOutline, refresh, trashOutline } from 'ionicons/icons';
import { CaptureService, InboxEntry } from '../../core/capture/capture.service';

@Component({
  selector: 'app-inbox',
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon, IonSpinner, RouterLink],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Screenshot inbox</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="rescan()" [disabled]="capture.scanning()" aria-label="Check for new screenshots">
            @if (capture.scanning()) { <ion-spinner name="crescent" /> } @else { <ion-icon slot="icon-only" name="refresh" /> }
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <main class="page-width content-pad inbox">
        @if (capture.folderNeedsPermission()) {
          <button type="button" class="inbox-reconnect" (click)="capture.reconnectFolder()">
            Allow access to “{{ capture.folderName() }}” to check for new screenshots
          </button>
        }
        @if (capture.inbox().length) {
          <div class="inbox-head">
            <p>{{ capture.inbox().length }} payment {{ capture.inbox().length === 1 ? 'screenshot' : 'screenshots' }} found</p>
            <ion-button size="small" (click)="addAll()" [disabled]="busy()">Add all{{ duplicates() ? ' new' : '' }}</ion-button>
          </div>
          <ul class="inbox-list">
            @for (entry of capture.inbox(); track entry.id; let i = $index) {
              <li class="inbox-card" animate.enter="enter-card" animate.leave="leave-fade" [style.--i]="i">
                <span class="inbox-thumb">@if (entry.previewUrl) { <img [src]="entry.previewUrl" alt="" loading="lazy" /> }</span>
                <div class="inbox-copy">
                  <strong>{{ entry.suggestion.merchant || (entry.flow === 'income' ? 'Money received' : 'Payment') }}</strong>
                  <span class="inbox-amount num" [class.is-income]="entry.flow === 'income'">{{ entry.flow === 'income' ? '+' : '' }}{{ money(entry) }}</span>
                  <small>{{ entry.suggestion.category || 'Other' }} · {{ day(entry) }}</small>
                  @if (entry.duplicateOf) {
                    <a class="inbox-duplicate" [routerLink]="['/item', entry.duplicateOf]"><ion-icon name="copy-outline" aria-hidden="true" />Looks like a receipt you already have</a>
                  }
                </div>
                <div class="inbox-actions">
                  <ion-button size="small" (click)="add(entry)" [disabled]="busy()"><ion-icon slot="start" name="checkmark-circle" />Add</ion-button>
                  <ion-button size="small" fill="clear" color="medium" (click)="capture.dismiss(entry)" [disabled]="busy()">Skip</ion-button>
                </div>
              </li>
            }
          </ul>
        } @else {
          <section class="empty-state" animate.enter="enter-fade">
            <div class="empty-art" aria-hidden="true">
              <span class="drift-doc drift-doc--shot"></span>
              <span class="drift-doc drift-doc--receipt"></span>
              <span class="drift-doc drift-doc--shot"></span>
            </div>
            <h2>{{ capture.scanning() ? 'Checking your screenshots…' : 'All caught up' }}</h2>
            <p>New screenshots of GCash, Maya, and bank receipts appear here, ready to add with one tap.</p>
          </section>
        }
      </main>
    </ion-content>
  `,
})
export class InboxPage {
  protected readonly capture = inject(CaptureService);
  private readonly toasts = inject(ToastController);
  protected readonly busy = signal(false);
  protected readonly duplicates = () => this.capture.inbox().some((entry) => entry.duplicateOf);

  constructor() {
    addIcons({ checkmarkCircle, copyOutline, refresh, trashOutline });
  }

  protected money(entry: InboxEntry): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: entry.suggestion.currencyCode ?? 'PHP' }).format(entry.suggestion.amount ?? 0);
  }

  protected day(entry: InboxEntry): string {
    const date = entry.suggestion.purchaseDate ? new Date(`${entry.suggestion.purchaseDate}T00:00`) : new Date(entry.takenAt);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  }

  async rescan(): Promise<void> {
    await this.capture.scanScreenshots();
  }

  async add(entry: InboxEntry): Promise<void> {
    await this.run(async () => {
      await this.capture.addFromInbox(entry);
      return 1;
    });
  }

  /** Adds every entry that doesn't duplicate an existing receipt. */
  async addAll(): Promise<void> {
    await this.run(async () => {
      let added = 0;
      for (const entry of this.capture.inbox().filter((candidate) => !candidate.duplicateOf)) {
        await this.capture.addFromInbox(entry);
        added += 1;
      }
      return added;
    });
  }

  private async run(work: () => Promise<number>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const added = await work();
      if (added) {
        const toast = await this.toasts.create({ message: added === 1 ? 'Added to your library' : `${added} receipts added`, duration: 1800, icon: 'checkmark-circle' });
        await toast.present();
      }
    } catch {
      const toast = await this.toasts.create({ message: 'That screenshot could not be added. It may have been deleted.', duration: 2600 });
      await toast.present();
    } finally {
      this.busy.set(false);
    }
  }
}
