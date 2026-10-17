import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeCircle, star, starOutline } from 'ionicons/icons';
import { ItemType, SavedItem } from '../../core/models/saved-item';
import { CategoryStore } from '../../core/services/category.store';
import { ItemStore } from '../../core/services/item.store';
import { MonthGroup, displayTitle, groupByMonth, matchesQuery } from '../../core/utils/item-display';
import { ItemCardComponent } from '../../shared/item-card/item-card.component';

type SortOrder = 'newest' | 'oldest' | 'title';

@Component({
  selector: 'app-library',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonSearchbar, IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption, IonButton, IonIcon, ItemCardComponent],
  template: `
    <ion-header class="ion-no-border"><ion-toolbar><ion-title>Library</ion-title></ion-toolbar></ion-header>
    <ion-content [fullscreen]="true">
      <main class="page-width content-pad library">
        <ion-searchbar class="sn-search" aria-label="Search saved images" placeholder="Title, tag, merchant, category..." enterkeyhint="search" [debounce]="180" [value]="query()" (ionInput)="setQuery($event)" />
        <ion-segment class="pill" [value]="type()" (ionChange)="setType($event)" aria-label="Filter by image type">
          <ion-segment-button value="all"><ion-label>All</ion-label></ion-segment-button>
          <ion-segment-button value="screenshot"><ion-label>Screenshots</ion-label></ion-segment-button>
          <ion-segment-button value="receipt"><ion-label>Receipts</ion-label></ion-segment-button>
        </ion-segment>

        <section class="filter-row" aria-label="Library filters">
          <ion-select class="filter-select" aria-label="Category" interface="popover" [value]="category()" (ionChange)="setCategory($event)">
            <ion-select-option value="all">All categories</ion-select-option>
            @for (name of categories.all(); track name) { <ion-select-option [value]="name">{{ name }}</ion-select-option> }
          </ion-select>
          <ion-select class="filter-select" aria-label="Sort order" interface="popover" [value]="sort()" (ionChange)="setSort($event)">
            <ion-select-option value="newest">Newest first</ion-select-option>
            <ion-select-option value="oldest">Oldest first</ion-select-option>
            <ion-select-option value="title">Title A-Z</ion-select-option>
          </ion-select>
          <button type="button" class="fav-toggle" [class.is-on]="favoriteOnly()" [attr.aria-pressed]="favoriteOnly()" (click)="toggleFavorites()">
            <ion-icon [name]="favoriteOnly() ? 'star' : 'star-outline'" aria-hidden="true" /> Favorites
          </button>
        </section>

        <div class="results-bar">
          <strong class="num" aria-live="polite">{{ results().length }} {{ results().length === 1 ? 'item' : 'items' }}</strong>
          @if (hasFilters()) {
            <ion-button animate.enter="enter-fade" animate.leave="leave-fade" fill="clear" size="small" (click)="clearFilters()"><ion-icon slot="start" name="close-circle" />Clear filters</ion-button>
          }
        </div>

        @if (results().length) {
          @for (group of groups(); track group.key) {
            <section class="month-group" [attr.aria-label]="group.label || 'Results'">
              @if (group.label) {
                <header class="month-header">
                  <h2>{{ group.label }}</h2>
                  <span class="num">
                    {{ group.items.length }} {{ group.items.length === 1 ? 'item' : 'items' }}
                    @if (group.receipts; as receipts) { · {{ receipts.total }}@if (receipts.otherCurrencies) {+} }
                  </span>
                </header>
              }
              <div class="item-grid">
                @for (item of group.items; track item.id; let i = $index) {
                  <app-item-card [item]="item" animate.enter="enter-card" [style.--i]="i" />
                }
              </div>
            </section>
          }
        } @else if (store.ready()) {
          <section class="empty-state" animate.enter="enter-fade">
            <div class="empty-art" aria-hidden="true">
              <span class="drift-doc drift-doc--shot"></span>
              <span class="drift-doc drift-doc--receipt"></span>
              <span class="drift-doc drift-doc--receipt"></span>
            </div>
            <h2>{{ store.items().length ? 'Nothing matches' : 'Your library is empty' }}</h2>
            <p>{{ store.items().length ? 'Try clearing a filter or searching for something else.' : 'Tap the Add button to save your first important image.' }}</p>
            @if (store.items().length) { <ion-button (click)="clearFilters()">Clear filters</ion-button> }
          </section>
        }
      </main>
    </ion-content>
  `,
})
export class LibraryPage implements OnInit {
  protected readonly store = inject(ItemStore);
  protected readonly categories = inject(CategoryStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly query = signal('');
  protected readonly type = signal<'all' | ItemType>('all');
  protected readonly category = signal('all');
  protected readonly sort = signal<SortOrder>('newest');
  protected readonly favoriteOnly = signal(false);
  protected readonly hasFilters = computed(() => Boolean(this.query().trim()) || this.type() !== 'all' || this.category() !== 'all' || this.favoriteOnly());
  protected readonly results = computed(() => this.sortItems(this.store.items().filter((item) =>
    (this.type() === 'all' || item.type === this.type()) &&
    (this.category() === 'all' || item.category === this.category()) &&
    (!this.favoriteOnly() || item.isFavorite) && matchesQuery(item, this.query()),
  )));
  /** Date sorts are split into months; title sort is one unlabeled group. */
  protected readonly groups = computed<MonthGroup[]>(() => this.sort() === 'title'
    ? [{ key: 'all', label: '', items: this.results(), receipts: null }]
    : groupByMonth(this.results()));

  constructor() {
    addIcons({ closeCircle, star, starOutline });
    // Ionic keeps this tab page alive, so read filters on every URL change, not just on init.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.applyParams(params));
  }

  ngOnInit(): void {
    void this.store.load();
  }

  setQuery(event: Event): void { this.query.set(String((event as CustomEvent).detail.value ?? '')); this.syncUrl(); }
  setType(event: Event): void { this.type.set(((event as CustomEvent).detail.value ?? 'all') as 'all' | ItemType); this.syncUrl(); }
  setCategory(event: Event): void { this.category.set(String((event as CustomEvent).detail.value ?? 'all')); this.syncUrl(); }
  setSort(event: Event): void { this.sort.set(((event as CustomEvent).detail.value ?? 'newest') as SortOrder); this.syncUrl(); }
  toggleFavorites(): void { this.favoriteOnly.update((value) => !value); this.syncUrl(); }
  clearFilters(): void { this.query.set(''); this.type.set('all'); this.category.set('all'); this.favoriteOnly.set(false); this.syncUrl(); }

  private applyParams(params: ParamMap): void {
    const type = params.get('type');
    const sort = params.get('sort');
    this.query.set(params.get('q') ?? '');
    this.type.set(type === 'receipt' || type === 'screenshot' ? type : 'all');
    this.category.set(params.get('category') ?? 'all');
    this.favoriteOnly.set(params.get('favorite') === 'true');
    this.sort.set(sort === 'oldest' || sort === 'title' ? sort : 'newest');
  }

  /** Keeps the URL in step with the filters so Home shortcuts and tab switches restore them. */
  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: this.query() || null,
        type: this.type() === 'all' ? null : this.type(),
        category: this.category() === 'all' ? null : this.category(),
        favorite: this.favoriteOnly() || null,
        sort: this.sort() === 'newest' ? null : this.sort(),
      },
    });
  }

  private sortItems(items: SavedItem[]): SavedItem[] {
    const order = this.sort();
    if (order === 'title') {
      const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
      return items.map((item) => ({ item, title: displayTitle(item) }))
        .sort((a, b) => collator.compare(a.title, b.title))
        .map(({ item }) => item);
    }
    return [...items].sort((a, b) => order === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  }
}
