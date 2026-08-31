export type PotholeSizeClass = 'S' | 'M' | 'L' | 'XL';
export type DepthProxy = 'FAIBLE' | 'MOYENNE' | 'PROFONDE';

const SIZE_LABELS: Record<PotholeSizeClass, string> = {
  S: 'Petit (S) — < 15 cm',
  M: 'Moyen (M) — 15–30 cm',
  L: 'Grand (L) — 30–50 cm',
  XL: 'Très grand (XL) — ≥ 50 cm',
};

const DEPTH_LABELS: Record<DepthProxy, string> = {
  FAIBLE: 'Profondeur faible (proxy)',
  MOYENNE: 'Profondeur moyenne (proxy)',
  PROFONDE: 'Profondeur élevée (proxy)',
};

export function sizeClassLabel(c?: string | null): string {
  if (!c) return '—';
  return SIZE_LABELS[c as PotholeSizeClass] ?? c;
}

export function sizeClassShort(c?: string | null): string {
  if (!c) return '—';
  return c;
}

export function sizeClassCss(c?: string | null): string {
  switch (c) {
    case 'XL':
      return 'size-xl';
    case 'L':
      return 'size-l';
    case 'M':
      return 'size-m';
    case 'S':
      return 'size-s';
    default:
      return '';
  }
}

export function depthProxyLabel(d?: string | null): string {
  if (!d) return '—';
  return DEPTH_LABELS[d as DepthProxy] ?? d;
}

export function formatSizeCm(w?: number | null, l?: number | null): string {
  if (w == null && l == null) return '—';
  const a = w != null ? `${w.toFixed(1)} cm` : '?';
  const b = l != null ? `${l.toFixed(1)} cm` : '?';
  return `${a} × ${b}`;
}

export function isPotholeEvent(e: { model?: string | null; label?: string | null }): boolean {
  const m = e.model ?? '';
  const l = (e.label ?? '').toLowerCase();
  return m === 'pothole' || l.includes('pothole');
}
