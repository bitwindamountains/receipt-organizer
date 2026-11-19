import { Component, computed, input } from '@angular/core';

interface DriftDoc {
  kind: 'receipt' | 'shot';
  x: number;
  y: number;
  rotate: number;
  scale: number;
  opacity: number;
  duration: number;
  delay: number;
  dx: number;
}

// Docs sit near the edges so headline copy stays readable on top of them.
const HERO_DOCS: DriftDoc[] = [
  { kind: 'receipt', x: 78, y: 8, rotate: 12, scale: 1, opacity: .7, duration: 15, delay: -3, dx: -12 },
  { kind: 'shot', x: 90, y: 34, rotate: -8, scale: .9, opacity: .55, duration: 18, delay: -9, dx: 10 },
  { kind: 'receipt', x: 64, y: 48, rotate: -16, scale: .72, opacity: .4, duration: 21, delay: -5, dx: 16 },
  { kind: 'shot', x: 58, y: 2, rotate: 6, scale: .62, opacity: .35, duration: 17, delay: -12, dx: -8 },
  { kind: 'receipt', x: 4, y: 60, rotate: -6, scale: .6, opacity: .3, duration: 19, delay: -7, dx: 12 },
  { kind: 'shot', x: 40, y: 72, rotate: 14, scale: .55, opacity: .25, duration: 22, delay: -15, dx: -14 },
];

interface Star { x: number; y: number; size: number; delay: number; }

// A loose constellation behind the slips; each twinkles on its own beat.
const STARS: Star[] = [
  { x: 14, y: 12, size: 12, delay: 0 }, { x: 32, y: 26, size: 7, delay: -1.6 }, { x: 52, y: 9, size: 9, delay: -3.1 },
  { x: 71, y: 30, size: 14, delay: -.8 }, { x: 93, y: 16, size: 7, delay: -2.4 }, { x: 24, y: 44, size: 9, delay: -4.2 },
  { x: 47, y: 38, size: 6, delay: -2 }, { x: 84, y: 52, size: 10, delay: -3.6 }, { x: 8, y: 30, size: 6, delay: -1.1 },
  { x: 61, y: 60, size: 8, delay: -4.8 },
];

const FULL_DOCS: DriftDoc[] = [
  ...HERO_DOCS.map((doc) => ({ ...doc, y: doc.y * .55 })),
  { kind: 'receipt', x: 86, y: 62, rotate: 18, scale: .9, opacity: .45, duration: 20, delay: -4, dx: -10 },
  { kind: 'shot', x: 2, y: 84, rotate: -12, scale: .8, opacity: .4, duration: 16, delay: -10, dx: 14 },
  { kind: 'receipt', x: 70, y: 88, rotate: -4, scale: .7, opacity: .35, duration: 18, delay: -1, dx: 8 },
  { kind: 'shot', x: 12, y: 6, rotate: -14, scale: .7, opacity: .35, duration: 23, delay: -6, dx: 10 },
];

/** Decorative, theme-aware background motion: twinkling stars, drifting receipts and screenshots, and a passing comet. */
@Component({
  selector: 'app-ambient-backdrop',
  host: {
    class: 'ambient',
    'aria-hidden': 'true',
    '[class.ambient--hero]': "variant() === 'hero'",
    '[class.ambient--full]': "variant() === 'full'",
  },
  template: `
    <span class="ambient-orb ambient-orb--a"></span>
    <span class="ambient-orb ambient-orb--b"></span>
    <span class="ambient-grid"></span>
    @for (star of stars; track $index) {
      <span class="ambient-star" [style.--x.%]="star.x" [style.--y.%]="star.y" [style.--size.px]="star.size" [style.--delay.s]="star.delay"></span>
    }
    @for (doc of docs(); track $index) {
      <span
        class="drift"
        [style.--x.%]="doc.x"
        [style.--y.%]="doc.y"
        [style.--r.deg]="doc.rotate"
        [style.--s]="doc.scale"
        [style.--o]="doc.opacity"
        [style.--d.s]="doc.duration"
        [style.--delay.s]="doc.delay"
        [style.--dx.px]="doc.dx"
      >
        <span class="drift-doc" [class]="'drift-doc--' + doc.kind"></span>
      </span>
    }
    <span class="ambient-comet"></span>
  `,
})
export class AmbientBackdropComponent {
  readonly variant = input<'hero' | 'full'>('hero');
  protected readonly stars = STARS;
  protected readonly docs = computed(() => (this.variant() === 'full' ? FULL_DOCS : HERO_DOCS));
}
