import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, lockClosedOutline, pricetagOutline, searchOutline } from 'ionicons/icons';
import { AmbientBackdropComponent } from '../../shared/ambient-backdrop/ambient-backdrop.component';

@Component({
  selector: 'app-onboarding',
  imports: [IonContent, IonButton, IonIcon, AmbientBackdropComponent],
  template: `
    <ion-content [fullscreen]="true">
      <app-ambient-backdrop variant="full" />
      <main class="welcome page-width">
        <!-- A screenshot and receipts are dealt onto a stack, scanned, then tagged. -->
        <div class="sort-stage" aria-hidden="true">
          <div class="sort-stack">
            <div class="stack-card stack-card--shot">
              <span class="sc-bar"></span><span class="sc-bubble"></span><span class="sc-bubble sc-bubble--me"></span><span class="sc-bubble"></span>
            </div>
            <div class="stack-card stack-card--back"></div>
            <div class="stack-card stack-card--receipt">
              <span class="rc-merchant">CORNER CAFE</span>
              <span class="rc-row"><i></i><b>185.00</b></span>
              <span class="rc-row"><i></i><b>120.00</b></span>
              <span class="rc-row"><i></i><b>180.00</b></span>
              <span class="rc-total"><span>TOTAL</span><span>₱485.00</span></span>
              <span class="scan-beam"></span>
            </div>
            <span class="stack-tag stack-tag--a"><ion-icon name="pricetag-outline" /> Food</span>
            <span class="stack-tag stack-tag--b"><ion-icon name="checkmark-circle" /> Sorted</span>
          </div>
        </div>

        <p class="eyebrow reveal" style="--i: 3">SnapSort</p>
        <h1 class="reveal" style="--i: 4">Find important images in seconds.</h1>
        <p class="lead reveal" style="--i: 5">Organize screenshots and receipts, find them instantly, and keep everything on your device.</p>

        <div class="trust-list">
          <div class="reveal" style="--i: 6">
            <span class="trust-icon"><ion-icon name="search-outline" /></span>
            <span><strong>Easy to find</strong>Search titles, tags, merchants, and categories.</span>
          </div>
          <div class="reveal" style="--i: 7">
            <span class="trust-icon"><ion-icon name="lock-closed-outline" /></span>
            <span><strong>Private by design</strong>Your selected images stay on this device.</span>
          </div>
        </div>

        <div class="actions reveal" style="--i: 8">
          <ion-button expand="block" size="large" (click)="complete('/add')">Add my first image</ion-button>
          <ion-button expand="block" fill="clear" color="medium" (click)="complete('/home')">Explore the app</ion-button>
        </div>
      </main>
    </ion-content>
  `,
})
export class OnboardingPage {
  private readonly router = inject(Router);

  constructor() {
    addIcons({ checkmarkCircle, lockClosedOutline, pricetagOutline, searchOutline });
  }

  complete(destination: string): void {
    localStorage.setItem('snapsort.onboarding.complete', 'true');
    void this.router.navigateByUrl(destination, { replaceUrl: true });
  }
}
