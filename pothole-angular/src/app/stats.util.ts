import type { EventRecord } from './api.service';
import { ALL_SEVERITIES, ALL_STATUSES, severityLabel, statusLabel, type EventStatus } from './event-workflow.util';
import { depthProxyLabel, isPotholeEvent, sizeClassShort, type DepthProxy, type PotholeSizeClass } from './pothole-size.util';

/** Une ligne de répartition (barre + compteur + pourcentage) pour un graphique. */
export type BreakdownRow = {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITIQUE: '#b91c1c',
  ELEVEE: '#c2410c',
  MOYENNE: '#a16207',
  FAIBLE: '#64748b',
};

const STATUS_COLORS: Record<string, string> = {
  NOUVEAU: '#3730a3',
  CONFIRME: '#1d4ed8',
  EN_COURS: '#b45309',
  RESOLU: '#1f7a4d',
  FAUX_POSITIF: '#64748b',
};

const SIZE_COLORS: Record<PotholeSizeClass, string> = {
  S: '#047857',
  M: '#a16207',
  L: '#c2410c',
  XL: '#b91c1c',
};

const DEPTH_COLORS: Record<DepthProxy, string> = {
  FAIBLE: '#047857',
  MOYENNE: '#a16207',
  PROFONDE: '#b91c1c',
};

const SIZE_ORDER: PotholeSizeClass[] = ['S', 'M', 'L', 'XL'];
const DEPTH_ORDER: DepthProxy[] = ['FAIBLE', 'MOYENNE', 'PROFONDE'];

function buildBreakdown<T extends string>(
  events: EventRecord[],
  keyOf: (e: EventRecord) => T | null | undefined,
  order: readonly T[],
  labelFn: (k: T) => string,
  colorFn: (k: T) => string,
): BreakdownRow[] {
  const counts = new Map<T, number>();
  let counted = 0;
  for (const e of events) {
    const k = keyOf(e);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    counted += 1;
  }
  const total = counted || 1;
  return order
    .map((k) => {
      const count = counts.get(k) ?? 0;
      return { key: k, label: labelFn(k), count, pct: Math.round((count / total) * 100), color: colorFn(k) };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function severityBreakdown(events: EventRecord[]): BreakdownRow[] {
  return buildBreakdown(events, (e) => (e.severity as string | null) ?? null, ALL_SEVERITIES, severityLabel, (k) => SEVERITY_COLORS[k] ?? '#64748b');
}

export function statusBreakdown(events: EventRecord[]): BreakdownRow[] {
  return buildBreakdown(events, (e) => (e.status as EventStatus | null) ?? 'NOUVEAU', ALL_STATUSES, statusLabel, (k) => STATUS_COLORS[k] ?? '#64748b');
}

export function sizeBreakdown(events: EventRecord[]): BreakdownRow[] {
  const potholes = events.filter((e) => isPotholeEvent(e));
  return buildBreakdown(potholes, (e) => (e.size_class as PotholeSizeClass | null) ?? null, SIZE_ORDER, sizeClassShort, (k) => SIZE_COLORS[k]);
}

export function depthBreakdown(events: EventRecord[]): BreakdownRow[] {
  const potholes = events.filter((e) => isPotholeEvent(e));
  return buildBreakdown(potholes, (e) => (e.depth_proxy as DepthProxy | null) ?? null, DEPTH_ORDER, depthProxyLabel, (k) => DEPTH_COLORS[k]);
}

/** Classement libre (villes, matériaux...) : top N par nombre d'occurrences. */
export function topByCount(
  values: (string | null | undefined)[],
  limit = 5,
): { label: string; count: number; pct: number }[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = raw?.trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }));
}

export function totalBudgetMidTnd(events: EventRecord[]): number {
  return events.reduce((sum, e) => sum + (Number(e.budget_mid_tnd) || 0), 0);
}

export function totalBudgetRangeLabel(events: EventRecord[]): string {
  const min = events.reduce((sum, e) => sum + (Number(e.budget_min_tnd) || 0), 0);
  const max = events.reduce((sum, e) => sum + (Number(e.budget_max_tnd) || 0), 0);
  if (!min && !max) return 'Aucune estimation disponible';
  return `${Math.round(min).toLocaleString('fr-FR')} – ${Math.round(max).toLocaleString('fr-FR')} TND`;
}

export function averageConfidencePct(events: EventRecord[]): number {
  const withProb = events.filter((e) => e.prob != null && Number.isFinite(e.prob as number));
  if (!withProb.length) return 0;
  const avg =
    withProb.reduce((sum, e) => {
      const p = e.prob as number;
      return sum + (p <= 1 ? p * 100 : p);
    }, 0) / withProb.length;
  return Math.round(avg);
}

/** Délai moyen (en jours) entre la création et le passage en statut RESOLU. */
export function averageResolutionDays(events: EventRecord[]): number | null {
  const durations: number[] = [];
  for (const e of events) {
    const hist = e.status_history;
    if (!hist?.length || !e.ts_ms) continue;
    const resolvedEntry = [...hist].reverse().find((h) => h.to_status === 'RESOLU');
    if (!resolvedEntry?.ts_ms) continue;
    const days = (resolvedEntry.ts_ms - e.ts_ms) / 86_400_000;
    if (days >= 0) durations.push(days);
  }
  if (!durations.length) return null;
  return Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
}

export function citiesCoveredCount(events: EventRecord[]): number {
  return new Set(events.map((e) => e.city?.trim()).filter((c): c is string => !!c)).size;
}

export function potholeCountTotal(events: EventRecord[]): number {
  return events.filter((e) => isPotholeEvent(e)).length;
}

export function signsDamageCountTotal(events: EventRecord[]): number {
  return events.filter((e) => e.model === 'signs_damage' || e.task === 'signs_damage').length;
}

/** Répartition des sources de signalement (photo, vidéo, caméra live...). */
export function sourceBreakdown(events: EventRecord[]): { label: string; count: number; pct: number }[] {
  const labelFor = (s?: string | null) => {
    switch ((s ?? '').toLowerCase()) {
      case 'video':
        return 'Vidéo';
      case 'live':
      case 'camera':
        return 'Caméra en direct';
      case 'upload':
      case 'photo':
      case '':
        return 'Photo';
      default:
        return s ?? 'Photo';
    }
  };
  return topByCount(
    events.map((e) => labelFor(e.source)),
    6,
  );
}
