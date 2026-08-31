import { Component, OnDestroy, effect, inject, input, signal } from '@angular/core';

import { ApiService } from './api.service';

@Component({
  selector: 'app-event-frame',
  template: `
    @if (url()) {
      <img class="thumb-img" [src]="url()!" [alt]="alt()" />
    } @else if (failed()) {
      <div class="thumb-img thumb-img-fallback">Photo indisponible</div>
    } @else {
      <div class="thumb-img thumb-img-fallback">Chargement…</div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .thumb-img {
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: cover;
      display: block;
    }
    .thumb-img-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e2e8f0;
      color: #64748b;
      font-size: 0.75rem;
    }
  `,
})
export class EventFrameComponent implements OnDestroy {
  private readonly api = inject(ApiService);

  eventId = input.required<string>();
  alt = input('');

  protected readonly url = signal<string | null>(null);
  protected readonly failed = signal(false);

  private objectUrl: string | null = null;

  constructor() {
    effect((onCleanup) => {
      const id = this.eventId();
      this.failed.set(false);
      this.revoke();
      if (!id) {
        this.failed.set(true);
        return;
      }
      const sub = this.api.getEventFrame(id).subscribe({
        next: (blob) => {
          if (!blob || blob.size === 0 || blob.type.includes('json')) {
            this.failed.set(true);
            return;
          }
          this.objectUrl = URL.createObjectURL(blob);
          this.url.set(this.objectUrl);
        },
        error: () => this.failed.set(true),
      });
      onCleanup(() => {
        sub.unsubscribe();
        this.revoke();
      });
    });
  }

  ngOnDestroy() {
    this.revoke();
  }

  private revoke() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.url.set(null);
  }
}
