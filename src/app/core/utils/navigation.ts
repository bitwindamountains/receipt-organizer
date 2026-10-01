import { inject } from '@angular/core';
import { IonRouterOutlet, NavController } from '@ionic/angular';

/**
 * Returns a function that goes back when the app has history, and otherwise
 * navigates (backwards) to `fallback`. Plain `location.back()` would leave the
 * app after a deep link or right after onboarding. Call in an injection context.
 */
export function injectGoBack(): (fallback?: string) => void {
  const outlet = inject(IonRouterOutlet, { optional: true });
  const nav = inject(NavController);
  return (fallback = '/home') => {
    if (outlet?.canGoBack()) nav.back();
    else void nav.navigateBack(fallback, { replaceUrl: true });
  };
}
