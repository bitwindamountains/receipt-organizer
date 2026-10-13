import { DOCUMENT } from '@angular/common';
import { ApplicationConfig, inject, makeEnvironmentProviders, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { AngularDelegate, ConfigToken, IonicRouteStrategy, provideComponentInputBinding } from '@ionic/angular/common';
import { initialize } from '@ionic/core/components';
import { routes } from './app.routes';
import { pageTransition } from './shell/page-transition';

const ionicConfig = { mode: 'md' as const, navAnimation: pageTransition };

/**
 * Same as Ionic's `provideIonicAngular`, minus ModalController/PopoverController
 * (unused here). It lives here because the eager bundle must not import the
 * `@ionic/angular` root barrel: esbuild then places every component the lazy
 * pages use into `main` (1.03 MB vs 380 kB). Eager files import Ionic from
 * subpaths such as `@ionic/angular/ion-app`; lazy pages may use the barrel.
 * Re-check this against Ionic's version when upgrading, and add the two
 * controllers back if a page starts using Angular modals or popovers.
 */
function provideIonic() {
  return makeEnvironmentProviders([
    { provide: ConfigToken, useValue: ionicConfig },
    provideAppInitializer(() => {
      inject(DOCUMENT).documentElement.classList.add('ion-ce');
      initialize(ionicConfig);
    }),
    provideComponentInputBinding(),
    AngularDelegate,
  ]);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideIonic(),
    provideRouter(routes),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
  ]
};
