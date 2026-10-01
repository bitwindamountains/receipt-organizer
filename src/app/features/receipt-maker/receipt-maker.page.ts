import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, bagHandleOutline, checkmarkCircle, closeCircle, shareSocialOutline, storefrontOutline } from 'ionicons/icons';
import { suggestCategory } from '../../core/ocr/receipt-parser';
import { BusinessProfileStore, RECEIPT_ACCENTS } from '../../core/receipts/business-profile.store';
import { ReceiptDraft, ReceiptLine, ReceiptMode, filledLines, formatMinorAmount, receiptNotes, receiptTotals } from '../../core/receipts/receipt-draft';
import { renderReceipt } from '../../core/receipts/receipt-renderer';
import { CategoryStore } from '../../core/services/category.store';
import { ImageStorageService } from '../../core/services/image-storage.service';
import { ItemStore } from '../../core/services/item.store';
import { PreferencesStore } from '../../core/services/preferences.store';
import { ReplayAnimationDirective } from '../../shared/replay-animation.directive';

const PAYMENTS = ['Cash', 'GCash', 'Maya', 'Card', 'Bank transfer'];
const CURRENCIES = ['USD', 'PHP', 'EUR', 'GBP', 'CNY', 'JPY', 'AUD', 'CAD'];
const SALES_CATEGORY = 'Sales';

const blankLine = (): ReceiptLine => ({ description: '', quantity: 1, price: 0 });

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-receipt-maker',
  imports: [DatePipe, ReplayAnimationDirective, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon, IonSpinner],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" text="Cancel" /></ion-buttons>
        <ion-title>Create receipt</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <main class="page-width content-pad maker">
        <fieldset class="type-toggle maker-mode" [class.is-receipt]="mode() === 'sold'">
          <legend class="visually-hidden">Receipt type</legend>
          <div class="type-track">
            <span class="type-thumb" aria-hidden="true"></span>
            <label [class.selected]="mode() === 'bought'">
              <input type="radio" name="mode" value="bought" [checked]="mode() === 'bought'" (change)="setMode('bought')" />
              <ion-icon name="bag-handle-outline" aria-hidden="true" /> I bought
            </label>
            <label [class.selected]="mode() === 'sold'">
              <input type="radio" name="mode" value="sold" [checked]="mode() === 'sold'" (change)="setMode('sold')" />
              <ion-icon name="storefront-outline" aria-hidden="true" /> I sold
            </label>
          </div>
        </fieldset>
        <p class="maker-hint">{{ mode() === 'bought' ? 'Record a purchase that came without a receipt.' : 'Make a receipt to send your customer. A copy stays in your library.' }}</p>

        <div class="maker-grid">
          <!-- Live preview mirrors the image that gets saved. -->
          <section class="receipt-preview-wrap" aria-label="Receipt preview">
            <div class="receipt-preview" [class.is-sold]="mode() === 'sold'" [style.--accent]="accent()">
              <h2 class="rp-title">{{ issuerTitle() }}</h2>
              @if (mode() === 'sold' ? businessDetails().trim() : true) {
                <p class="rp-sub">{{ mode() === 'sold' ? businessDetails() : 'Purchase record' }}</p>
              }
              <p class="rp-kind">{{ mode() === 'sold' ? 'Official receipt' : 'Receipt' }}</p>
              <div class="rp-row"><span>{{ mode() === 'sold' ? 'No. ' + number() : 'Date' }}</span><span>{{ date() | date: 'mediumDate' }}</span></div>
              @if (mode() === 'sold' && customer().trim()) { <div class="rp-row"><span>Customer</span><strong>{{ customer() }}</strong></div> }
              @if (payment()) { <div class="rp-row"><span>Paid via</span><strong>{{ payment() }}</strong></div> }
              <div class="rp-rule"></div>
              @for (line of previewLines(); track $index; let i = $index) {
                <div class="rp-line" animate.enter="enter-fade">
                  <span class="rp-desc">{{ line.description.trim() || 'Item' }}</span>
                  <span class="num">{{ money(totals().lineTotals[i]) }}</span>
                  <small class="num">{{ line.quantity }} × {{ money(toMinor(line.price)) }}</small>
                </div>
              } @empty {
                <p class="rp-empty">Your items will appear here</p>
              }
              <div class="rp-rule"></div>
              @if (totals().discount) {
                <div class="rp-row"><span>Subtotal</span><span class="num">{{ money(totals().subtotal) }}</span></div>
                <div class="rp-row"><span>Discount</span><span class="num">−{{ money(totals().discount) }}</span></div>
              }
              <div class="rp-total">
                <span>Total</span>
                <strong class="num" [appReplay]="totals().total">{{ money(totals().total) }}</strong>
              </div>
              @if (notes().trim()) { <div class="rp-rule"></div><p class="rp-notes">{{ notes() }}</p> }
              <p class="rp-footer">Made with SnapSort</p>
            </div>
          </section>

          <section class="maker-form">
            @if (mode() === 'sold') {
              <div class="form-card maker-card" animate.enter="enter-expand">
                <p class="form-card-label">Your business</p>
                <label class="field"><span>Business name</span><input [value]="businessName()" (input)="businessName.set(value($event))" placeholder="e.g. Rosa's Kakanin" maxlength="60" /></label>
                <label class="field"><span>Address or contact (optional)</span><input [value]="businessDetails()" (input)="businessDetails.set(value($event))" placeholder="Brgy. San Roque · 0917 123 4567" maxlength="90" /></label>
                <div class="field">
                  <span id="accent-label">Brand color</span>
                  <div class="swatches" role="radiogroup" aria-labelledby="accent-label">
                    @for (color of accents; track color) {
                      <button type="button" class="swatch" role="radio" [attr.aria-checked]="accent() === color" [attr.aria-label]="'Color ' + color" [style.--swatch]="color" (click)="accent.set(color)"></button>
                    }
                  </div>
                </div>
              </div>
            }

            <div class="form-card maker-card">
              <p class="form-card-label">Details</p>
              @if (mode() === 'bought') {
                <label class="field"><span>Store or seller</span><input [value]="storeName()" (input)="storeName.set(value($event))" placeholder="e.g. Aling Nena's Store" maxlength="60" /></label>
              } @else {
                <div class="field-row">
                  <label class="field"><span>Customer (optional)</span><input [value]="customer()" (input)="customer.set(value($event))" placeholder="Name" maxlength="60" /></label>
                  <label class="field field--short"><span>Receipt no.</span><input [value]="number()" (input)="number.set(value($event))" maxlength="16" /></label>
                </div>
              }
              <div class="field-row">
                <label class="field"><span>Date</span><input type="date" [value]="date()" (input)="date.set(value($event))" /></label>
                <label class="field field--short"><span>Currency</span>
                  <select [value]="currencyCode()" (change)="currencyCode.set(value($event))">
                    @for (code of currencies; track code) { <option [value]="code" [selected]="code === currencyCode()">{{ code }}</option> }
                  </select>
                </label>
              </div>
              <div class="field">
                <span id="payment-label">Payment</span>
                <div class="pay-chips" role="radiogroup" aria-labelledby="payment-label">
                  @for (method of payments; track method) {
                    <button type="button" class="pay-chip" role="radio" [attr.aria-checked]="payment() === method" (click)="payment.set(payment() === method ? '' : method)">{{ method }}</button>
                  }
                </div>
              </div>
            </div>

            <div class="form-card maker-card">
              <p class="form-card-label">Items</p>
              @for (line of lines(); track $index; let i = $index) {
                <div class="line-row" animate.enter="enter-expand" animate.leave="leave-fade">
                  <label class="field line-desc"><span class="visually-hidden">Item {{ i + 1 }}</span><input [value]="line.description" (input)="updateLine(i, 'description', value($event))" placeholder="Item {{ i + 1 }}" maxlength="80" /></label>
                  <label class="field line-qty"><span class="visually-hidden">Quantity</span><input type="number" inputmode="numeric" min="1" step="1" [value]="line.quantity" (input)="updateLine(i, 'quantity', value($event))" aria-label="Quantity" /></label>
                  <label class="field line-price"><span class="visually-hidden">Price</span><input type="number" inputmode="decimal" min="0" step="0.01" [value]="line.price || ''" (input)="updateLine(i, 'price', value($event))" placeholder="0.00" aria-label="Price" /></label>
                  <button type="button" class="line-remove" (click)="removeLine(i)" [disabled]="lines().length === 1" [attr.aria-label]="'Remove item ' + (i + 1)"><ion-icon name="close-circle" /></button>
                </div>
              }
              <button type="button" class="line-add" (click)="addLine()"><ion-icon name="add" aria-hidden="true" /> Add item</button>
              <label class="field field--short discount"><span>Discount (optional)</span><input type="number" inputmode="decimal" min="0" step="0.01" [value]="discount() || ''" (input)="discount.set(+value($event) || 0)" placeholder="0.00" /></label>
            </div>

            <div class="form-card maker-card">
              <label class="field"><span>{{ mode() === 'sold' ? 'Message (optional)' : 'Notes (optional)' }}</span>
                <textarea rows="2" [value]="notes()" (input)="notes.set(value($event))" [placeholder]="mode() === 'sold' ? 'Thank you for your order!' : 'What was this for?'" maxlength="240"></textarea>
              </label>
              @if (mode() === 'bought') {
                <label class="field"><span>Category</span>
                  <select (change)="categoryChoice.set(value($event))">
                    @for (name of categories.all(); track name) { <option [value]="name" [selected]="name === category()">{{ name }}</option> }
                  </select>
                </label>
              }
            </div>

            @if (error()) { <p class="form-error" role="alert" animate.enter="enter-fade">{{ error() }}</p> }
            <div class="maker-actions">
              <ion-button expand="block" size="large" [fill]="mode() === 'sold' ? 'outline' : 'solid'" [disabled]="saving()" (click)="save(false)">
                @if (saving() && !sharing()) { <ion-spinner name="crescent" slot="start" /> } <ion-icon slot="start" name="checkmark-circle" />Save to library
              </ion-button>
              <ion-button expand="block" size="large" [fill]="mode() === 'sold' ? 'solid' : 'outline'" [disabled]="saving()" (click)="save(true)">
                @if (sharing()) { <ion-spinner name="crescent" slot="start" /> } <ion-icon slot="start" name="share-social-outline" />Save & share
              </ion-button>
            </div>
          </section>
        </div>
      </main>
    </ion-content>
  `,
})
export class ReceiptMakerPage {
  private readonly store = inject(ItemStore);
  private readonly images = inject(ImageStorageService);
  private readonly profiles = inject(BusinessProfileStore);
  private readonly preferences = inject(PreferencesStore);
  private readonly toasts = inject(ToastController);
  private readonly router = inject(Router);
  protected readonly categories = inject(CategoryStore);

  protected readonly payments = PAYMENTS;
  protected readonly currencies = CURRENCIES;
  protected readonly accents = RECEIPT_ACCENTS;

  protected readonly mode = signal<ReceiptMode>('bought');
  protected readonly storeName = signal('');
  protected readonly businessName = signal(this.profiles.profile().name);
  protected readonly businessDetails = signal(this.profiles.profile().details);
  protected readonly accent = signal(this.profiles.profile().accent);
  protected readonly customer = signal('');
  protected readonly number = signal(this.profiles.nextNumber());
  protected readonly date = signal(todayKey());
  protected readonly currencyCode = signal(this.preferences.lastCurrency());
  protected readonly payment = signal('Cash');
  protected readonly lines = signal<ReceiptLine[]>([blankLine()]);
  protected readonly discount = signal(0);
  protected readonly notes = signal('');
  protected readonly categoryChoice = signal('');
  protected readonly saving = signal(false);
  protected readonly sharing = signal(false);
  protected readonly error = signal('');

  protected readonly previewLines = computed(() => filledLines(this.lines()));
  protected readonly totals = computed(() => receiptTotals(this.previewLines(), this.discount()));
  protected readonly issuerTitle = computed(() =>
    (this.mode() === 'sold' ? this.businessName() : this.storeName()).trim() || (this.mode() === 'sold' ? 'Your business' : 'Purchase'),
  );
  /** The user's pick, or a guess from the store name and items. */
  protected readonly category = computed(() => {
    const chosen = this.categoryChoice();
    if (chosen) return chosen;
    const text = this.lines().map((line) => line.description).join('\n');
    return suggestCategory(this.storeName().trim() || null, text, 'receipt', this.store.items(), this.categories.all()) ?? 'Other';
  });
  protected readonly draft = computed<ReceiptDraft>(() => ({
    mode: this.mode(),
    issuer: this.mode() === 'sold' ? this.businessName() : this.storeName(),
    issuerDetails: this.mode() === 'sold' ? this.businessDetails() : '',
    customer: this.customer(),
    number: this.number(),
    date: this.date(),
    currencyCode: this.currencyCode(),
    payment: this.payment(),
    lines: this.previewLines(),
    discount: this.discount(),
    notes: this.notes(),
    accent: this.accent(),
  }));

  constructor() {
    addIcons({ add, bagHandleOutline, checkmarkCircle, closeCircle, shareSocialOutline, storefrontOutline });
    void this.store.load();
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected money(minor: number): string {
    return formatMinorAmount(minor, this.currencyCode());
  }

  protected toMinor(value: number): number {
    return Math.round((value || 0) * 100);
  }

  setMode(mode: ReceiptMode): void {
    this.mode.set(mode);
    this.error.set('');
  }

  addLine(): void {
    this.lines.update((lines) => [...lines, blankLine()]);
  }

  removeLine(index: number): void {
    this.lines.update((lines) => (lines.length > 1 ? lines.filter((_, i) => i !== index) : lines));
  }

  updateLine(index: number, field: keyof ReceiptLine, raw: string): void {
    const value = field === 'description' ? raw : Math.max(0, Number(raw) || 0);
    this.lines.update((lines) => lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  }

  private async shareSaved(imageKey: string, fileName: string): Promise<void> {
    try {
      await this.images.share(imageKey, fileName);
    } catch (error) {
      if (String(error).toLowerCase().includes('cancel')) return;
      const toast = await this.toasts.create({ message: "Saved, but sharing didn't open. Use Share on the receipt.", duration: 2600 });
      await toast.present();
    }
  }

  async save(share: boolean): Promise<void> {
    if (this.saving()) return;
    const draft = this.draft();
    const totals = this.totals();
    if (!draft.lines.length || totals.subtotal === 0) {
      this.error.set('Add at least one item with a price.');
      return;
    }
    if (draft.mode === 'sold' && !draft.issuer.trim()) {
      this.error.set('Add your business name so your customer knows who the receipt is from.');
      return;
    }
    this.error.set('');
    this.saving.set(true);
    this.sharing.set(share);
    let sourceUrl = '';
    try {
      const blob = await renderReceipt(draft);
      sourceUrl = URL.createObjectURL(blob);
      const imageKey = await this.images.persist(crypto.randomUUID(), { sourceUrl, mimeType: 'image/png', extension: 'png' });
      const sold = draft.mode === 'sold';
      if (sold) this.categories.add(SALES_CATEGORY);
      const item = await this.store.create({
        type: 'receipt',
        imageKey,
        mimeType: 'image/png',
        title: sold ? (draft.customer.trim() ? `Sale to ${draft.customer.trim()}` : `Sale #${draft.number}`) : null,
        notes: receiptNotes(draft) || null,
        category: sold ? SALES_CATEGORY : this.category(),
        tags: sold ? ['sale', `receipt ${draft.number}`] : ['created'],
        merchant: draft.issuer.trim() || null,
        amountMinor: totals.total,
        currencyCode: draft.currencyCode,
        purchaseDate: draft.date || null,
        isFavorite: false,
        flow: sold ? 'income' : 'expense',
        warrantyUntil: null,
      });
      this.preferences.rememberCurrency(draft.currencyCode);
      if (sold) {
        this.profiles.save({ name: draft.issuer.trim(), details: draft.issuerDetails.trim(), accent: draft.accent });
        this.profiles.recordNumber(draft.number);
      }
      const toast = await this.toasts.create({ message: sold ? 'Receipt saved to your sales' : 'Purchase saved to your library', duration: 1800, icon: 'checkmark-circle' });
      await toast.present();
      // Show the saved receipt first, then open the share sheet over it. The receipt is
      // already saved, so a sharing problem must not read as a failed save.
      await this.router.navigate(['/item', item.id], { replaceUrl: true });
      if (share) void this.shareSaved(imageKey, `Receipt ${draft.number || draft.date}.png`);
    } catch {
      this.error.set('The receipt was not saved. Please try again.');
    } finally {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      this.saving.set(false);
      this.sharing.set(false);
    }
  }
}
