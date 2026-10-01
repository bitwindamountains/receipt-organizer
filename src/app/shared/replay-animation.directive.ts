import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Restarts a CSS animation class whenever `appReplay` changes, e.g. to make a
 * total "pop" when it updates. Animations themselves stay in CSS behind
 * prefers-reduced-motion, so this only toggles a class.
 */
@Directive({ selector: '[appReplay]' })
export class ReplayAnimationDirective {
  readonly appReplay = input<unknown>();
  readonly replayClass = input('enter-pop');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      this.appReplay();
      const name = this.replayClass();
      this.element.classList.remove(name);
      // Force a style flush so re-adding the class starts the animation again.
      void this.element.offsetWidth;
      this.element.classList.add(name);
    });
  }
}
