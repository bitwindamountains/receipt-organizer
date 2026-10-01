import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';

/** Animates a number from its previous value to the new one. Respects reduced motion. */
@Directive({ selector: '[appCountUp]' })
export class CountUpDirective {
  readonly appCountUp = input.required<number>();
  /** Formats each frame, e.g. minor units as currency. Defaults to the plain integer. */
  readonly countFormat = input<(value: number) => string>(String);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private current = 0;
  private frame = 0;

  constructor() {
    effect(() => {
      this.countFormat();
      this.animateTo(this.appCountUp());
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private animateTo(target: number): void {
    cancelAnimationFrame(this.frame);
    const from = this.current;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from === target || typeof requestAnimationFrame !== 'function') {
      this.render(target);
      return;
    }
    const duration = Math.min(900, 380 + Math.abs(target - from) * 30);
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      this.render(Math.round(from + (target - from) * eased));
      if (progress < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private render(value: number): void {
    this.current = value;
    this.element.textContent = this.countFormat()(value);
  }
}
