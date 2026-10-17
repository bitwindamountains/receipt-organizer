import { DatePipe } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, createOutline, expandOutline, shareOutline, shieldCheckmark, shieldOutline, trashOutline, star, starOutline } from 'ionicons/icons';
import { map } from 'rxjs';
import { SavedItem } from '../../core/models/saved-item';
import { ImageStorageService } from '../../core/services/image-storage.service';
import { injectImageUrl } from '../../core/services/image-url';
import { ItemStore } from '../../core/services/item.store';
import { displayTitle, formatAmount } from '../../core/utils/item-display';
import { daysLeftLabel, warrantyStatus } from '../../core/utils/warranty';
import { injectGoBack } from '../../core/utils/navigation';

const BURST_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

@Component({
  selector: 'app-item-details',
  imports: [DatePipe, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonButton, IonIcon, IonSpinner],
  template: `
    <ion-header class="ion-no-border detail-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" text="" /></ion-buttons>
        @if (item(); as current) {
          <ion-buttons slot="end">
            <ion-button class="fav-button" (click)="toggleFavorite(current)" [attr.aria-label]="current.isFavorite ? 'Remove from favorites' : 'Add to favorites'" [attr.aria-pressed]="current.isFavorite">
              <ion-icon slot="icon-only" [name]="current.isFavorite ? 'star' : 'star-outline'" [class.is-on]="current.isFavorite" />
              @if (burst()) {
                <span class="burst" aria-hidden="true">@for (angle of burstAngles; track angle) { <i [style.--a.deg]="angle"></i> }</span>
              }
            </ion-button>
            <ion-button [routerLink]="['/item', current.id, 'edit']" aria-label="Edit item"><ion-icon slot="icon-only" name="create-outline" /></ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true" class="detail-content">
      @if (!store.ready()) {
        <div class="detail-loading"><ion-spinner name="crescent" /></div>
      } @else if (item(); as current) {
        <div class="stage">
          @if (imageUrl()) { <div class="stage-glow" [style.background-image]="'url(' + imageUrl() + ')'"></div> }
          <button #stageButton class="stage-image" type="button" (click)="openViewer()" aria-label="View full image">
            @if (imageUrl()) { <img [src]="imageUrl()" [alt]="displayTitle(current)" /> }
            <span class="zoom-hint" aria-hidden="true"><ion-icon name="expand-outline" /></span>
          </button>
        </div>

        <main class="sheet">
          <div class="sheet-inner">
            <p class="eyebrow reveal">{{ current.type === 'receipt' ? 'Receipt' : 'Screenshot' }} · {{ current.category }}</p>
            <h1 class="reveal" style="--i: 1">{{ displayTitle(current) }}</h1>

            @if (current.type === 'receipt' && (current.merchant || formatAmount(current) || current.purchaseDate)) {
              <section class="detail-slip reveal" style="--i: 2" aria-label="Receipt summary">
                <div class="slip-head">
                  <span>{{ current.merchant || 'Receipt' }}</span>
                  @if (current.purchaseDate) { <span>{{ current.purchaseDate | date: 'mediumDate' }}</span> }
                </div>
                @if (formatAmount(current); as amount) {
                  <div class="slip-amount"><span>Total</span><strong class="num">{{ amount }}</strong></div>
                }
              </section>
            }

            @if (warranty(); as w) {
              <section class="warranty-card reveal" style="--i: 3" [class.is-ending]="w.state === 'ending'" [class.is-ended]="w.state === 'ended'">
                <span class="warranty-ring" aria-hidden="true">
                  <svg viewBox="0 0 44 44"><circle class="ring-track" cx="22" cy="22" r="18" /><circle class="ring-fill" cx="22" cy="22" r="18" [style.--p]="w.remaining ?? (w.state === 'ended' ? 0 : 1)" /></svg>
                  <ion-icon [name]="w.state === 'ended' ? 'shield-outline' : 'shield-checkmark'" />
                </span>
                <div class="warranty-copy">
                  <strong>{{ w.state === 'ended' ? 'Warranty ended' : w.state === 'ending' ? 'Warranty ending soon' : 'Under warranty' }}</strong>
                  <span>{{ daysLeftLabel(w.daysLeft) }} · until {{ current.warrantyUntil | date: 'mediumDate' }}</span>
                </div>
              </section>
            }

            <dl class="meta-list reveal" style="--i: 3">
              @if (current.tags.length) {
                <div><dt>Tags</dt><dd class="tags">@for (tag of current.tags; track tag) { <span>{{ tag }}</span> }</dd></div>
              }
              @if (current.notes) { <div><dt>Notes</dt><dd class="notes">{{ current.notes }}</dd></div> }
              <div><dt>Category</dt><dd>{{ current.category }}</dd></div>
              <div><dt>Saved</dt><dd>{{ current.createdAt | date: 'MMM d, y, h:mm a' }}</dd></div>
            </dl>

            <div class="detail-actions reveal" style="--i: 4">
              <ion-button expand="block" (click)="share(current)"><ion-icon slot="start" name="share-outline" />Share</ion-button>
              <ion-button expand="block" fill="outline" [routerLink]="['/item', current.id, 'edit']"><ion-icon slot="start" name="create-outline" />Edit details</ion-button>
              <ion-button expand="block" fill="clear" color="danger" (click)="confirmDelete(current)"><ion-icon slot="start" name="trash-outline" />Delete</ion-button>
            </div>
          </div>
        </main>
      } @else {
        <section class="empty-state missing">
          <div class="empty-art" aria-hidden="true">
            <span class="drift-doc drift-doc--shot"></span>
            <span class="drift-doc drift-doc--receipt"></span>
            <span class="drift-doc drift-doc--receipt"></span>
          </div>
          <h2>Item not found</h2>
          <p>It may have been removed from your library.</p>
          <ion-button (click)="goBack()">Go back</ion-button>
        </section>
      }
    </ion-content>

    @if (viewerOpen() && item(); as current) {
      <div class="viewer" role="dialog" aria-modal="true" aria-label="Full image" animate.enter="viewer-enter" animate.leave="viewer-leave" (keydown.escape)="closeViewer()">
        <div class="viewer-scroll" [class.is-zoomed]="zoomed()" (click)="closeViewer()">
          <img [src]="imageUrl()" [alt]="displayTitle(current)" (click)="toggleZoom($event)" />
        </div>
        <button #closeButton class="viewer-close" type="button" aria-label="Close full image" (click)="closeViewer()"><ion-icon name="close" /></button>
        <p class="viewer-hint" aria-hidden="true">Tap image to {{ zoomed() ? 'fit' : 'zoom' }}</p>
      </div>
    }
  `,
})
export class ItemDetailsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(ItemStore);
  private readonly images = inject(ImageStorageService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly goBackOr = injectGoBack();

  private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });
  // Kept while the page animates away after a delete, so it doesn't flash "not found".
  private readonly deleted = signal<SavedItem | undefined>(undefined);
  // Derived from the store so edits, favorites, and undo show up immediately.
  protected readonly item = computed(() => this.store.items().find((candidate) => candidate.id === this.id()) ?? this.deleted());
  protected readonly imageUrl = injectImageUrl(() => this.item()?.imageKey);
  protected readonly warranty = computed(() => {
    const item = this.item();
    return item ? warrantyStatus(item) : null;
  });
  protected readonly daysLeftLabel = daysLeftLabel;
  protected readonly viewerOpen = signal(false);
  protected readonly zoomed = signal(false);
  protected readonly burst = signal(false);
  protected readonly burstAngles = BURST_ANGLES;
  protected readonly displayTitle = displayTitle;
  protected readonly formatAmount = formatAmount;
  private readonly stageButton = viewChild<ElementRef<HTMLButtonElement>>('stageButton');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private burstTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    addIcons({ close, createOutline, expandOutline, shareOutline, shieldCheckmark, shieldOutline, trashOutline, star, starOutline });
  }

  ngOnInit(): void {
    void this.store.load();
  }

  async share(item: SavedItem): Promise<void> {
    try {
      await this.images.share(item.imageKey, `${displayTitle(item)}.${item.mimeType.split('/')[1] ?? 'jpg'}`);
    } catch (error) {
      if (!String(error).toLowerCase().includes('cancel')) {
        const toast = await this.toastController.create({ message: 'Could not share this image.', duration: 2200 });
        await toast.present();
      }
    }
  }

  async toggleFavorite(item: SavedItem): Promise<void> {
    const becomingFavorite = !item.isFavorite;
    await this.store.toggleFavorite(item.id);
    if (!becomingFavorite) return;
    clearTimeout(this.burstTimer);
    this.burst.set(false);
    queueMicrotask(() => this.burst.set(true));
    this.burstTimer = setTimeout(() => this.burst.set(false), 700);
  }

  openViewer(): void {
    if (!this.imageUrl()) return;
    this.zoomed.set(false);
    this.viewerOpen.set(true);
    setTimeout(() => this.closeButton()?.nativeElement.focus());
  }

  closeViewer(): void {
    this.viewerOpen.set(false);
    this.stageButton()?.nativeElement.focus();
  }

  toggleZoom(event: Event): void {
    event.stopPropagation();
    this.zoomed.update((value) => !value);
  }

  async confirmDelete(item: SavedItem): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Delete this item?',
      message: 'The SnapSort copy and its details will be removed. Your original gallery image will stay where it is.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => void this.deleteWithUndo(item) },
      ],
    });
    await alert.present();
  }

  goBack(): void {
    this.goBackOr('/home');
  }

  private async deleteWithUndo(item: SavedItem): Promise<void> {
    this.deleted.set(item);
    await this.store.delete(item.id);
    this.goBackOr('/home');
    let undone = false;
    const toast = await this.toastController.create({
      message: 'Item deleted',
      duration: 5000,
      buttons: [{ text: 'Undo', handler: () => { undone = true; void this.store.restore(item); } }],
    });
    await toast.present();
    await toast.onDidDismiss();
    if (!undone) await this.images.remove(item.imageKey);
  }
}
