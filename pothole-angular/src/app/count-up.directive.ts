import { Directive, ElementRef, inject, input, effect } from '@angular/core';

/**
 * Anime un nombre affiché : part de la valeur précédemment affichée (0 au
 * premier rendu) et progresse vers la nouvelle valeur avec un easing
 * "ease-out", au lieu de basculer instantanément (ancien comportement).
 * Respecte prefers-reduced-motion et formate en fr-FR (séparateur de milliers).
 */
@Directive({
  selector: '[countUp]',
})
export class CountUpDirective {
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement;

  readonly countUp = input<number>(0);
  /** Nombre de décimales à afficher (0 = entier, ex: compteurs). */
  readonly countUpDecimals = input<number>(0);
  /** Durée de l'animation en ms. */
  readonly countUpDuration = input<number>(900);

  private displayed = 0;
  private rafId: number | null = null;

  private readonly reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  constructor() {
    effect(() => {
      const target = Number(this.countUp() ?? 0);
      const decimals = this.countUpDecimals();
      this.animateTo(Number.isFinite(target) ? target : 0, decimals);
    });
  }

  private animateTo(target: number, decimals: number) {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const start = this.displayed;
    const delta = target - start;
    const threshold = decimals > 0 ? 0.05 : 1;

    if (this.reducedMotion || Math.abs(delta) < threshold) {
      this.displayed = target;
      this.render(target, decimals);
      return;
    }

    const duration = Math.max(1, this.countUpDuration());
    const startTime = Date.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const value = start + delta * easeOutCubic(progress);
      this.displayed = value;
      this.render(value, decimals);
      if (progress < 1) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.displayed = target;
        this.render(target, decimals);
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(step);
  }

  private render(value: number, decimals: number) {
    const rounded = decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
    this.el.textContent = rounded.toLocaleString('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
}
