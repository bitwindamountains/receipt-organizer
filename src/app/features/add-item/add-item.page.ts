import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, checkmarkCircle, close, cloudUploadOutline, phonePortraitOutline, receiptOutline, swapHorizontalOutline } from 'ionicons/icons';
import { ItemType, NewSavedItem, SavedItem } from '../../core/models/saved-item';
import { CategoryStore } from '../../core/services/category.store';
import { ImageStorageService, SelectedImage } from '../../core/services/image-storage.service';
import { ItemStore } from '../../core/services/item.store';
import { injectGoBack } from '../../core/utils/navigation';

const LAST_CURRENCY_KEY = 'snapsort.currency.last';
const MAX_IMAGES = 10;

@Component({
  selector: 'app-add-item',
  imports: [ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon, IonItem, IonInput, IonTextarea, IonSelect, IonSelectOption, IonNote, IonSpinner],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" text="Cancel" /></ion-buttons>
        <ion-title>{{ existing() ? 'Edit details' : isBatch() ? 'Add images' : 'Add image' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <main class="page-width content-pad add-layout">
        <section class="media">
          @if (activeImage(); as image) {
            <button class="preview" type="button" (click)="replaceActive()" [attr.aria-label]="isBatch() ? 'Replace image ' + (activeIndex() + 1) : 'Change selected image'">
              <img [src]="image.sourceUrl" [alt]="isBatch() ? 'Selected image ' + (activeIndex() + 1) + ' of ' + selection().length : 'Selected image preview'" />
              @for (key of [scanKey()]; track key) { @if (key) { <span class="preview-scan" aria-hidden="true"></span> } }
              @if (isBatch()) { <span class="preview-count num" aria-hidden="true">{{ activeIndex() + 1 }} / {{ selection().length }}</span> }
              <span class="preview-change"><ion-icon name="swap-horizontal-outline" aria-hidden="true" />{{ isBatch() ? 'Replace' : 'Change image' }}</span>
            </button>
            @if (!existing()) {
              <div class="filmstrip" role="list" aria-label="Selected images">
                @for (picked of selection(); track picked.sourceUrl; let i = $index) {
                  <div class="film" role="listitem" animate.enter="enter-pop" [class.is-active]="i === activeIndex()">
                    <button type="button" class="film-thumb" (click)="activeIndex.set(i)" [attr.aria-label]="'Show image ' + (i + 1)" [attr.aria-current]="i === activeIndex()">
                      <img [src]="picked.sourceUrl" alt="" />
                    </button>
                    <button type="button" class="film-remove" (click)="removeAt(i)" [disabled]="saving()" [attr.aria-label]="'Remove image ' + (i + 1)"><ion-icon name="close" aria-hidden="true" /></button>
                  </div>
                }
                @if (selection().length < maxImages) {
                  <button type="button" class="film-add" (click)="addMore()" [disabled]="saving()" aria-label="Add more images"><ion-icon name="add" aria-hidden="true" /><span>Add</span></button>
                }
              </div>
              @if (isBatch()) { <p class="batch-note" animate.enter="enter-fade">The details below apply to all {{ selection().length }} images.</p> }
            }
          } @else {
            <button class="picker" type="button" (click)="addMore()">
              <span class="picker-art" aria-hidden="true">
                <span class="drift-doc drift-doc--shot"></span>
                <span class="drift-doc drift-doc--receipt"></span>
                <span class="picker-icon"><ion-icon name="cloud-upload-outline" /></span>
              </span>
              <strong>Choose screenshots or receipts</strong>
              <small>Up to {{ maxImages }} at once · JPG, PNG, or WEBP · stays on this device</small>
            </button>
          }
        </section>

        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <fieldset class="type-toggle" [class.is-receipt]="isReceipt()">
            <legend>What kind of image is this?</legend>
            <div class="type-track">
              <span class="type-thumb" aria-hidden="true"></span>
              <label [class.selected]="!isReceipt()">
                <input type="radio" formControlName="type" value="screenshot" />
                <ion-icon name="phone-portrait-outline" aria-hidden="true" /> Screenshot
              </label>
              <label [class.selected]="isReceipt()">
                <input type="radio" formControlName="type" value="receipt" />
                <ion-icon name="receipt-outline" aria-hidden="true" /> Receipt
              </label>
            </div>
          </fieldset>

          @if (isReceipt()) {
            <div class="form-card receipt-fields" animate.enter="enter-expand" animate.leave="leave-fade">
              <p class="form-card-label">Receipt details</p>
              <ion-item><ion-input formControlName="merchant" label="Merchant (optional)" labelPlacement="stacked" placeholder="Where was this from?" [maxlength]="120" /></ion-item>
              <div class="amount-row">
                <ion-item><ion-select formControlName="currencyCode" label="Currency" labelPlacement="stacked" interface="popover">
                  @for (currency of currencies; track currency) { <ion-select-option [value]="currency">{{ currency }}</ion-select-option> }
                </ion-select></ion-item>
                <ion-item>
                  <ion-input formControlName="amount" label="Amount (optional)" labelPlacement="stacked" inputmode="decimal" type="number" min="0" step="0.01" placeholder="0.00" errorText="Enter an amount of zero or more." />
                </ion-item>
              </div>
              <ion-item lines="none"><ion-input formControlName="purchaseDate" label="Purchase date (optional)" labelPlacement="stacked" type="date" /></ion-item>
            </div>
          }

          <div class="form-card">
            <ion-item>
              <ion-select formControlName="category" label="Category" labelPlacement="stacked" interface="popover">
                @for (category of categories.all(); track category) { <ion-select-option [value]="category">{{ category }}</ion-select-option> }
              </ion-select>
            </ion-item>
            <ion-item><ion-input formControlName="title" label="Title (optional)" labelPlacement="stacked" placeholder="What will help you recognize it?" [maxlength]="120" /></ion-item>
            <ion-item><ion-input formControlName="tags" label="Tags (optional)" labelPlacement="stacked" placeholder="warranty, laptop, work" /><ion-note slot="helper">Separate tags with commas</ion-note></ion-item>
            <ion-item lines="none"><ion-textarea formControlName="notes" label="Notes (optional)" labelPlacement="stacked" [autoGrow]="true" [maxlength]="1000" /></ion-item>
          </div>

          @if (error()) { <p class="form-error" role="alert" animate.enter="enter-fade">{{ error() }}</p> }
          @if (progress(); as p) {
            <div class="save-progress" role="progressbar" aria-label="Saving images" [attr.aria-valuenow]="p.done" aria-valuemin="0" [attr.aria-valuemax]="p.total">
              <span [style.--p]="p.done / p.total"></span>
            </div>
          }
          <ion-button class="save-button" [class.is-saving]="saving()" expand="block" size="large" type="submit" [disabled]="saving() || !selection().length">
            @if (saving()) {
              <ion-spinner name="crescent" slot="start" />
              @if (progress(); as p) { Saving {{ p.done + 1 }} of {{ p.total }}... } @else { Saving safely... }
            } @else {
              {{ existing() ? 'Save changes' : isBatch() ? 'Save ' + selection().length + ' images' : 'Save image' }}
            }
          </ion-button>
        </form>
      </main>
    </ion-content>
  `,
})
export class AddItemPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly images = inject(ImageStorageService);
  private readonly store = inject(ItemStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastController = inject(ToastController);
  private readonly goBackOr = injectGoBack();
  protected readonly categories = inject(CategoryStore);

  protected readonly currencies = ['USD', 'PHP', 'EUR', 'GBP', 'CNY', 'JPY', 'AUD', 'CAD'];
  protected readonly maxImages = MAX_IMAGES;
  /** Images to save. Creating can take several at once; editing uses one. */
  protected readonly selection = signal<SelectedImage[]>([]);
  protected readonly activeIndex = signal(0);
  protected readonly activeImage = computed(() => this.selection()[Math.min(this.activeIndex(), this.selection().length - 1)]);
  protected readonly isBatch = computed(() => this.selection().length > 1);
  protected readonly progress = signal<{ done: number; total: number } | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly existing = signal<SavedItem | null>(null);
  /** Changes on each newly picked image so the scan sweep replays. */
  protected readonly scanKey = signal(0);
  private readonly replacementSelected = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    type: ['screenshot' as ItemType, Validators.required],
    category: ['Other', Validators.required],
    title: ['', Validators.maxLength(120)],
    tags: [''],
    notes: ['', Validators.maxLength(1000)],
    merchant: ['', Validators.maxLength(120)],
    amount: [null as number | null, Validators.min(0)],
    currencyCode: [readLastCurrency()],
    purchaseDate: [''],
  });
  private readonly selectedType = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  protected readonly isReceipt = computed(() => this.selectedType() === 'receipt');

  constructor() {
    addIcons({ add, checkmarkCircle, close, cloudUploadOutline, phonePortraitOutline, receiptOutline, swapHorizontalOutline });
    inject(DestroyRef).onDestroy(() => this.selection().forEach((image) => this.images.release(image.sourceUrl)));
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    const item = await this.store.byId(id);
    if (!item) {
      await this.router.navigateByUrl('/library', { replaceUrl: true });
      return;
    }
    this.existing.set(item);
    this.form.setValue({
      type: item.type,
      category: item.category,
      title: item.title ?? '',
      tags: item.tags.join(', '),
      notes: item.notes ?? '',
      merchant: item.merchant ?? '',
      amount: item.amountMinor === null ? null : item.amountMinor / 100,
      currencyCode: item.currencyCode ?? readLastCurrency(),
      purchaseDate: item.purchaseDate ?? '',
    });
    this.selection.set([{
      sourceUrl: await this.images.urlFor(item.imageKey),
      mimeType: item.mimeType,
      extension: item.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg',
    }]);
  }

  /** Adds images to the selection, up to the limit. When editing, replaces the image. */
  async addMore(): Promise<void> {
    const room = this.existing() ? 1 : this.maxImages - this.selection().length;
    const picked = await this.pick(room);
    if (!picked.length) return;
    if (this.existing()) {
      this.replaceAt(0, picked[0]);
      return;
    }
    this.selection.update((images) => [...images, ...picked]);
    this.activeIndex.set(this.selection().length - picked.length);
    this.scanKey.update((key) => key + 1);
  }

  /** Swaps the image shown in the preview for a new one. */
  async replaceActive(): Promise<void> {
    const [image] = await this.pick(1);
    if (image) this.replaceAt(this.activeIndex(), image);
  }

  removeAt(index: number): void {
    const removed = this.selection()[index];
    if (!removed) return;
    this.images.release(removed.sourceUrl);
    this.selection.update((images) => images.filter((_, i) => i !== index));
    const last = Math.max(0, this.selection().length - 1);
    this.activeIndex.update((active) => Math.min(active > index ? active - 1 : active, last));
  }

  private replaceAt(index: number, image: SelectedImage): void {
    const previous = this.selection()[index];
    if (previous && previous.sourceUrl !== image.sourceUrl) this.images.release(previous.sourceUrl);
    this.selection.update((images) => (images.length ? images.map((candidate, i) => (i === index ? image : candidate)) : [image]));
    if (this.existing()) this.replacementSelected.set(true);
    this.scanKey.update((key) => key + 1);
  }

  private async pick(limit: number): Promise<SelectedImage[]> {
    this.error.set('');
    if (limit < 1) return [];
    try {
      return await this.images.selectImages(limit);
    } catch (error) {
      if (!String(error).toLowerCase().includes('cancel')) this.error.set('We could not open that image. Please try another one.');
      return [];
    }
  }

  async save(): Promise<void> {
    if (!this.selection().length || this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please check the highlighted fields.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const existing = this.existing();
      if (existing) await this.saveEdit(existing);
      else await this.saveNew();
    } finally {
      this.saving.set(false);
      this.progress.set(null);
    }
  }

  private async saveEdit(existing: SavedItem): Promise<void> {
    const image = this.selection()[0];
    let imageKey = existing.imageKey;
    let persistedReplacement = false;
    try {
      if (this.replacementSelected()) {
        imageKey = await this.images.persist(crypto.randomUUID(), image);
        persistedReplacement = true;
      }
      await this.store.update({ ...existing, ...this.details(), imageKey, mimeType: image.mimeType });
      if (persistedReplacement) await this.images.remove(existing.imageKey);
      await this.finish('Changes saved', `/item/${existing.id}`);
    } catch {
      if (persistedReplacement) await this.images.remove(imageKey).catch(() => undefined);
      this.error.set('Your changes were not saved. Your details are still here so you can try again.');
    }
  }

  /** Saves each image in turn. Images that fail stay selected so they can be retried. */
  private async saveNew(): Promise<void> {
    const queue = this.selection();
    const details = this.details();
    const failed: SelectedImage[] = [];
    let saved = 0;
    for (const image of queue) {
      this.progress.set(queue.length > 1 ? { done: saved + failed.length, total: queue.length } : null);
      let imageKey = '';
      try {
        imageKey = await this.images.persist(crypto.randomUUID(), image);
        await this.store.create({ ...details, imageKey, mimeType: image.mimeType });
        this.images.release(image.sourceUrl);
        saved += 1;
      } catch {
        if (imageKey) await this.images.remove(imageKey).catch(() => undefined);
        failed.push(image);
      }
    }
    this.selection.set(failed);
    this.activeIndex.set(0);
    if (!failed.length) {
      await this.finish(saved === 1 ? 'Saved to your library' : `${saved} images saved to your library`, '/home');
    } else if (saved) {
      const rest = failed.length === 1 ? 'One image was not saved and is' : `${failed.length} images were not saved and are`;
      this.error.set(`Saved ${saved} of ${queue.length}. ${rest} still here so you can try again.`);
    } else {
      this.error.set(queue.length === 1
        ? 'This image was not saved. Your details are still here so you can try again.'
        : 'These images were not saved. Your details are still here so you can try again.');
    }
  }

  /** The form values as item fields, shared by every image being saved. */
  private details(): Omit<NewSavedItem, 'imageKey' | 'mimeType'> {
    const value = this.form.getRawValue();
    const numericAmount = value.amount === null ? null : Number(value.amount);
    const amount = numericAmount !== null && Number.isFinite(numericAmount) ? Math.round(numericAmount * 100) : null;
    const isReceipt = value.type === 'receipt';
    return {
      type: value.type,
      category: value.category,
      title: value.title.trim() || null,
      notes: value.notes.trim() || null,
      tags: [...new Set(value.tags.split(',').map((tag) => tag.trim()).filter(Boolean))],
      merchant: isReceipt ? value.merchant.trim() || null : null,
      amountMinor: isReceipt ? amount : null,
      currencyCode: isReceipt && amount !== null ? value.currencyCode : null,
      purchaseDate: isReceipt ? value.purchaseDate || null : null,
      isFavorite: this.existing()?.isFavorite ?? false,
    };
  }

  private async finish(message: string, fallback: string): Promise<void> {
    const currency = this.details().currencyCode;
    if (currency) rememberCurrency(currency);
    const toast = await this.toastController.create({ message, duration: 1800, position: 'bottom', icon: 'checkmark-circle' });
    await toast.present();
    this.goBackOr(fallback);
  }
}

function readLastCurrency(): string {
  try {
    return localStorage.getItem(LAST_CURRENCY_KEY) || 'USD';
  } catch {
    return 'USD';
  }
}

function rememberCurrency(code: string): void {
  try {
    localStorage.setItem(LAST_CURRENCY_KEY, code);
  } catch {
    // Not critical; the default currency is used next time.
  }
}
