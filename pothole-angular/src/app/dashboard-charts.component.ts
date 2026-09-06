import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import type { EventRecord } from './api.service';
import { isPotholeEvent } from './pothole-size.util';
import { CountUpDirective } from './count-up.directive';

export type ChartRange = '24h' | '7d' | '30d';

type SeriesPoint = { label: string; detections: number; resolved: number };
type CategorySlice = { name: string; count: number; percentage: number; color: string };

const W = 720;
const H = 260;
const PAD_L = 36;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;

@Component({
  selector: 'app-dashboard-charts',
  imports: [CommonModule, CountUpDirective],
  templateUrl: './dashboard-charts.component.html',
  styleUrl: './dashboard-charts.component.scss',
})
export class DashboardChartsComponent {
  events = input.required<EventRecord[]>();
  exportCsv = output<void>();

  protected readonly range = signal<ChartRange>('24h');
  protected readonly ranges: ChartRange[] = ['24h', '7d', '30d'];
  protected readonly hoverIndex = signal<number | null>(null);

  protected readonly series = computed(() => this.buildSeries(this.events(), this.range()));

  protected readonly categories = computed(() => {
    const list = this.events();
    const pothole = list.filter((e) => isPotholeEvent(e)).length;
    const signs = list.filter((e) => e.model === 'signs_damage' || e.task === 'signs_damage').length;
    const other = Math.max(0, list.length - pothole - signs);
    const total = Math.max(1, list.length);
    const slices: CategorySlice[] = [
      { name: 'Nids-de-poule', count: pothole, percentage: Math.round((pothole / total) * 100), color: '#0f4c81' },
      { name: 'Panneaux abîmés', count: signs, percentage: Math.round((signs / total) * 100), color: '#ff8a7a' },
      { name: 'Autres', count: other, percentage: Math.round((other / total) * 100), color: '#94A3B8' },
    ];
    return slices.filter((s) => s.count > 0);
  });

  protected readonly maxY = computed(() => {
    const pts = this.series();
    return Math.max(1, ...pts.map((p) => Math.max(p.detections, p.resolved)));
  });

  protected readonly detectionsPath = computed(() => this.areaPath(this.series().map((p) => p.detections)));
  protected readonly resolvedPath = computed(() => this.areaPath(this.series().map((p) => p.resolved)));
  protected readonly detectionsLine = computed(() => this.linePath(this.series().map((p) => p.detections)));
  protected readonly resolvedLine = computed(() => this.linePath(this.series().map((p) => p.resolved)));

  protected readonly hoverPoint = computed(() => {
    const i = this.hoverIndex();
    const pts = this.series();
    if (i == null || !pts[i]) return null;
    return pts[i];
  });

  protected readonly rangeLabel = computed(() => {
    switch (this.range()) {
      case '7d':
        return '7 jours';
      case '30d':
        return '30 jours';
      default:
        return '24 h';
    }
  });

  protected readonly chartW = W;
  protected readonly chartH = H;

  rangeButton(r: ChartRange) {
    switch (r) {
      case '7d':
        return '7 jours';
      case '30d':
        return '30 jours';
      default:
        return 'Aujourd’hui';
    }
  }

  setRange(r: ChartRange) {
    this.range.set(r);
    this.hoverIndex.set(null);
  }

  pointX(index: number) {
    const n = Math.max(1, this.series().length - 1);
    return PAD_L + (index / n) * (W - PAD_L - PAD_R);
  }

  pointY(value: number) {
    const max = this.maxY();
    return PAD_T + (1 - value / max) * (H - PAD_T - PAD_B);
  }

  onChartMove(event: MouseEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const n = this.series().length;
    if (n < 2) {
      this.hoverIndex.set(n ? 0 : null);
      return;
    }
    const t = (x - PAD_L) / (W - PAD_L - PAD_R);
    const i = Math.round(Math.min(1, Math.max(0, t)) * (n - 1));
    this.hoverIndex.set(i);
  }

  donutDash(count: number, radius: number) {
    const total = this.events().length || 1;
    const circ = 2 * Math.PI * radius;
    return `${(count / total) * circ} ${circ}`;
  }

  donutOffset(index: number, radius: number) {
    const total = this.events().length || 1;
    const circ = 2 * Math.PI * radius;
    const cats = this.categories();
    let before = 0;
    for (let i = 0; i < index; i++) before += cats[i]?.count ?? 0;
    return -((before / total) * circ);
  }

  private buildSeries(events: EventRecord[], range: ChartRange): SeriesPoint[] {
    const now = Date.now();
    if (range === '24h') {
      const points: SeriesPoint[] = [];
      for (let i = 11; i >= 0; i--) {
        const end = now - i * 2 * 3600_000;
        const start = end - 2 * 3600_000;
        const slice = events.filter((e) => e.ts_ms >= start && e.ts_ms < end);
        const d = new Date(end);
        points.push({
          label: `${String(d.getHours()).padStart(2, '0')}:00`,
          detections: slice.length,
          resolved: slice.filter((e) => e.status === 'RESOLU').length,
        });
      }
      return points;
    }

    const days = range === '7d' ? 7 : 30;
    const points: SeriesPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const start = day.getTime();
      const end = start + 86400_000;
      const slice = events.filter((e) => e.ts_ms >= start && e.ts_ms < end);
      points.push({
        label: day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        detections: slice.length,
        resolved: slice.filter((e) => e.status === 'RESOLU').length,
      });
    }
    if (range === '30d') {
      const grouped: SeriesPoint[] = [];
      for (let i = 0; i < points.length; i += 3) {
        const chunk = points.slice(i, i + 3);
        grouped.push({
          label: chunk[0].label,
          detections: chunk.reduce((s, p) => s + p.detections, 0),
          resolved: chunk.reduce((s, p) => s + p.resolved, 0),
        });
      }
      return grouped;
    }
    return points;
  }

  private linePath(values: number[]): string {
    const pts = this.toPts(values);
    if (!pts.length) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  private areaPath(values: number[]): string {
    const pts = this.toPts(values);
    if (!pts.length) return '';
    const base = H - PAD_B;
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return `${line} L ${pts[pts.length - 1].x} ${base} L ${pts[0].x} ${base} Z`;
  }

  private toPts(values: number[]) {
    const max = this.maxY();
    const n = Math.max(1, values.length - 1);
    return values.map((v, i) => ({
      x: PAD_L + (i / n) * (W - PAD_L - PAD_R),
      y: PAD_T + (1 - v / max) * (H - PAD_T - PAD_B),
    }));
  }
}
