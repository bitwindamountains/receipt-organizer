import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/** True only in `npm run build:web` (see angular.json `define`). */
declare const PWA: boolean;

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

if (PWA) {
  // Added here rather than in index.html so the Android build carries no links to files it doesn't ship.
  for (const [rel, href] of [['manifest', 'manifest.webmanifest'], ['apple-touch-icon', 'icons/icon-192.png']]) {
    document.head.append(Object.assign(document.createElement('link'), { rel, href }));
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('ngsw-worker.js').catch((err) => console.error(err)));
  }
}
