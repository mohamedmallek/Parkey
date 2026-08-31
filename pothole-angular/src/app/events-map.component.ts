import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';
import 'leaflet.heat';

import type { EventRecord } from './api.service';
import {
  type EventStatus,
  severityCssClass,
  severityLabel,
  statusCssClass,
  statusLabel,
} from './event-workflow.util';
import {
  depthProxyLabel,
  formatSizeCm,
  isPotholeEvent,
  sizeClassCss,
  sizeClassLabel,
  sizeClassShort,
} from './pothole-size.util';

type MapPoint = {
  event: EventRecord;
  lat: number;
  lon: number;
  approximate: boolean;
};

/** Coordonnées approximatives des principales villes tunisiennes (fallback sans GPS). */
const CITY_COORDS: Record<string, [number, number]> = {
  tunis: [36.8065, 10.1815],
  ariana: [36.8625, 10.1956],
  'ben arous': [36.754, 10.2189],
  manouba: [36.8101, 10.097],
  sfax: [34.7406, 10.7603],
  sousse: [35.8254, 10.636],
  bizerte: [37.2744, 9.8739],
  gabes: [33.8815, 10.0982],
  nabeul: [36.4513, 10.7357],
  monastir: [35.7643, 10.8113],
};

@Component({
  selector: 'app-events-map',
  imports: [CommonModule],
  templateUrl: './events-map.component.html',
  styleUrl: './events-map.component.scss',
})
export class EventsMapComponent implements AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);

  events = input.required<EventRecord[]>();
  visible = input(false);
  canManage = input(false);
  frameUrlFn = input.required<(id: string) => string>();
  formatDateFn = input.required<(ts: number) => string>();

  openVideo = output<EventRecord>();
  statusChange = output<{ event: EventRecord; status: EventStatus }>();
  refresh = output<void>();

  protected readonly statusLabel = statusLabel;
  protected readonly statusCssClass = statusCssClass;
  protected readonly severityLabel = severityLabel;
  protected readonly severityCssClass = severityCssClass;
  protected readonly sizeClassLabel = sizeClassLabel;
  protected readonly sizeClassShort = sizeClassShort;
  protected readonly sizeClassCss = sizeClassCss;
  protected readonly formatSizeCm = formatSizeCm;
  protected readonly isPotholeEvent = isPotholeEvent;
  protected readonly depthProxyLabel = depthProxyLabel;

  mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  selected = signal<MapPoint | null>(null);
  selectedFrameUrl = signal<string | null>(null);
  showHeatmap = signal(true);
  showMarkers = signal(true);
  filterModel = signal<'all' | 'pothole' | 'signs_damage'>('all');
  alertsOnly = signal(false);

  private map?: L.Map;
  private markerLayer?: L.LayerGroup;
  private heatLayer?: L.Layer;
  private frameObjectUrl: string | null = null;
  private mapReady = false;

  readonly stats = signal({ total: 0, onMap: 0, alerts: 0, approximate: 0 });

  constructor() {
    effect(() => {
      const visible = this.visible();
      const _events = this.events();
      const _heatmap = this.showHeatmap();
      const _markers = this.showMarkers();
      const _model = this.filterModel();
      const _alerts = this.alertsOnly();

      const sel = this.selected();
      if (sel) {
        const updated = _events.find((e) => e.id === sel.event.id);
        if (updated && updated !== sel.event) {
          this.selected.set({ ...sel, event: updated });
        }
      }

      if (!this.mapReady || !visible) return;

      queueMicrotask(() => {
        this.map?.invalidateSize();
        this.renderLayers();
      });
    });
  }

  ngAfterViewInit(): void {
    const el = this.mapContainer()?.nativeElement;
    if (!el) return;

    this.map = L.map(el, { zoomControl: true }).setView([36.8065, 10.1815], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map);

    this.markerLayer = L.layerGroup().addTo(this.map);
    this.mapReady = true;

    if (this.visible()) {
      setTimeout(() => {
        this.map?.invalidateSize();
        this.renderLayers();
      }, 150);
    }
  }

  ngOnDestroy(): void {
    this.revokeFrameUrl();
    this.map?.remove();
  }

  toggleHeatmap(): void {
    this.showHeatmap.update((v) => !v);
  }

  toggleMarkers(): void {
    this.showMarkers.update((v) => !v);
  }

  fitBounds(): void {
    const points = this.resolvePoints();
    if (!this.map || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as L.LatLngTuple));
    this.map.fitBounds(bounds.pad(0.15));
  }

  selectPoint(point: MapPoint): void {
    this.selected.set(point);
    this.loadFrame(point.event);
    this.map?.panTo([point.lat, point.lon]);
  }

  clearSelection(): void {
    this.selected.set(null);
    this.revokeFrameUrl();
  }

  openGoogleMaps(point: MapPoint): void {
    const url = `https://www.google.com/maps?q=${point.lat},${point.lon}`;
    window.open(url, '_blank');
  }

  onOpenVideo(): void {
    const sel = this.selected();
    if (sel?.event.video_ts_ms != null) {
      this.openVideo.emit(sel.event);
    }
  }

  emitStatus(status: EventStatus): void {
    const sel = this.selected();
    if (sel) {
      this.statusChange.emit({ event: sel.event, status });
    }
  }

  currentStatus(): string {
    return this.selected()?.event.status ?? 'NOUVEAU';
  }

  hasFrame(event: EventRecord): boolean {
    return event.video_ts_ms != null || !!event.frame_path;
  }

  modelLabel(model?: string | null): string {
    if (model === 'signs_damage') return 'Signalétique';
    if (model === 'pothole') return 'Nid-de-poule';
    return model ?? '—';
  }

  private loadFrame(event: EventRecord): void {
    this.revokeFrameUrl();
    if (!this.hasFrame(event)) {
      this.selectedFrameUrl.set(null);
      return;
    }
    this.http.get(this.frameUrlFn()(event.id), { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.frameObjectUrl = URL.createObjectURL(blob);
        this.selectedFrameUrl.set(this.frameObjectUrl);
      },
      error: () => this.selectedFrameUrl.set(null),
    });
  }

  private revokeFrameUrl(): void {
    if (this.frameObjectUrl) {
      URL.revokeObjectURL(this.frameObjectUrl);
      this.frameObjectUrl = null;
    }
    this.selectedFrameUrl.set(null);
  }

  private resolvePoints(): MapPoint[] {
    const model = this.filterModel();
    const alertsOnly = this.alertsOnly();

    return this.events()
      .filter((e) => {
        if (model !== 'all' && e.model !== model) return false;
        if (alertsOnly && !e.alert) return false;
        return true;
      })
      .map((e) => this.toMapPoint(e))
      .filter((p): p is MapPoint => p !== null);
  }

  private toMapPoint(event: EventRecord): MapPoint | null {
    if (this.isValidCoord(event.lat, event.lon)) {
      return { event, lat: event.lat!, lon: event.lon!, approximate: false };
    }
    const cityKey = (event.city ?? '').trim().toLowerCase();
    const base = CITY_COORDS[cityKey];
    if (!base) return null;
    const offset = this.jitterFromId(event.id);
    return {
      event,
      lat: base[0] + offset[0],
      lon: base[1] + offset[1],
      approximate: true,
    };
  }

  private isValidCoord(lat?: number | null, lon?: number | null): boolean {
    if (lat == null || lon == null) return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (lat === 0 && lon === 0) return false;
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  private jitterFromId(id: string): [number, number] {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const dx = ((h % 200) - 100) * 0.00025;
    const dy = (((h >> 8) % 200) - 100) * 0.00025;
    return [dx, dy];
  }

  private renderLayers(): void {
    if (!this.map || !this.markerLayer) return;

    const points = this.resolvePoints();
    this.stats.set({
      total: this.events().length,
      onMap: points.length,
      alerts: points.filter((p) => p.event.alert).length,
      approximate: points.filter((p) => p.approximate).length,
    });

    this.markerLayer.clearLayers();
    if (this.heatLayer) {
      this.map.removeLayer(this.heatLayer);
      this.heatLayer = undefined;
    }

    if (points.length === 0) return;

    if (this.showHeatmap()) {
      const heatData: [number, number, number][] = points.map((p) => {
        const intensity = p.event.alert ? Math.max(0.5, p.event.prob) : p.event.prob * 0.4;
        return [p.lat, p.lon, intensity];
      });
      this.heatLayer = (L as unknown as { heatLayer: (d: [number, number, number][], o?: object) => L.Layer }).heatLayer(heatData, {
        radius: 28,
        blur: 18,
        maxZoom: 16,
        max: 1,
        gradient: {
          0.2: '#fde68a',
          0.5: '#f97316',
          0.8: '#ef4444',
          1: '#991b1b',
        },
      });
      this.heatLayer.addTo(this.map);
    }

    if (this.showMarkers()) {
      for (const p of points) {
        const color = p.event.model === 'signs_damage' ? '#2563eb' : '#dc2626';
        const radius = p.event.alert ? 9 : 6;
        const marker = L.circleMarker([p.lat, p.lon], {
          radius,
          fillColor: color,
          color: p.approximate ? '#f59e0b' : '#ffffff',
          weight: p.approximate ? 3 : 2,
          fillOpacity: 0.85,
        });

        marker.bindPopup(this.popupHtml(p), { maxWidth: 280 });
        marker.on('click', () => this.selectPoint(p));
        marker.addTo(this.markerLayer);
      }
    }

    if (points.length === 1) {
      this.map.setView([points[0].lat, points[0].lon], 14);
    }
  }

  private popupHtml(p: MapPoint): string {
    const e = p.event;
    const alert = e.alert ? '<span style="color:#dc2626;font-weight:600">ALERTE</span>' : 'Normal';
    const loc = p.approximate ? `~${e.city ?? 'ville'}` : `${e.lat!.toFixed(5)}, ${e.lon!.toFixed(5)}`;
    return `
      <div class="map-popup">
        <strong>${this.escapeHtml(e.label)}</strong>
        <div>${this.modelLabel(e.model)} · ${(e.prob * 100).toFixed(1)}%</div>
        <div style="font-size:12px;color:#64748b">${this.escapeHtml(this.formatDateFn()(e.ts_ms))}</div>
        <div style="font-size:12px">${alert} · ${this.escapeHtml(loc)}</div>
      </div>`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
