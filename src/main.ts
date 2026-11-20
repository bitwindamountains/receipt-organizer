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
    // The worker serves the cached app first; reload once a newer deploy has downloaded so visitors don't stay a version behind.
    // ponytail: reloads straight away (it arrives seconds after opening); switch to a "New version - Reload" prompt if it ever interrupts input.
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      if (data?.type === 'VERSION_READY' || data?.type === 'UNRECOVERABLE_STATE') location.reload();
    });
  }
}
