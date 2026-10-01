import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSearchbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { albumsOutline, arrowForward, layers, receiptOutline, starOutline } from 'ionicons/icons';
import { ItemStore } from '../../core/services/item.store';
import { monthlyReceiptSummary } from '../../core/utils/item-display';
import { AmbientBackdropComponent } from '../../shared/ambient-backdrop/ambient-backdrop.component';
import { CountUpDirective } from '../../shared/count-up.directive';
import { ItemCardComponent } from '../../shared/item-card/item-card.component';

@Component({
  selector: 'app-home',
  imports: [IonContent, IonSearchbar, IonButton, IonIcon, RouterLink, ItemCardComponent, AmbientBackdropComponent, CountUpDirective],
  template: `
    <ion-content [fullscreen]="true">
      <app-ambient-backdrop class="home-ambient" />
      <main class="page-width content-pad home">
        <div class="brand-row reveal">
          <span class="brand-mark" aria-hidden="true"><ion-icon name="layers" /></span>
          <span class="brand-name">SnapSort</span>
        </div>

        <section class="hero">
          <p class="eyebrow reveal" style="--i: 1">{{ greeting() }}</p>
          <h1 class="reveal" style="--i: 2">What do you need to find?</h1>
          <ion-searchbar
            class="sn-search reveal"
            style="--i: 3"
            aria-label="Search your library"
            placeholder="Merchant, tag, category..."
            inputmode="search"
            enterkeyhint="search"
            [value]="query()"
            (ionInput)="setQuery($event)"
            (keyup.enter)="openLibrary()"
          />
        </section>

        @if (!store.ready()) {
          <div class="stat-row" aria-hidden="true">
            @for (n of [1, 2, 3]; track n) { <div class="skeleton stat-skeleton"></div> }
          </div>
          <div class="item-grid home-skeleton" aria-label="Opening your library">
            @for (n of [1, 2, 3, 4]; track n) {
              <div class="skeleton-card" aria-hidden="true"><div class="skeleton"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></div>
            }
          </div>
        } @else if (store.items().length === 0) {
          <section class="empty-state reveal" style="--i: 4">
            <div class="empty-art" aria-hidden="true">
              <span class="drift-doc drift-doc--shot"></span>
              <span class="drift-doc drift-doc--receipt"></span>
              <span class="drift-doc drift-doc--receipt"></span>
            </div>
            <h2>Your useful images, organized</h2>
            <p>Add a screenshot or receipt now. Find it later by category, title, tag, or merchant.</p>
            <ion-button routerLink="/add" size="large">Add your first image</ion-button>
          </section>
        } @else {
          <section class="stat-row" aria-label="Library overview">
            <button class="stat-tile reveal" style="--i: 4" (click)="openLibrary()">
              <span class="stat-icon"><ion-icon name="albums-outline" aria-hidden="true" /></span>
              <span><strong class="stat-value num" [appCountUp]="store.items().length"></strong><span class="stat-label">All items</span></span>
            </button>
            <button class="stat-tile stat-tile--accent reveal" style="--i: 5" (click)="openLibrary('receipt')">
              <span class="stat-icon"><ion-icon name="receipt-outline" aria-hidden="true" /></span>
              <span><strong class="stat-value num" [appCountUp]="receiptCount()"></strong><span class="stat-label">Receipts</span></span>
            </button>
            <button class="stat-tile stat-tile--gold reveal" style="--i: 6" (click)="openLibrary(undefined, true)">
              <span class="stat-icon"><ion-icon name="star-outline" aria-hidden="true" /></span>
              <span><strong class="stat-value num" [appCountUp]="store.favorites().length"></strong><span class="stat-label">Favorites</span></span>
            </button>
          </section>

          @if (monthSummary(); as summary) {
            <a class="month-slip" routerLink="/insights" [attr.aria-label]="summary.month + ' receipts total ' + summary.total + '. Open insights'">
              <p class="slip-label">{{ summary.month }} receipts</p>
              <span class="slip-total num">{{ summary.total }}</span>
              <span class="slip-meta">
                {{ summary.count }} {{ summary.count === 1 ? 'receipt' : 'receipts' }}
                @if (summary.otherCurrencies) { <br />+{{ summary.otherCurrencies }} other {{ summary.otherCurrencies === 1 ? 'currency' : 'currencies' }} }
              </span>
              <span class="slip-cta">See insights <ion-icon name="arrow-forward" aria-hidden="true" /></span>
            </a>
          }

          <section class="quick-categories reveal" style="--i: 7">
            <p class="eyebrow">Browse by category</p>
            <div class="chip-row">
              @for (category of popularCategories(); track category.name) {
                <button class="cat-chip" type="button" (click)="openCategory(category.name)" [attr.aria-label]="category.name + ', ' + category.count + (category.count === 1 ? ' item' : ' items')">
                  {{ category.name }} <span class="count num">{{ category.count }}</span>
                </button>
              }
            </div>
          </section>

          <section class="section-heading">
            <div><p class="eyebrow">Recent</p><h2>Saved lately</h2></div>
            <ion-button fill="clear" routerLink="/library">See all <ion-icon slot="end" name="arrow-forward" /></ion-button>
          </section>
          <section class="item-grid" aria-label="Recently saved items">
            @for (item of store.recent(); track item.id; let i = $index) {
              <app-item-card [item]="item" animate.enter="enter-card" [style.--i]="i" />
            }
          </section>
        }
      </main>
    </ion-content>
  `,
})
export class HomePage implements OnInit {
  protected readonly store = inject(ItemStore);
  private readonly router = inject(Router);
  protected readonly query = signal('');
  protected readonly receiptCount = computed(() => this.store.items().filter((item) => item.type === 'receipt').length);
  protected readonly monthSummary = computed(() => monthlyReceiptSummary(this.store.items()));
  protected readonly popularCategories = computed(() => {
    const counts = new Map<string, number>();
    for (const item of this.store.items()) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 6);
  });

  constructor() {
    addIcons({ albumsOutline, arrowForward, layers, receiptOutline, starOutline });
  }

  ngOnInit(): void {
    void this.store.load();
  }

  protected greeting(): string {
    const hour = new Date().getHours();
    return hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }

  setQuery(event: Event): void {
    this.query.set(String((event as CustomEvent).detail.value ?? ''));
  }

  openLibrary(type?: 'receipt', favorite = false): void {
    void this.router.navigate(['/library'], { queryParams: { q: this.query().trim() || null, type: type ?? null, favorite: favorite || null } });
  }

  openCategory(category: string): void {
    void this.router.navigate(['/library'], { queryParams: { category } });
  }
}
