import { DatePipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { receiptOutline, imageOutline, star } from 'ionicons/icons';
import { SavedItem } from '../../core/models/saved-item';
import { injectImageUrl } from '../../core/services/image-url';
import { displayTitle, formatAmount } from '../../core/utils/item-display';

@Component({
  selector: 'app-item-card',
  imports: [RouterLink, IonIcon, DatePipe],
  template: `
    <a class="item-card scroll-card" [routerLink]="['/item', item().id]">
      <div class="thumb" [class.is-loaded]="loaded()">
        <span class="thumb-skeleton" aria-hidden="true"></span>
        @if (imageUrl()) {
          <img [src]="imageUrl()" alt="" loading="lazy" decoding="async" (load)="markLoaded(imageUrl())" (error)="markLoaded(imageUrl())" />
        }
        <span class="type-badge">
          <ion-icon [name]="item().type === 'receipt' ? 'receipt-outline' : 'image-outline'" aria-hidden="true" />
          {{ item().type === 'receipt' ? 'Receipt' : 'Screenshot' }}
        </span>
        @if (item().isFavorite) {
          <span class="fav-badge" animate.enter="enter-pop"><ion-icon name="star" aria-hidden="true" /><span class="visually-hidden">Favorite</span></span>
        }
      </div>
      <div class="item-copy">
        <strong>{{ displayTitle(item()) }}</strong>
        <span class="meta">{{ item().category }} · {{ item().createdAt | date: 'MMM d' }}</span>
        @if (formatAmount(item()); as amount) { <span class="amount num">{{ amount }}</span> }
      </div>
    </a>
  `,
})
export class ItemCardComponent {
  readonly item = input.required<SavedItem>();
  protected readonly imageUrl = injectImageUrl(() => this.item().imageKey, 'thumb');
  private readonly loadedUrl = signal('');
  protected readonly loaded = computed(() => Boolean(this.imageUrl()) && this.loadedUrl() === this.imageUrl());
  protected readonly displayTitle = displayTitle;
  protected readonly formatAmount = formatAmount;

  constructor() {
    addIcons({ receiptOutline, imageOutline, star });
  }

  protected markLoaded(url: string): void {
    this.loadedUrl.set(url);
  }
}
