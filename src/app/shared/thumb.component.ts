import { Component, input } from '@angular/core';
import { injectImageUrl } from '../core/services/image-url';

/** A saved image's thumbnail, for decorative spots that only need the picture. */
@Component({
  selector: 'app-thumb',
  template: `@if (url()) { <img [src]="url()" alt="" decoding="async" /> }`,
})
export class ThumbComponent {
  readonly imageKey = input<string | null | undefined>();
  protected readonly url = injectImageUrl(() => this.imageKey(), 'thumb');
}
