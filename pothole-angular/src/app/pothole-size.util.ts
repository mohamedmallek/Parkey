export type PotholeSizeClass = 'S' | 'M' | 'L' | 'XL';
export type DepthProxy = 'FAIBLE' | 'MOYENNE' | 'PROFONDE';

const SIZE_LABELS: Record<PotholeSizeClass, string> = {
  S: 'Petit — moins de 15 cm',
  M: 'Moyen — 15 à 30 cm',
  L: 'Grand — 30 à 50 cm',
  XL: 'Très grand — plus de 50 cm',
};

const SIZE_SHORT: Record<PotholeSizeClass, string> = {
  S: 'Petit',
  M: 'Moyen',
  L: 'Grand',
  XL: 'Très grand',
};

const DEPTH_LABELS: Record<DepthProxy, string> = {
  FAIBLE: 'Faible',
  MOYENNE: 'Moyenne',
  PROFONDE: 'Profonde',
};

export function sizeClassLabel(c?: string | null): string {
  if (!c) return '—';
  return SIZE_LABELS[c as PotholeSizeClass] ?? c;
}

export function sizeClassShort(c?: string | null): string {
  if (!c) return '—';
  return SIZE_SHORT[c as PotholeSizeClass] ?? c;
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

export function depthClassCss(d?: string | null): string {
  switch (d) {
    case 'PROFONDE':
      return 'size-xl';
    case 'MOYENNE':
      return 'size-m';
    case 'FAIBLE':
      return 'size-s';
    default:
      return '';
  }
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
