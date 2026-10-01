import { Component } from '@angular/core';
import { IonApp } from '@ionic/angular/ion-app';
import { IonRouterOutlet } from '@ionic/angular/ion-router-outlet';

@Component({
  imports: [IonApp, IonRouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  template: '<ion-app><ion-router-outlet /></ion-app>',
})
export class App {}
