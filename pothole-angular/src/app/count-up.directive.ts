import { Directive, ElementRef, inject, input, effect } from '@angular/core';

/**
 * Animates a numeric value from its previous state up (or down) to the new
 * target whenever it changes, easing out over ~900ms. Falls back to an
 * instant update when the user has requested reduced motion.
 *
 * Usage: <h3 [countUp]="events().length"></h3>
 */
@Directive({
  selector: '[countUp]',
})
export class CountUpDirective {
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement;

  readonly countUp = input<number>(0);

  private current = 0;
  private frame: number | null = null;
  private started = false;

  constructor() {
    effect(() => {
      const target = Math.round(this.countUp() ?? 0);
      if (!this.started) {
        // First paint: count up from 0 instead of jumping straight to value.
        this.started = true;
        this.current = 0;
        this.el.textContent = '0';
      }
      this.animateTo(target);
    });
  }

  private animateTo(target: number) {
    const reduceMotion =
      typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      this.current = target;
      this.el.textContent = String(target);
      return;
    }

    if (this.frame != null) cancelAnimationFrame(this.frame);
    const start = this.current;
    const delta = target - start;
    if (delta === 0) return;
    const duration = 900;
    const startTime = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(start + delta * eased);
      this.el.textContent = String(value);
      if (t < 1) {
        this.frame = requestAnimationFrame(step);
      } else {
        this.current = target;
        this.frame = null;
      }
    };
    this.frame = requestAnimationFrame(step);
  }
}
