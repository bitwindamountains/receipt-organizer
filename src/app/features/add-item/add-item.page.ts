import { Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
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
  AlertController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, checkmarkCircle, chevronForward, close, cloudUploadOutline, createOutline, phonePortraitOutline, receiptOutline, sparkles, swapHorizontalOutline } from 'ionicons/icons';
import { ItemFlow, ItemType, NewSavedItem, SavedItem } from '../../core/models/saved-item';
import { CategoryStore } from '../../core/services/category.store';
import { ImageStorageService, SelectedImage } from '../../core/services/image-storage.service';
import { ItemStore } from '../../core/services/item.store';
import { CaptureService } from '../../core/capture/capture.service';
import { PreferencesStore } from '../../core/services/preferences.store';
import { ReminderService } from '../../core/services/reminder.service';
import { ReceiptSuggestion, parseReceiptText, suggestCategory } from '../../core/ocr/receipt-parser';
import { TextRecognitionService } from '../../core/ocr/text-recognition.service';
import { parseTransaction } from '../../core/capture/transaction-parser';
import { injectGoBack } from '../../core/utils/navigation';
import { TRANSFERS, displayTitle, findDuplicate, formatAmount, localDateKey, merchantSuggestions } from '../../core/utils/item-display';
import { DiscardGuarded } from '../../core/utils/confirm-discard';
import { monthLabel } from '../../core/utils/insights';
import { ReplayAnimationDirective } from '../../shared/replay-animation.directive';
import { TypedField, detailsForImage } from './batch-details';

type AutoFillField = 'type' | 'category' | 'merchant' | 'amount' | 'currencyCode' | 'purchaseDate' | 'flow' | 'tags' | 'title';
const MAX_IMAGES = 10;

@Component({
  selector: 'app-add-item',
  host: { '(document:paste)': 'onPaste($event)' },
  imports: [ReactiveFormsModule, RouterLink, ReplayAnimationDirective, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonButton, IonIcon, IonItem, IonInput, IonTextarea, IonSelect, IonSelectOption, IonNote, IonSpinner],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" text="Cancel" aria-label="Cancel" /></ion-buttons>
        <ion-title>{{ existing() ? 'Edit details' : isBatch() ? 'Add images' : 'Add image' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <main class="page-width content-pad add-layout">
        <section class="media" [class.is-dragging]="dragging()" (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
          @if (activeImage(); as image) {
            <div class="preview-wrap" [class.is-reading]="reading()">
              <button class="preview" type="button" (click)="replaceActive()" [attr.aria-label]="isBatch() ? 'Replace image ' + (activeIndex() + 1) : 'Change selected image'">
                <img [src]="image.sourceUrl" [alt]="isBatch() ? 'Selected image ' + (activeIndex() + 1) + ' of ' + selection().length : 'Selected image preview'" />
                @if (scanKey() && !reading()) { <span class="preview-scan" [appReplay]="scanKey()" replayClass="is-scanning" aria-hidden="true"></span> }
                @if (reading()) { <span class="preview-scan preview-scan--loop" aria-hidden="true"></span> }
                @if (isBatch()) { <span class="preview-count num" aria-hidden="true">{{ activeIndex() + 1 }} / {{ selection().length }}</span> }
                <span class="preview-change"><ion-icon name="swap-horizontal-outline" aria-hidden="true" />{{ isBatch() ? 'Replace' : 'Change image' }}</span>
              </button>
              @if (canRead(image)) {
                <button type="button" class="autofill-button" (click)="runAutoFill()" [disabled]="reading() || saving()">
                  @if (reading()) { <ion-spinner name="crescent" /> Reading... } @else { <ion-icon name="sparkles" aria-hidden="true" /> {{ autoFilledFrom === image.sourceUrl ? 'Read again' : 'Auto-fill' }} }
                </button>
              }
            </div>
            @if (autoFill(); as fill) {
              <div class="autofill-banner" role="status" animate.enter="enter-fade" animate.leave="leave-fade">
                <span class="autofill-icon" aria-hidden="true"><ion-icon name="sparkles" /></span>
                <div class="autofill-copy">
                  <strong>{{ fill.message }}</strong>
                  @if (fill.summary) { <span>{{ fill.summary }}</span> }
                </div>
                @if (fill.undo) { <button type="button" (click)="undoAutoFill()">Undo</button> }
              </div>
            }
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
              @if (isBatch()) { <p class="batch-note" animate.enter="enter-fade">The details below apply to all {{ selection().length }} images. Store, amount, and date are read from each image unless you type them.</p> }
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
              <!-- Paste and drop need a keyboard and mouse: phones (web or app) never see this hint. -->
              @if (!native && finePointer) { <small class="picker-hint">Or paste a screenshot (Ctrl/⌘+V) or drop images here</small> }
            </button>
            @if (!existing()) {
              <a class="create-receipt-link" routerLink="/receipt/new" replaceUrl>
                <ion-icon name="create-outline" aria-hidden="true" />
                <span><strong>No receipt? Create one</strong>Record a cash purchase or make a receipt for a customer</span>
                <ion-icon name="chevron-forward" aria-hidden="true" />
              </a>
            }
          }
        </section>

        <!-- The form appears once there is an image to describe; before that the only question is which image. -->
        @if (selection().length || existing()) {
        <form [formGroup]="form" (ngSubmit)="save()" novalidate animate.enter="enter-fade">
          <fieldset class="type-toggle" [class.is-receipt]="isReceipt()" [class.auto-filled]="filled().has('type')">
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
              <ion-item [class.auto-filled]="filled().has('merchant')"><ion-input formControlName="merchant" label="Merchant (optional)" labelPlacement="stacked" placeholder="Where was this from?" [maxlength]="120" /></ion-item>
              @if (merchantOptions().length) {
                <div class="chip-row form-chips" role="group" aria-label="Merchants you've used">
                  @for (name of merchantOptions(); track name) { <button type="button" class="cat-chip" (click)="pickMerchant(name)">{{ name }}</button> }
                </div>
              }
              <div class="amount-row">
                <ion-item [class.auto-filled]="filled().has('currencyCode')"><ion-select formControlName="currencyCode" label="Currency" labelPlacement="stacked" interface="popover">
                  @for (currency of currencies; track currency) { <ion-select-option [value]="currency">{{ currency }}</ion-select-option> }
                </ion-select></ion-item>
                <ion-item [class.auto-filled]="filled().has('amount')">
                  <ion-input formControlName="amount" label="Amount (optional)" labelPlacement="stacked" inputmode="decimal" type="number" min="0" step="0.01" placeholder="0.00" errorText="Enter an amount of zero or more." />
                </ion-item>
              </div>
              <ion-item [class.auto-filled]="filled().has('flow')">
                <ion-select formControlName="flow" label="Money" labelPlacement="stacked" interface="popover">
                  <ion-select-option value="expense">I paid (counts as spending)</ion-select-option>
                  <ion-select-option value="income">I received (money in)</ion-select-option>
                </ion-select>
                @if (formValue().category === transfers) { <ion-note slot="helper">Transfers aren't counted as spending; Insights shows them on their own.</ion-note> }
              </ion-item>
              <ion-item [class.auto-filled]="filled().has('purchaseDate')"><ion-input formControlName="purchaseDate" label="Purchase date (optional)" labelPlacement="stacked" type="date" /></ion-item>
              @if (showWarranty() || formValue().warrantyUntil) {
                <ion-item lines="none" animate.enter="enter-expand">
                  <ion-input formControlName="warrantyUntil" label="Warranty or return until (optional)" labelPlacement="stacked" type="date" />
                  <ion-note slot="helper">We'll remind you a week before it ends</ion-note>
                </ion-item>
              } @else {
                <button type="button" class="line-add form-add-field" (click)="showWarranty.set(true)"><ion-icon name="add" aria-hidden="true" /> Add a warranty or return date</button>
              }
            </div>
          }

          <div class="form-card">
            <ion-item [class.auto-filled]="filled().has('category')">
              <ion-select formControlName="category" label="Category" labelPlacement="stacked" interface="popover">
                @for (category of categories.all(); track category) { <ion-select-option [value]="category">{{ category }}</ion-select-option> }
              </ion-select>
            </ion-item>
            <ion-item><ion-input formControlName="title" label="Title (optional)" labelPlacement="stacked" placeholder="What will help you recognize it?" [maxlength]="120" /></ion-item>
            <ion-item><ion-input formControlName="tags" label="Tags (optional)" labelPlacement="stacked" placeholder="warranty, laptop, work" /><ion-note slot="helper">Separate tags with commas</ion-note></ion-item>
            <ion-item lines="none"><ion-textarea formControlName="notes" label="Notes (optional)" labelPlacement="stacked" [autoGrow]="true" [maxlength]="1000" /></ion-item>
          </div>

          <!-- Enter in a field still saves; the visible buttons live in the footer. -->
          <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
        </form>
        }
      </main>
    </ion-content>
    @if (selection().length || existing()) {
      <!-- Always in reach: the decision, and anything that should inform it, sits by the thumb, not two screens down. -->
      <ion-footer class="save-bar ion-no-border">
        @if (duplicate(); as dup) {
          <div class="form-note" role="status">
            <span>Looks like you saved this already: <a [routerLink]="['/item', dup.id]">{{ title(dup) }}</a> · {{ amountOf(dup) }}.</span>
            @if (!existing()) { <button type="button" (click)="discardActive()">Discard this one</button> }
          </div>
        }
        @if (error()) { <p class="form-error" role="alert" animate.enter="enter-fade">{{ error() }}</p> }
        @if (progress(); as p) {
          <div class="save-progress" role="progressbar" aria-label="Saving images" [attr.aria-valuenow]="p.done" aria-valuemin="0" [attr.aria-valuemax]="p.total">
            <span [style.--p]="p.done / p.total"></span>
          </div>
        }
        <div class="save-actions">
          <ion-button class="save-button" [class.is-saving]="saving()" expand="block" size="large" (click)="save()" [disabled]="saving() || !selection().length">
            @if (saving()) {
              <ion-spinner name="crescent" slot="start" />
              @if (progress(); as p) { Saving {{ p.done + 1 }} of {{ p.total }}... } @else { Saving safely... }
            } @else {
              {{ existing() ? 'Save changes' : isBatch() ? 'Save ' + selection().length + ' images' : 'Save' }}
            }
          </ion-button>
          @if (!existing() && !isBatch()) {
            <ion-button class="save-button" fill="outline" expand="block" (click)="save(true)" [disabled]="saving() || !selection().length">Save &amp; add next</ion-button>
          }
        </div>
      </ion-footer>
    }
  `,
})
export class AddItemPage implements OnInit, DiscardGuarded {
  private readonly formBuilder = inject(FormBuilder);
  private readonly images = inject(ImageStorageService);
  private readonly store = inject(ItemStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);
  private readonly goBackOr = injectGoBack();
  protected readonly categories = inject(CategoryStore);
  private readonly recognition = inject(TextRecognitionService);
  private readonly preferences = inject(PreferencesStore);
  private readonly reminders = inject(ReminderService);
  private readonly capture = inject(CaptureService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly native = this.capture.native;
  protected readonly dragging = signal(false);

  protected readonly currencies = ['PHP', 'USD', 'EUR', 'GBP', 'CNY', 'JPY', 'AUD', 'CAD'];
  protected readonly maxImages = MAX_IMAGES;
  /** Images to save. Creating can take several at once; editing uses one. */
  protected readonly selection = signal<SelectedImage[]>([]);
  protected readonly activeIndex = signal(0);
  protected readonly activeImage = computed(() => this.selection()[Math.min(this.activeIndex(), this.selection().length - 1)]);
  protected readonly isBatch = computed(() => this.selection().length > 1);
  protected readonly progress = signal<{ done: number; total: number } | null>(null);
  protected readonly saving = signal(false);
  protected readonly reading = signal(false);
  protected readonly autoFill = signal<{ message: string; summary: string; undo?: Partial<FormValue> } | null>(null);
  /** Controls filled by the last auto-fill, for a brief highlight. */
  protected readonly filled = signal<ReadonlySet<AutoFillField>>(new Set());
  private filledTimer?: ReturnType<typeof setTimeout>;
  private readRequest = 0;
  /** The image the form's auto-filled values came from; in a batch they belong to it alone. */
  protected autoFilledFrom: string | null = null;
  protected readonly finePointer = matchMedia('(pointer: fine)').matches;
  protected readonly transfers = TRANSFERS;
  protected readonly showWarranty = signal(false);
  /** Set once saving finished, so the page can leave without asking to discard. */
  private done = false;
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
    currencyCode: [this.preferences.lastCurrency()],
    flow: ['expense' as ItemFlow],
    purchaseDate: [''],
    warrantyUntil: [''],
  });
  private readonly selectedType = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  protected readonly isReceipt = computed(() => this.selectedType() === 'receipt');
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  /** Items saved from this form, so it never warns that a receipt duplicates itself. */
  private readonly savedHere = signal<ReadonlySet<string>>(new Set());
  /** A saved receipt with the same amount and date: warn, but let them save (two coffees on one day happen). */
  protected readonly duplicate = computed(() => {
    const value = this.formValue();
    if (!this.isReceipt() || this.isBatch() || value.amount === null || value.amount === undefined || !value.purchaseDate) return null;
    const amount = Number(value.amount);
    if (!Number.isFinite(amount)) return null;
    const others = this.store.items().filter((item) => !this.savedHere().has(item.id));
    return findDuplicate(others, Math.round(amount * 100), value.purchaseDate, this.existing()?.id);
  });
  /** Past merchants matching what's typed, or the most used ones while the field is empty. */
  protected readonly merchantOptions = computed(() => this.isReceipt() ? merchantSuggestions(this.store.items(), this.formValue().merchant ?? '') : []);
  protected readonly title = displayTitle;
  protected readonly amountOf = formatAmount;

  constructor() {
    addIcons({ add, checkmarkCircle, chevronForward, close, cloudUploadOutline, createOutline, phonePortraitOutline, receiptOutline, sparkles, swapHorizontalOutline });
    inject(DestroyRef).onDestroy(() => this.selection().forEach((image) => this.images.release(image.sourceUrl)));
    // Images shared into Starlog from another app land here.
    effect(() => {
      if (!this.capture.pendingShares().length || this.route.snapshot.paramMap.get('id')) return;
      untracked(() => this.addImages(this.capture.takeShares()));
    });
  }

  async ngOnInit(): Promise<void> {
    // Add can be the first screen (shared from another app, or a reload): the duplicate check,
    // merchant suggestions and learned categories all need the library loaded.
    void this.store.load();
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
      currencyCode: item.currencyCode ?? this.preferences.lastCurrency(),
      flow: item.flow,
      purchaseDate: item.purchaseDate ?? '',
      warrantyUntil: item.warrantyUntil ?? '',
    });
    this.selection.set([{
      fileUri: await this.images.fileUriFor(item.imageKey),
      sourceUrl: await this.images.urlFor(item.imageKey),
      mimeType: item.mimeType,
      extension: item.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg',
    }]);
  }

  /** Adds images to the selection, up to the limit. When editing, replaces the image. */
  async addMore(): Promise<void> {
    const room = this.existing() ? 1 : this.maxImages - this.selection().length;
    this.addImages(await this.pick(room));
  }

  /** Adds picked, shared, pasted, or dropped images, respecting the limit. */
  private addImages(picked: SelectedImage[]): void {
    if (!picked.length) return;
    if (this.existing()) {
      this.replaceAt(0, picked[0]);
      picked.slice(1).forEach((image) => this.images.release(image.sourceUrl));
      return;
    }
    const room = this.maxImages - this.selection().length;
    picked.slice(room).forEach((image) => this.images.release(image.sourceUrl));
    picked = picked.slice(0, room);
    if (!picked.length) return;
    const wasEmpty = !this.selection().length;
    this.selection.update((images) => [...images, ...picked]);
    this.activeIndex.set(this.selection().length - picked.length);
    this.scanKey.update((key) => key + 1);
    if (wasEmpty && this.preferences.autoRead()) void this.runAutoFill();
  }

  /** Paste a screenshot from the clipboard (desktop browsers). Only while this page is showing. */
  onPaste(event: ClipboardEvent): void {
    if (this.host.classList.contains('ion-page-hidden') || this.saving()) return;
    const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    this.addImages(files.map(fromFile));
  }

  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent): void {
    this.dragging.set(false);
    const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    this.addImages(files.map(fromFile));
  }

  protected canRead(image: SelectedImage): boolean {
    return this.recognition.canRead(image);
  }

  /** Reads the image on screen and fills in fields the user hasn't edited. */
  async runAutoFill(): Promise<void> {
    const image = this.activeImage();
    if (!image || this.reading()) return;
    const request = ++this.readRequest;
    this.reading.set(true);
    this.autoFill.set(null);
    try {
      const suggestion = await this.suggestionFor(image);
      if (request !== this.readRequest) return;
      this.autoFilledFrom = image.sourceUrl;
      this.applySuggestion(suggestion);
    } catch {
      if (request === this.readRequest) this.autoFill.set({ message: "Couldn't read this image", summary: 'You can still fill in the details yourself.' });
    } finally {
      if (request === this.readRequest) this.reading.set(false);
    }
  }

  private async suggestionFor(image: SelectedImage): Promise<ReceiptSuggestion> {
    const text = await this.recognition.read(image);
    const suggestion = parseReceiptText(text, { fileName: image.fileName, history: this.store.items(), categories: this.categories.all() });
    // E-wallet receipts ("Sent to JUAN DELA CRUZ"): the person paid is the better merchant.
    const counterparty = parseTransaction({ id: '', packageName: '', title: '', text, postedAt: Date.now() })?.counterparty;
    return counterparty && suggestion.type === 'receipt' ? { ...suggestion, merchant: counterparty } : suggestion;
  }

  /** In a batch, each image keeps its own store, amount, and date (see detailsForImage). */
  private async detailsFor(image: SelectedImage, shared: Omit<NewSavedItem, 'imageKey' | 'mimeType'>, batch: boolean): Promise<Omit<NewSavedItem, 'imageKey' | 'mimeType'>> {
    if (!batch || shared.type !== 'receipt' || image.sourceUrl === this.autoFilledFrom) return shared;
    const controls = this.form.controls;
    const typed = new Set((['merchant', 'amount', 'currencyCode', 'purchaseDate', 'flow'] as TypedField[]).filter((field) => controls[field].dirty));
    const needsReading = typed.size < 5 && this.preferences.autoRead() && this.recognition.canRead(image);
    const own = needsReading ? await this.suggestionFor(image).catch(() => null) : null;
    return detailsForImage(shared, own, typed, controls.currencyCode.value);
  }

  undoAutoFill(): void {
    const undo = this.autoFill()?.undo;
    if (undo) this.form.patchValue(undo);
    this.autoFill.set(null);
    this.filled.set(new Set());
  }

  private applySuggestion(suggestion: ReceiptSuggestion): void {
    const controls = this.form.controls;
    const before = this.form.getRawValue();
    const changes: Partial<FormValue> = {};
    // Never overwrite something the user typed or chose.
    const offer = <K extends AutoFillField>(field: K, value: FormValue[K] | null) => {
      if (value === null || value === '' || controls[field].dirty || before[field] === value) return;
      changes[field] = value;
    };
    offer('type', suggestion.type);
    offer('category', suggestion.category);
    if (suggestion.type === 'receipt') {
      offer('merchant', suggestion.merchant);
      offer('amount', suggestion.amount);
      offer('currencyCode', suggestion.currencyCode);
      offer('purchaseDate', suggestion.purchaseDate);
      offer('flow', suggestion.flow);
      // A transfer's merchant is a person ("Jl…Y B."); a title says what happened.
      const payee = changes.merchant ?? before.merchant;
      if ((changes.category ?? before.category) === TRANSFERS && payee) offer('title', `${(changes.flow ?? before.flow) === 'income' ? 'Received from' : 'Sent to'} ${payee}`);
    }
    if (!before.tags.trim()) offer('tags', suggestion.tags.join(', '));
    const fields = Object.keys(changes) as AutoFillField[];
    if (!fields.length) {
      this.autoFill.set({ message: 'Nothing new to fill in', summary: suggestion.type === 'receipt' ? 'The details already match this receipt.' : 'This looks like a screenshot without receipt details.' });
      return;
    }
    this.form.patchValue(changes);
    const undo = Object.fromEntries(fields.map((field) => [field, before[field]])) as Partial<FormValue>;
    const value = this.form.getRawValue();
    const amount = changes.amount !== undefined && value.amount !== null
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: value.currencyCode }).format(value.amount)
      : null;
    const summary = [
      changes.type ? (changes.type === 'receipt' ? 'Receipt' : 'Screenshot') : null,
      changes.flow === 'income' ? 'Money in' : null,
      changes.merchant ?? null,
      amount,
      changes.purchaseDate ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(changes.purchaseDate)) : null,
      changes.category ?? null,
    ].filter(Boolean).join(' · ');
    this.autoFill.set({ message: 'Filled in from your image', summary, undo });
    this.filled.set(new Set(fields));
    clearTimeout(this.filledTimer);
    this.filledTimer = setTimeout(() => this.filled.set(new Set()), 2400);
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

  async save(again = false): Promise<void> {
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
      else await this.saveNew(again);
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
      await this.finish(`Changes saved${this.countedIn()}`, `/item/${existing.id}`);
    } catch {
      if (persistedReplacement) await this.images.remove(imageKey).catch(() => undefined);
      this.error.set('Your changes were not saved. Your details are still here so you can try again.');
    }
  }

  /** Saves each image in turn. Images that fail stay selected so they can be retried. */
  private async saveNew(again = false): Promise<void> {
    const queue = this.selection();
    const details = this.details();
    const batch = queue.length > 1;
    const failed: SelectedImage[] = [];
    let saved = 0;
    for (const image of queue) {
      this.progress.set(queue.length > 1 ? { done: saved + failed.length, total: queue.length } : null);
      let imageKey = '';
      try {
        const own = await this.detailsFor(image, details, batch);
        imageKey = await this.images.persist(crypto.randomUUID(), image);
        const created = await this.store.create({ ...own, imageKey, mimeType: image.mimeType });
        this.savedHere.update((ids) => new Set(ids).add(created.id));
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
      await this.finish(saved === 1 ? `Saved to your library${this.countedIn()}` : `${saved} images saved to your library`, '/home', again);
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
      flow: isReceipt ? value.flow : (this.existing()?.flow ?? 'expense'),
      warrantyUntil: isReceipt ? value.warrantyUntil || null : null,
    };
  }

  /** " · counted in May 2026" for a receipt dated outside this month, which Insights and Home's total won't show by default. */
  /** Says where the money went, so a receipt that doesn't move this month's spending isn't a mystery. */
  private countedIn(): string {
    const { type, amountMinor, flow, category } = this.details();
    if (type !== 'receipt' || amountMinor === null) return '';
    const month = this.otherMonth();
    const when = month ? ` in ${monthLabel(month, 'long', true)}` : '';
    if (category === TRANSFERS) return ` · a transfer${when}, not counted as spending`;
    if (flow === 'income') return month ? ` · money in${when}` : '';
    return month ? ` · counted${when}` : '';
  }

  /** The YYYY-MM a receipt with an amount counts in, when that isn't this month. */
  private otherMonth(): string | null {
    const { type, amountMinor, purchaseDate } = this.details();
    const month = purchaseDate?.slice(0, 7);
    return type === 'receipt' && amountMinor !== null && month && month !== localDateKey(new Date()).slice(0, 7) ? month : null;
  }

  private async finish(message: string, fallback: string, stay = false): Promise<void> {
    const { currencyCode, warrantyUntil } = this.details();
    if (currencyCode) this.preferences.rememberCurrency(currencyCode);
    // Ask for notification permission only once a reminder is actually wanted.
    if (warrantyUntil) void this.reminders.requestPermission();
    const month = this.otherMonth();
    // A receipt dated in another month doesn't move this month's totals, so offer to show where it went.
    const toast = await this.toastController.create({
      message, duration: month ? 8000 : 2500, position: 'bottom', icon: 'checkmark-circle',
      buttons: month ? [{ text: `See ${monthLabel(month)}`, handler: () => void this.router.navigate(['/insights'], { queryParams: { month } }) }] : undefined,
    });
    await toast.present();
    if (stay) {
      this.startOver();
    } else {
      this.done = true;
      this.goBackOr(fallback);
    }
  }

  /** "Save and add another": an empty form for the next receipt, keeping the currency. */
  private startOver(): void {
    // Batches are usually alike (a pile of receipts, one category): keep type and category too.
    const { type, category } = this.form.getRawValue();
    this.form.reset({ currencyCode: this.preferences.lastCurrency(), type, category });
    this.showWarranty.set(false);
    this.autoFill.set(null);
    this.filled.set(new Set());
    this.autoFilledFrom = null;
    this.savedHere.set(new Set());
    void this.host.querySelector('ion-content')?.scrollToTop(300);
  }

  /** "Discard this one" on the duplicate notice: drop the image on screen, keep any others. */
  discardActive(): void {
    this.removeAt(this.activeIndex());
    if (!this.selection().length) this.startOver();
  }

  /** Cancel, the back arrow or Android back with an image picked or details typed asks first. */
  async confirmLeave(): Promise<boolean> {
    const unsaved = (!this.existing() && this.selection().length > 0) || this.form.dirty || this.replacementSelected();
    if (this.done || this.saving() || !unsaved) return true;
    const alert = await this.alertController.create({
      header: this.existing() ? 'Discard your changes?' : 'Discard this receipt?',
      message: this.existing() ? 'Your edits won\'t be saved.' : 'The image and details won\'t be saved.',
      buttons: [{ text: 'Keep editing', role: 'cancel' }, { text: 'Discard', role: 'destructive', cssClass: 'alert-danger' }],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'destructive';
  }

  /** Fills a merchant used before and, unless a category was chosen, the category used for it last time. */
  pickMerchant(name: string): void {
    const { merchant, category } = this.form.controls;
    merchant.setValue(name);
    merchant.markAsDirty();
    const usual = suggestCategory(name, '', 'receipt', this.store.items(), this.categories.all());
    if (usual && !category.dirty) category.setValue(usual);
  }
}

interface FormValue {
  type: ItemType;
  category: string;
  title: string;
  tags: string;
  notes: string;
  merchant: string;
  amount: number | null;
  currencyCode: string;
  flow: ItemFlow;
  purchaseDate: string;
  warrantyUntil: string;
}

function fromFile(file: File): SelectedImage {
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  return { sourceUrl: URL.createObjectURL(file), mimeType: file.type, extension, fileName: file.name };
}
