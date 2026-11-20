import { CanDeactivateFn } from '@angular/router';

/** A page holding unsaved input. `confirmLeave` resolves true when it's safe to go. */
export interface DiscardGuarded {
  confirmLeave(): boolean | Promise<boolean>;
}

/**
 * Asks before Cancel, the back arrow or Android's back gesture throws away a filled form.
 * Pages decide what counts as unsaved and show the prompt themselves.
 */
export const confirmDiscard: CanDeactivateFn<DiscardGuarded> = (page) => page.confirmLeave();
