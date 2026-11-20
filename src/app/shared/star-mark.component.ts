import { Component } from '@angular/core';

/** Starlog logo: a four-point star trailing a comet tail. Uses currentColor. */
@Component({
  selector: 'app-star-mark',
  host: { 'aria-hidden': 'true', class: 'star-mark' },
  template: `
    <svg viewBox="0 0 24 24" width="100%" height="100%">
      <defs>
        <linearGradient id="star-mark-tail" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="currentColor" stop-opacity=".9" />
          <stop offset="1" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M12.6 11.6 3.2 21" stroke="url(#star-mark-tail)" stroke-width="2.4" stroke-linecap="round" fill="none" />
      <path class="star-mark-star" fill="currentColor" d="M15 2c.8 4.6 2.4 6.2 7 7-4.6.8-6.2 2.4-7 7-.8-4.6-2.4-6.2-7-7 4.6-.8 6.2-2.4 7-7Z" />
      <circle cx="5.2" cy="5.4" r="1.2" fill="currentColor" opacity=".7" />
    </svg>
  `,
})
export class StarMarkComponent {}
