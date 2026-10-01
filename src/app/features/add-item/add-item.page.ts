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
import { checkmarkCircle, cloudUploadOutline, phonePortraitOutline, receiptOutline, swapHorizontalOutline } from 'ionicons/icons';
import { ItemType, SavedItem } from '../../core/models/saved-item';
import { CategoryStore } from '../../core/services/category.store';
import { ImageStorageService, SelectedImage } from '../../core/services/image-storage.service';
import { ItemStore } from '../../core/services/item.store';
import { injectGoBack } from '../../core/utils/navigation';

const LAST_CURRENCY_KEY = 'snapsort.currency.last';

@Component({
  selector: 'app-add-item',
  imports: [ReactiveFormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon, IonItem, IonInput, IonTextarea, IonSelect, IonSelectOption, IonNote, IonSpinner],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" text="Cancel" /></ion-buttons>
        <ion-title>{{ existing() ? 'Edit details' : 'Add image' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <main class="page-width content-pad add-layout">
        <section>
          @if (selected(); as image) {
            <button class="preview" type="button" (click)="pickImage()" aria-label="Change selected image">
              <img [src]="image.sourceUrl" alt="Selected image preview" />
              @for (key of [scanKey()]; track key) { @if (key) { <span class="preview-scan" aria-hidden="true"></span> } }
              <span class="preview-change"><ion-icon name="swap-horizontal-outline" aria-hidden="true" />Change image</span>
            </button>
          } @else {
            <button class="picker" type="button" (click)="pickImage()">
              <span class="picker-art" aria-hidden="true">
                <span class="drift-doc drift-doc--shot"></span>
                <span class="drift-doc drift-doc--receipt"></span>
                <span class="picker-icon"><ion-icon name="cloud-upload-outline" /></span>
              </span>
              <strong>Choose a screenshot or receipt</strong>
              <small>JPG, PNG, or WEBP · stays on this device</small>
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
          <ion-button class="save-button" [class.is-saving]="saving()" expand="block" size="large" type="submit" [disabled]="saving() || !selected()">
            @if (saving()) { <ion-spinner name="crescent" slot="start" /> Saving safely... } @else { {{ existing() ? 'Save changes' : 'Save image' }} }
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
  protected readonly selected = signal<SelectedImage | null>(null);
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
    addIcons({ checkmarkCircle, cloudUploadOutline, phonePortraitOutline, receiptOutline, swapHorizontalOutline });
    inject(DestroyRef).onDestroy(() => this.images.release(this.selected()?.sourceUrl));
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
    this.setSelected({
      sourceUrl: await this.images.urlFor(item.imageKey),
      mimeType: item.mimeType,
      extension: item.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg',
    });
  }

  async pickImage(): Promise<void> {
    this.error.set('');
    try {
      const [image] = await this.images.selectImages();
      if (image) {
        this.setSelected(image);
        this.replacementSelected.set(true);
        this.scanKey.update((key) => key + 1);
      }
    } catch (error) {
      if (!String(error).toLowerCase().includes('cancel')) this.error.set('We could not open that image. Please try another one.');
    }
  }

  async save(): Promise<void> {
    const image = this.selected();
    if (!image || this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please check the highlighted fields.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const existing = this.existing();
    let imageKey = existing?.imageKey ?? '';
    let persistedReplacement = false;
    try {
      if (!existing || this.replacementSelected()) {
        imageKey = await this.images.persist(crypto.randomUUID(), image);
        persistedReplacement = true;
      }
      const value = this.form.getRawValue();
      const numericAmount = value.amount === null ? null : Number(value.amount);
      const amount = numericAmount !== null && Number.isFinite(numericAmount)
        ? Math.round(numericAmount * 100)
        : null;
      const isReceipt = value.type === 'receipt';
      const changes = {
        type: value.type,
        imageKey,
        mimeType: image.mimeType,
        category: value.category,
        title: value.title.trim() || null,
        notes: value.notes.trim() || null,
        tags: [...new Set(value.tags.split(',').map((tag) => tag.trim()).filter(Boolean))],
        merchant: isReceipt ? value.merchant.trim() || null : null,
        amountMinor: isReceipt ? amount : null,
        currencyCode: isReceipt && amount !== null ? value.currencyCode : null,
        purchaseDate: isReceipt ? value.purchaseDate || null : null,
        isFavorite: existing?.isFavorite ?? false,
      };
      if (existing) {
        await this.store.update({ ...existing, ...changes });
        if (persistedReplacement) await this.images.remove(existing.imageKey);
      } else {
        await this.store.create(changes);
      }
      if (changes.currencyCode) rememberCurrency(changes.currencyCode);
      const toast = await this.toastController.create({ message: existing ? 'Changes saved' : 'Saved to your library', duration: 1800, position: 'bottom', icon: 'checkmark-circle' });
      await toast.present();
      this.goBackOr(existing ? `/item/${existing.id}` : '/home');
    } catch {
      if (persistedReplacement && imageKey) await this.images.remove(imageKey);
      this.error.set('This image was not saved. Your details are still here so you can try again.');
    } finally {
      this.saving.set(false);
    }
  }

  private setSelected(image: SelectedImage): void {
    const previous = this.selected()?.sourceUrl;
    if (previous !== image.sourceUrl) this.images.release(previous);
    this.selected.set(image);
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
