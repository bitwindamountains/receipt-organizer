import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

@Component({
  imports: [IonApp, IonRouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  template: '<ion-app><ion-router-outlet /></ion-app>',
})
export class App {}
