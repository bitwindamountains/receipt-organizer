import { Component, inject, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToggle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, close, cloudOfflineOutline, folderOpenOutline, imagesOutline, lockClosed, sparklesOutline, trashOutline } from 'ionicons/icons';
import { CategoryStore } from '../../core/services/category.store';
import { ImageStorageService } from '../../core/services/image-storage.service';
import { ItemStore } from '../../core/services/item.store';
import { PreferencesStore } from '../../core/services/preferences.store';

@Component({
  selector: 'app-settings',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonIcon, IonInput, IonButton, IonToggle],
  template: `
    <ion-header class="ion-no-border"><ion-toolbar><ion-title>Settings</ion-title></ion-toolbar></ion-header>
    <ion-content [fullscreen]="true">
      <main class="page-width content-pad settings">
        <section class="privacy-card reveal">
          <span class="privacy-lock" aria-hidden="true"><ion-icon name="lock-closed" /></span>
          <div><h2>Private by design</h2><p>Your library stays on this device. SnapSort has no ads, account, or tracking SDK.</p></div>
        </section>

        <p class="group-title">Custom categories</p>
        <section class="category-editor reveal" style="--i: 1">
          <ion-input label="New category" labelPlacement="stacked" placeholder="e.g. Taxes" [maxlength]="40" [value]="categoryName()" (ionInput)="categoryName.set($any($event).detail.value ?? '')" (keyup.enter)="addCategory()" />
          <ion-button (click)="addCategory()" [disabled]="!categoryName().trim()"><ion-icon slot="start" name="add" />Add</ion-button>
        </section>
        @if (categoryError()) { <p class="inline-error" role="alert" animate.enter="enter-fade">{{ categoryError() }}</p> }
        @if (categories.custom().length) {
          <div class="category-chips">
            @for (name of categories.custom(); track name) {
              <span class="custom-chip" animate.enter="enter-pop" animate.leave="leave-fade">
                {{ name }}
                <button type="button" (click)="removeCategory(name)" [attr.aria-label]="'Remove ' + name"><ion-icon name="close" aria-hidden="true" /></button>
              </span>
            }
          </div>
        } @else { <p class="helper">Default categories are ready to use. Add your own when you need one.</p> }

        <p class="group-title">Smart features</p>
        <ion-list inset="true" class="reveal" style="--i: 2">
          <ion-item lines="none">
            <ion-icon slot="start" name="sparkles-outline" aria-hidden="true" />
            <ion-toggle [checked]="preferences.autoRead()" (ionChange)="preferences.setAutoRead($any($event).detail.checked)">
              <ion-label><h3>Read receipts automatically</h3><p>Fill in the merchant, total, date, and category when you add an image. Runs on this device.</p></ion-label>
            </ion-toggle>
          </ion-item>
        </ion-list>

        <p class="group-title">Your data</p>
        <ion-list inset="true" class="reveal" style="--i: 3">
          <ion-item lines="full">
            <ion-icon slot="start" name="images-outline" aria-hidden="true" />
            <ion-label><h3>Storage</h3><p>{{ store.items().length }} saved {{ store.items().length === 1 ? 'item' : 'items' }}</p></ion-label>
          </ion-item>
          <ion-item disabled>
            <ion-icon slot="start" name="folder-open-outline" aria-hidden="true" />
            <ion-label>Export or restore backup</ion-label><ion-note slot="end">Coming soon</ion-note>
          </ion-item>
          <ion-item lines="none">
            <ion-icon slot="start" name="cloud-offline-outline" aria-hidden="true" />
            <ion-label><h3>Works offline</h3><p>No account or connection required</p></ion-label>
          </ion-item>
        </ion-list>

        <p class="group-title">Privacy controls</p>
        <ion-list inset="true" class="reveal" style="--i: 3">
          <ion-item button lines="none" (click)="confirmErase()" [detail]="false">
            <ion-icon slot="start" color="danger" name="trash-outline" aria-hidden="true" />
            <ion-label color="danger">Erase all SnapSort data</ion-label>
          </ion-item>
        </ion-list>

        <p class="about">SnapSort 0.2.0 · Made to stay on your device</p>
      </main>
    </ion-content>
  `,
})
export class SettingsPage {
  protected readonly categories = inject(CategoryStore);
  protected readonly store = inject(ItemStore);
  protected readonly preferences = inject(PreferencesStore);
  private readonly images = inject(ImageStorageService);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  protected readonly categoryName = signal('');
  protected readonly categoryError = signal('');

  constructor() {
    addIcons({ add, close, cloudOfflineOutline, folderOpenOutline, imagesOutline, lockClosed, sparklesOutline, trashOutline });
    void this.store.load();
  }

  addCategory(): void {
    if (this.categories.add(this.categoryName())) { this.categoryName.set(''); this.categoryError.set(''); }
    else this.categoryError.set('Use a unique category name.');
  }

  async removeCategory(name: string): Promise<void> {
    if (this.store.items().some((item) => item.category === name)) {
      const toast = await this.toasts.create({ message: 'Move items out of this category before removing it.', duration: 2600 });
      await toast.present();
      return;
    }
    this.categories.remove(name);
  }

  async confirmErase(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Erase all SnapSort data?',
      message: 'Every app-managed image, its details, and your custom categories will be permanently removed. Gallery originals are not affected.',
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Erase everything', role: 'destructive', handler: () => void this.eraseAll() }],
    });
    await alert.present();
  }

  private async eraseAll(): Promise<void> {
    const items = [...this.store.items()];
    await this.store.clear();
    await Promise.all(items.map((item) => this.images.remove(item.imageKey)));
    this.categories.clear();
    const toast = await this.toasts.create({ message: 'SnapSort data erased', duration: 2200 });
    await toast.present();
  }
}
