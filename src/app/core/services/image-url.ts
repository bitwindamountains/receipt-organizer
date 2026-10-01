import { DestroyRef, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { ImageStorageService } from './image-storage.service';

/**
 * Resolves a stored image key to a displayable URL. Stale lookups (an older key
 * resolving after a newer one, or after destroy) are discarded, and browser blob
 * URLs are released when replaced or destroyed. Call in an injection context.
 */
export function injectImageUrl(key: () => string | null | undefined): Signal<string> {
  const images = inject(ImageStorageService);
  const currentKey = computed(key);
  const url = signal('');
  let request = 0;
  let destroyed = false;

  const show = (next: string) => {
    const previous = untracked(url);
    if (previous !== next) images.release(previous);
    url.set(next);
  };

  effect(() => {
    const imageKey = currentKey();
    const id = ++request;
    if (!imageKey) {
      show('');
      return;
    }
    images.urlFor(imageKey).then(
      (next) => (destroyed || id !== request ? images.release(next) : show(next)),
      () => !destroyed && id === request && show(''),
    );
  });

  inject(DestroyRef).onDestroy(() => {
    destroyed = true;
    images.release(untracked(url));
  });

  return url.asReadonly();
}
