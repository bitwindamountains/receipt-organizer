import { Animation, TransitionOptions, createAnimation } from '@ionic/core/components';

const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
const EASE_IN = 'cubic-bezier(.4, 0, 1, 1)';

/** Same lookup as Ionic's own transitions: the routed host, or the page inside it. */
function pageOf(el: HTMLElement): HTMLElement {
  if (el.classList.contains('ion-page')) return el;
  return el.querySelector<HTMLElement>(':scope > .ion-page, :scope > ion-nav, :scope > ion-tabs') ?? el;
}

/**
 * Pages slide up like a new slip laid on the pile; the one underneath sinks back.
 * Going back, the top slip drops away and the one beneath lifts into place.
 * Based on Ionic's md transition (which handles `ion-page-invisible` the same way).
 */
export function pageTransition(_: HTMLElement, opts: TransitionOptions): Animation {
  const back = opts.direction === 'back';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const entering = pageOf(opts.enteringEl);
  const root = createAnimation()
    .duration(still ? 0 : (opts.duration ?? 0) || (back ? 240 : 380))
    .easing(back ? EASE_IN : EASE_OUT);

  const enter = createAnimation().addElement(entering).fill('both').beforeRemoveClass('ion-page-invisible');
  if (back) enter.fromTo('transform', 'scale(.96)', 'scale(1)').fromTo('opacity', .4, 1);
  else enter.fromTo('transform', 'translateY(32px)', 'translateY(0)').fromTo('opacity', .01, 1);
  root.addAnimation(enter);

  if (opts.leavingEl) {
    const leaving = pageOf(opts.leavingEl);
    const leave = createAnimation().addElement(leaving).fill('both');
    if (back) {
      leave
        .fromTo('transform', 'translateY(0)', 'translateY(40px)')
        .fromTo('opacity', 1, 0)
        // Ionic expects the popped page hidden once the animation ends.
        .onFinish((step) => { if (step === 1) leaving.style.setProperty('display', 'none'); });
    } else {
      leave.fromTo('transform', 'scale(1)', 'scale(.96)').fromTo('opacity', 1, .4);
    }
    root.addAnimation(leave);
  }
  return root;
}
