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
  IonTitle,
  IonToggle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, albumsOutline, close, cloudOfflineOutline, downloadOutline, flashOutline, folderOpenOutline, imagesOutline, lockClosed, sparklesOutline, trashOutline } from 'ionicons/icons';
import { CategoryStore } from '../../core/services/category.store';
import { ImageStorageService } from '../../core/services/image-storage.service';
import { ItemStore } from '../../core/services/item.store';
import { PreferencesStore } from '../../core/services/preferences.store';
import { CaptureService } from '../../core/capture/capture.service';
import { BusinessProfileStore } from '../../core/receipts/business-profile.store';
import { APP_VERSION, BackupService } from '../../core/backup/backup.service';
import { BackupError } from '../../core/backup/backup-format';

@Component({
  selector: 'app-settings',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonIcon, IonInput, IonButton, IonToggle],
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

        <p class="group-title">Auto-capture</p>
        <ion-list inset="true" class="reveal capture-list" style="--i: 3">
          <ion-item lines="full" [disabled]="!capture.native">
            <ion-icon slot="start" name="flash-outline" aria-hidden="true" />
            <ion-toggle [checked]="capture.status().enabled" (ionChange)="toggleNotifications($event)">
              <ion-label>
                <h3>Capture payment notifications</h3>
                <p>Adds GCash, Maya, and bank payments from their notifications. Read on this device; other notifications are ignored.</p>
                @if (!capture.native) {
                  <p class="capture-state">Available in the Android app</p>
                } @else if (capture.status().enabled && !capture.status().accessGranted) {
                  <p class="capture-state capture-state--warn">Waiting for Notification access</p>
                } @else if (capture.status().enabled) {
                  <p class="capture-state capture-state--on">On · new payments are added automatically</p>
                }
              </ion-label>
            </ion-toggle>
          </ion-item>
          @if (capture.native && capture.status().enabled && !capture.status().accessGranted) {
            <ion-item lines="full" button [detail]="true" (click)="capture.openAccessSettings()">
              <ion-label>Open Notification access settings</ion-label>
            </ion-item>
          }
          <ion-item lines="full" [disabled]="!capture.native && !capture.supportsFolder">
            <ion-icon slot="start" name="albums-outline" aria-hidden="true" />
            <ion-toggle [checked]="preferences.screenshotInbox()" (ionChange)="toggleInbox($event)">
              <ion-label>
                <h3>Screenshot inbox</h3>
                <p>{{ capture.native ? 'Finds new payment screenshots in your gallery and offers to add them.' : 'Watches a folder of screenshots on this computer and offers new payments.' }}</p>
                @if (!capture.native && !capture.supportsFolder) {
                  <p class="capture-state">Needs Chrome or Edge on a computer</p>
                } @else if (!capture.native && preferences.screenshotInbox() && capture.folderName()) {
                  <p class="capture-state capture-state--on">Watching “{{ capture.folderName() }}”</p>
                }
              </ion-label>
            </ion-toggle>
          </ion-item>
          @if (!capture.native && preferences.screenshotInbox()) {
            <ion-item lines="full" button [detail]="true" (click)="capture.chooseFolder()">
              <ion-label>Change screenshots folder</ion-label>
            </ion-item>
          }
          <ion-item lines="none" button [detail]="false" (click)="trySample()">
            <ion-icon slot="start" name="sparkles-outline" aria-hidden="true" />
            <ion-label><h3>Try it with a sample</h3><p>Adds a sample GCash bill payment through the same steps a real notification takes.</p></ion-label>
          </ion-item>
        </ion-list>

        <p class="group-title">Your data</p>
        <ion-list inset="true" class="reveal" style="--i: 4">
          <ion-item lines="full">
            <ion-icon slot="start" name="images-outline" aria-hidden="true" />
            <ion-label><h3>Storage</h3><p>{{ store.items().length }} saved {{ store.items().length === 1 ? 'item' : 'items' }}</p></ion-label>
          </ion-item>
          <ion-item lines="full" button [detail]="false" [disabled]="backupBusy()" (click)="exportBackup()">
            <ion-icon slot="start" name="download-outline" aria-hidden="true" />
            <ion-label><h3>Export backup</h3><p>Uninstalling SnapSort deletes its data. Save a backup somewhere else to keep a copy.</p></ion-label>
          </ion-item>
          <ion-item lines="full" button [detail]="false" [disabled]="backupBusy()" (click)="restoreInput.click()">
            <ion-icon slot="start" name="folder-open-outline" aria-hidden="true" />
            <ion-label><h3>Restore from backup</h3><p>Adds the items from a backup file. Nothing already here is changed.</p></ion-label>
          </ion-item>
          <input #restoreInput type="file" accept=".zip,application/zip" hidden (change)="restoreBackup(restoreInput)" />
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

        <p class="about">SnapSort {{ appVersion }} · Made to stay on your device</p>
      </main>
    </ion-content>
  `,
})
export class SettingsPage {
  protected readonly categories = inject(CategoryStore);
  protected readonly store = inject(ItemStore);
  protected readonly preferences = inject(PreferencesStore);
  protected readonly capture = inject(CaptureService);
  private readonly images = inject(ImageStorageService);
  private readonly business = inject(BusinessProfileStore);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  protected readonly categoryName = signal('');
  protected readonly categoryError = signal('');
  protected readonly backupBusy = signal(false);
  protected readonly appVersion = APP_VERSION;
  private readonly backup = inject(BackupService);

  constructor() {
    addIcons({ add, albumsOutline, close, cloudOfflineOutline, downloadOutline, flashOutline, folderOpenOutline, imagesOutline, lockClosed, sparklesOutline, trashOutline });
    void this.store.load();
  }

  async toggleNotifications(event: Event): Promise<void> {
    const toggle = event.target as HTMLIonToggleElement;
    const enabled = toggle.checked;
    if (enabled && !this.capture.status().accessGranted) {
      const alert = await this.alerts.create({
        header: 'Allow Notification access',
        message: 'Android will open its Notification access settings. Turn on SnapSort there, then come back. SnapSort only keeps notifications that look like payments, and they never leave this device.',
        buttons: [
          { text: 'Not now', role: 'cancel' },
          { text: 'Continue', role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') {
        toggle.checked = false;
        return;
      }
    }
    await this.capture.setCaptureEnabled(enabled);
  }

  async toggleInbox(event: Event): Promise<void> {
    const toggle = event.target as HTMLIonToggleElement;
    if (!toggle.checked) {
      this.capture.disableInbox();
      return;
    }
    if (await this.capture.enableInbox()) return;
    toggle.checked = false;
    const toast = await this.toasts.create({
      message: this.capture.native ? 'Photo access is needed to find payment screenshots.' : 'No folder was chosen.',
      duration: 2400,
    });
    await toast.present();
  }

  async trySample(): Promise<void> {
    const item = await this.capture.addSample();
    if (!item) {
      const toast = await this.toasts.create({ message: 'The sample could not be added.', duration: 2200 });
      await toast.present();
    }
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

  async exportBackup(): Promise<void> {
    this.backupBusy.set(true);
    try {
      const { exported, missing } = await this.backup.export();
      const left = missing ? ` ${missing} without an image file ${missing === 1 ? 'was' : 'were'} left out.` : '';
      await this.notify(`Backup of ${exported} ${exported === 1 ? 'item' : 'items'} ready.${left}`);
    } catch {
      await this.notify('The backup could not be created. Check free space and try again.');
    } finally {
      this.backupBusy.set(false);
    }
  }

  async restoreBackup(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.backupBusy.set(true);
    try {
      const { imported, skipped, failed } = await this.backup.restore(file);
      const parts = [`Restored ${imported} ${imported === 1 ? 'item' : 'items'}`];
      if (skipped) parts.push(`${skipped} already here`);
      if (failed) parts.push(`${failed} could not be restored`);
      await this.notify(`${parts.join(', ')}.`);
    } catch (error) {
      await this.notify(error instanceof BackupError ? error.message : 'This file could not be read as a SnapSort backup.');
    } finally {
      this.backupBusy.set(false);
    }
  }

  private async notify(message: string): Promise<void> {
    const toast = await this.toasts.create({ message, duration: 3200 });
    await toast.present();
  }

  async confirmErase(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Erase all SnapSort data?',
      message: 'Every app-managed image and its details, your custom categories, captured payments waiting to be filed, the screenshot inbox, and your business details will be permanently removed. Gallery originals are not affected.',
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Erase everything', role: 'destructive', handler: () => void this.eraseAll() }],
    });
    await alert.present();
  }

  private async eraseAll(): Promise<void> {
    const items = [...this.store.items()];
    await this.store.clear();
    await Promise.all(items.map((item) => this.images.remove(item.imageKey)));
    this.categories.clear();
    this.business.clear();
    await this.capture.eraseData();
    const toast = await this.toasts.create({ message: 'SnapSort data erased', duration: 2200 });
    await toast.present();
  }
}
