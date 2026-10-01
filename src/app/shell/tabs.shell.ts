import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonFab,
  IonFabButton,
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, home, homeOutline, images, imagesOutline, settings, settingsOutline, statsChart, statsChartOutline } from 'ionicons/icons';
import { ItemStore } from '../core/services/item.store';
import { ReminderService } from '../core/services/reminder.service';

@Component({
  selector: 'app-tabs-shell',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonFab, IonFabButton, RouterLink],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom" class="dock">
        <ion-tab-button tab="home" href="/home">
          <ion-icon name="home-outline" class="icon-idle" aria-hidden="true" />
          <ion-icon name="home" class="icon-active" aria-hidden="true" />
          <ion-label>Home</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="library" href="/library">
          <ion-icon name="images-outline" class="icon-idle" aria-hidden="true" />
          <ion-icon name="images" class="icon-active" aria-hidden="true" />
          <ion-label>Library</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="insights" href="/insights">
          <ion-icon name="stats-chart-outline" class="icon-idle" aria-hidden="true" />
          <ion-icon name="stats-chart" class="icon-active" aria-hidden="true" />
          <ion-label>Insights</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="settings" href="/settings">
          <ion-icon name="settings-outline" class="icon-idle" aria-hidden="true" />
          <ion-icon name="settings" class="icon-active" aria-hidden="true" />
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>

      <ion-fab slot="fixed" class="dock-fab" [class.is-inviting]="isEmpty()">
        <span class="dock-fab-ring" aria-hidden="true"></span>
        <ion-fab-button routerLink="/add" aria-label="Add an image">
          <ion-icon name="add" />
        </ion-fab-button>
      </ion-fab>
    </ion-tabs>
  `,
})
export class TabsShell {
  private readonly store = inject(ItemStore);
  protected readonly isEmpty = computed(() => this.store.ready() && this.store.items().length === 0);

  constructor() {
    // Starts keeping warranty reminders in sync with the library.
    inject(ReminderService);
    addIcons({ add, home, homeOutline, images, imagesOutline, settings, settingsOutline, statsChart, statsChartOutline });
  }
}
