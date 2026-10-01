import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';

const requiresOnboarding: CanActivateFn = () =>
  localStorage.getItem('snapsort.onboarding.complete') === 'true'
    ? true
    : inject(Router).createUrlTree(['/onboarding']);

export const routes: Routes = [
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./features/onboarding/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: '',
    canActivate: [requiresOnboarding],
    loadComponent: () => import('./shell/tabs.shell').then((m) => m.TabsShell),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'library',
        loadComponent: () =>
          import('./features/library/library.page').then((m) => m.LibraryPage),
      },
      {
        path: 'insights',
        loadComponent: () =>
          import('./features/insights/insights.page').then((m) => m.InsightsPage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'home' },
    ],
  },
  {
    path: 'add',
    canActivate: [requiresOnboarding],
    loadComponent: () => import('./features/add-item/add-item.page').then((m) => m.AddItemPage),
  },
  {
    path: 'receipt/new',
    canActivate: [requiresOnboarding],
    loadComponent: () =>
      import('./features/receipt-maker/receipt-maker.page').then((m) => m.ReceiptMakerPage),
  },
  {
    path: 'item/:id',
    canActivate: [requiresOnboarding],
    loadComponent: () =>
      import('./features/item-details/item-details.page').then((m) => m.ItemDetailsPage),
  },
  {
    path: 'item/:id/edit',
    canActivate: [requiresOnboarding],
    loadComponent: () => import('./features/add-item/add-item.page').then((m) => m.AddItemPage),
  },
  { path: '**', redirectTo: '' },
];
