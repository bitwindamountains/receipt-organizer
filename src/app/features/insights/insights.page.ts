import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowDown, arrowUp, chevronBack, chevronForward, gridOutline, receiptOutline, storefrontOutline, trophyOutline } from 'ionicons/icons';
import { ItemStore } from '../../core/services/item.store';
import { availableMonths, buildInsights, monthKeyOf, monthLabel, primaryCurrency, shiftMonth } from '../../core/utils/insights';
import { AmbientBackdropComponent } from '../../shared/ambient-backdrop/ambient-backdrop.component';
import { CountUpDirective } from '../../shared/count-up.directive';

// Column chart geometry, in SVG user units.
const CHART = { width: 340, height: 180, left: 44, right: 8, top: 22, bottom: 26, maxBar: 24 };

interface Column {
  key: string;
  label: string;
  amount: number;
  x: number;
  width: number;
  y: number;
  path: string;
  bandX: number;
  bandWidth: number;
  center: number;
  selected: boolean;
}

@Component({
  selector: 'app-insights',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, RouterLink, AmbientBackdropComponent, CountUpDirective],
  template: `
    <ion-header class="ion-no-border"><ion-toolbar><ion-title>Insights</ion-title></ion-toolbar></ion-header>
    <ion-content [fullscreen]="true">
      <app-ambient-backdrop class="insights-ambient" />
      <main class="page-width content-pad insights">
        @if (!currency()) {
          <section class="empty-state reveal">
            <div class="empty-art" aria-hidden="true">
              <span class="drift-doc drift-doc--receipt"></span>
              <span class="drift-doc drift-doc--receipt"></span>
              <span class="drift-doc drift-doc--receipt"></span>
            </div>
            <h2>Your spending, at a glance</h2>
            <p>Add receipts with an amount and SnapSort charts where your money goes each month. Everything is worked out on this device.</p>
            <ion-button routerLink="/add" size="large">Add a receipt</ion-button>
          </section>
        } @else if (insights(); as data) {
          <!-- One filter for the whole page: the month. -->
          <nav class="month-switcher reveal" aria-label="Choose month">
            <button type="button" (click)="step(1)" [disabled]="!hasOlder()" aria-label="Previous month"><ion-icon name="chevron-back" /></button>
            <strong aria-live="polite">{{ monthTitle() }}</strong>
            <button type="button" (click)="step(-1)" [disabled]="!hasNewer()" aria-label="Next month"><ion-icon name="chevron-forward" /></button>
          </nav>

          <section class="hero-spend reveal" style="--i: 1">
            <p class="hero-label">Spent in {{ monthName() }}</p>
            <p class="hero-figure" [appCountUp]="data.spent" [countFormat]="money"></p>
            <div class="hero-meta">
              @if (data.change !== null) {
                <span class="delta" [class.delta--up]="data.change > 0" [class.delta--down]="data.change < 0">
                  <ion-icon [name]="data.change > 0 ? 'arrow-up' : 'arrow-down'" aria-hidden="true" />
                  {{ percent(data.change) }} {{ data.change > 0 ? 'more' : 'less' }} than {{ previousName() }}
                </span>
              } @else {
                <span class="delta">Nothing to compare with {{ previousName() }}</span>
              }
              <span class="hero-count">{{ data.receiptCount }} {{ data.receiptCount === 1 ? 'receipt' : 'receipts' }}</span>
            </div>
          </section>

          <section class="kpi-row" aria-label="Month summary">
            <div class="kpi reveal" style="--i: 2"><span class="kpi-icon"><ion-icon name="receipt-outline" aria-hidden="true" /></span><span class="kpi-label">Average receipt</span><strong>{{ money(data.average) }}</strong></div>
            <a class="kpi reveal" style="--i: 3" [routerLink]="data.biggest ? ['/item', data.biggest.id] : null" [class.is-static]="!data.biggest">
              <span class="kpi-icon kpi-icon--accent"><ion-icon name="trophy-outline" aria-hidden="true" /></span>
              <span class="kpi-label">Biggest</span>
              <strong>{{ data.biggest ? money(data.biggest.amount) : '—' }}</strong>
              @if (data.biggest) { <small>{{ data.biggest.title }}</small> }
            </a>
            @if (data.income.count) {
              <div class="kpi reveal" style="--i: 4"><span class="kpi-icon kpi-icon--gold"><ion-icon name="storefront-outline" aria-hidden="true" /></span><span class="kpi-label">Sales</span><strong>{{ money(data.income.amount) }}</strong><small>{{ data.income.count }} {{ data.income.count === 1 ? 'receipt' : 'receipts' }} issued</small></div>
            }
          </section>

          <section class="chart-card reveal" style="--i: 4">
            <header class="chart-head">
              <div><h2>Monthly spending</h2><p>Six months to {{ monthName() }}</p></div>
              <button type="button" class="table-toggle" (click)="showTrendTable.set(!showTrendTable())" [attr.aria-pressed]="showTrendTable()"><ion-icon name="grid-outline" aria-hidden="true" />{{ showTrendTable() ? 'Chart' : 'Table' }}</button>
            </header>
            @if (showTrendTable()) {
              <table class="data-table">
                <thead><tr><th scope="col">Month</th><th scope="col">Spent</th></tr></thead>
                <tbody>@for (point of data.trend; track point.key) { <tr [class.is-selected]="point.key === month()"><td>{{ point.label }}</td><td class="num">{{ money(point.amount) }}</td></tr> }</tbody>
              </table>
            } @else {
              <div class="column-chart" (pointerleave)="hovered.set(null)">
                <svg [attr.viewBox]="'0 0 ' + chart.width + ' ' + chart.height" role="img" [attr.aria-label]="trendSummary()">
                  @for (tick of ticks(); track tick.value) {
                    <line class="grid" [attr.x1]="chart.left" [attr.x2]="chart.width - chart.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
                    <text class="tick" [attr.x]="chart.left - 8" [attr.y]="tick.y + 4" text-anchor="end">{{ compact(tick.value) }}</text>
                  }
                  @for (column of columns(); track column.key; let i = $index) {
                    <g class="column" [class.is-selected]="column.selected" [class.is-hovered]="hovered() === i" [style.--i]="i">
                      <path class="bar" [attr.d]="column.path" />
                      <text class="axis-label" [attr.x]="column.center" [attr.y]="chart.height - 8" text-anchor="middle">{{ column.label }}</text>
                      @if (column.selected && column.amount) {
                        <text class="cap-label" [attr.x]="column.center" [attr.y]="column.y - 7" text-anchor="middle">{{ compact(column.amount) }}</text>
                      }
                      <!-- The whole band is the hit target, larger than the bar. -->
                      <rect class="hit" [attr.x]="column.bandX" [attr.y]="chart.top" [attr.width]="column.bandWidth" [attr.height]="chart.height - chart.top"
                        tabindex="0" role="button" [attr.aria-label]="column.label + ': ' + money(column.amount) + '. Show this month'"
                        (pointerenter)="hovered.set(i)" (focus)="hovered.set(i)" (blur)="hovered.set(null)" (click)="select(column.key)" (keydown.enter)="select(column.key)" />
                    </g>
                  }
                  <line class="baseline" [attr.x1]="chart.left" [attr.x2]="chart.width - chart.right" [attr.y1]="baseline" [attr.y2]="baseline" />
                </svg>
                @if (hoveredColumn(); as column) {
                  <div class="chart-tip" [style.left.%]="(column.center / chart.width) * 100" [style.top.%]="(column.y / chart.height) * 100" aria-hidden="true">
                    <strong>{{ money(column.amount) }}</strong><span>{{ column.label }}</span>
                  </div>
                }
              </div>
            }
          </section>

          <section class="chart-card reveal" style="--i: 5">
            <header class="chart-head">
              <div><h2>Where it went</h2><p>By category, {{ monthName() }}</p></div>
            </header>
            @if (data.categories.length) {
              <ol class="bar-list">
                @for (category of data.categories; track category.name; let i = $index) {
                  <li [style.--i]="i">
                    <div class="bar-row"><span class="bar-name">{{ category.name }}</span><span class="bar-value num">{{ money(category.amount) }}</span><span class="bar-share num">{{ percent(category.share) }}</span></div>
                    <span class="bar-track" aria-hidden="true"><span class="bar-fill" [style.--w]="category.amount / data.categories[0].amount"></span></span>
                  </li>
                }
              </ol>
            } @else {
              <p class="chart-empty">No spending recorded in {{ monthName() }}.</p>
            }
          </section>

          @if (data.merchants.length) {
            <section class="chart-card reveal" style="--i: 6">
              <header class="chart-head"><div><h2>Top places</h2><p>Where you spent the most</p></div></header>
              <ol class="merchant-list">
                @for (merchant of data.merchants; track merchant.name; let i = $index) {
                  <li>
                    <span class="merchant-rank num">{{ i + 1 }}</span>
                    <span class="merchant-name">{{ merchant.name }}<small>{{ merchant.count }} {{ merchant.count === 1 ? 'visit' : 'visits' }}</small></span>
                    <strong class="num">{{ money(merchant.amount) }}</strong>
                  </li>
                }
              </ol>
            </section>
          }

          @if (data.otherCurrencyCount) {
            <p class="currency-note">{{ data.otherCurrencyCount }} {{ data.otherCurrencyCount === 1 ? 'receipt' : 'receipts' }} in other currencies {{ data.otherCurrencyCount === 1 ? 'is' : 'are' }} not included in these {{ data.currency }} totals.</p>
          }
        }
      </main>
    </ion-content>
  `,
})
export class InsightsPage {
  protected readonly store = inject(ItemStore);
  protected readonly chart = CHART;
  protected readonly baseline = CHART.height - CHART.bottom;

  private readonly currentMonth = monthKeyOf(new Date());
  protected readonly month = signal(this.currentMonth);
  protected readonly hovered = signal<number | null>(null);
  protected readonly showTrendTable = signal(false);

  protected readonly currency = computed(() => primaryCurrency(this.store.items()));
  protected readonly months = computed(() => availableMonths(this.store.items(), this.currentMonth));
  protected readonly insights = computed(() => {
    const currency = this.currency();
    return currency ? buildInsights(this.store.items(), this.month(), currency) : null;
  });
  private readonly earliest = computed(() => this.months().at(-1) ?? this.currentMonth);
  protected readonly hasOlder = computed(() => this.earliest() < this.month());
  protected readonly hasNewer = computed(() => this.month() < this.currentMonth);
  protected readonly monthName = computed(() => monthLabel(this.month()));
  protected readonly previousName = computed(() => monthLabel(shiftMonth(this.month(), -1)));
  protected readonly monthTitle = computed(() => monthLabel(this.month(), 'long', true));

  /** Three clean gridlines: 0, half, and a rounded maximum. */
  private readonly scaleMax = computed(() => niceCeil(Math.max(0, ...(this.insights()?.trend.map((point) => point.amount) ?? [0]))));
  protected readonly ticks = computed(() => {
    const max = this.scaleMax();
    return [0, max / 2, max].map((value) => ({ value, y: this.yFor(value) }));
  });
  protected readonly columns = computed<Column[]>(() => {
    const trend = this.insights()?.trend ?? [];
    const plotWidth = CHART.width - CHART.left - CHART.right;
    const band = plotWidth / Math.max(trend.length, 1);
    const width = Math.min(CHART.maxBar, band * 0.55);
    return trend.map((point, i) => {
      const bandX = CHART.left + band * i;
      const x = bandX + (band - width) / 2;
      const y = this.yFor(point.amount);
      return { key: point.key, label: point.label, amount: point.amount, x, width, y, path: barPath(x, y, width, this.baseline), bandX, bandWidth: band, center: x + width / 2, selected: point.key === this.month() };
    });
  });
  protected readonly hoveredColumn = computed(() => {
    const index = this.hovered();
    return index === null ? null : this.columns()[index] ?? null;
  });
  protected readonly trendSummary = computed(() => `Monthly spending: ${(this.insights()?.trend ?? []).map((point) => `${point.label} ${this.money(point.amount)}`).join(', ')}`);

  protected readonly money = (minor: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: this.currency() ?? 'USD' }).format(minor / 100);

  constructor() {
    addIcons({ arrowDown, arrowUp, chevronBack, chevronForward, gridOutline, receiptOutline, storefrontOutline, trophyOutline });
    void this.store.load();
  }

  /** +1 goes back a month, -1 forward, staying between the first receipt and now. */
  step(direction: 1 | -1): void {
    const next = shiftMonth(this.month(), -direction);
    if (next <= this.currentMonth && (next >= this.earliest() || next > this.month())) this.select(next);
  }

  select(monthKey: string): void {
    this.month.set(monthKey);
    this.hovered.set(null);
  }

  protected compact(minor: number): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: this.currency() ?? 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
  }

  protected percent(fraction: number): string {
    return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 }).format(Math.abs(fraction));
  }

  private yFor(value: number): number {
    const max = this.scaleMax() || 1;
    return this.baseline - (value / max) * (this.baseline - CHART.top);
  }
}

/** A column with a 4px rounded top and a square base. */
function barPath(x: number, y: number, width: number, base: number): string {
  const height = base - y;
  if (height <= 0) return '';
  const r = Math.min(4, height, width / 2);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${base}Z`;
}

/** Rounds up to 1, 2, 2.5, or 5 times a power of ten (in minor units). */
function niceCeil(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value)!;
  return step * magnitude;
}
