export type RepairMaterial = {
  name?: string;
  quantity?: number | string | null;
  unit?: string | null;
  role?: string | null;
};

export type RepairAnalysis = {
  method?: string;
  materials?: RepairMaterial[];
  repair_steps?: string[];
  pothole_assessment?: {
    severity?: string;
    repair_type?: string;
    estimated_depth?: string;
  };
  note?: string;
  confidence?: string;
  disclaimer?: string;
  error?: string;
  gemini_available?: boolean;
  gemini_error?: string;
  gemini_quota_exceeded?: boolean;
};

export function formatMaterialLine(m: RepairMaterial): string {
  const name = m.name ?? '—';
  const qty = m.quantity;
  const unit = (m.unit ?? '').trim();
  if (qty == null || qty === '') return name;
  return unit ? `${name} — ${qty} ${unit}` : `${name} — ${qty}`;
}

export function repairConfidenceLabel(confidence?: string | null): string {
  switch ((confidence ?? '').toLowerCase()) {
    case 'haute':
      return 'Confiance élevée';
    case 'moyenne':
      return 'Confiance moyenne';
    case 'faible':
      return 'Confiance faible';
    default:
      return confidence ?? '—';
  }
}

export function repairMethodLabel(method?: string | null): string {
  switch (method) {
    case 'gemini':
      return 'Analyse Gemini (photo)';
    case 'rules_fallback':
      return 'Barème ONSR (Gemini indisponible)';
    case 'rules_tunisia':
      return 'Barème ONSR (dimensions IA)';
    default:
      return method ?? '—';
  }
}

export function repairTypeLabel(type?: string | null): string {
  switch ((type ?? '').toLowerCase()) {
    case 'colmatage':
      return 'Colmatage';
    case 'refection_partielle':
      return 'Réfection partielle';
    case 'refection_profonde':
      return 'Réfection profonde';
    default:
      return type ?? '—';
  }
}
