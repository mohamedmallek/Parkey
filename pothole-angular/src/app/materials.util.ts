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
      return 'Estimation fiable';
    case 'moyenne':
      return 'Estimation moyenne';
    case 'faible':
      return 'Estimation approximative';
    default:
      return confidence ?? '—';
  }
}

export function repairMethodLabel(method?: string | null): string {
  switch (method) {
    case 'gemini':
      return 'Estimation à partir de la photo';
    case 'rules_fallback':
    case 'rules_tunisia':
      return 'Estimation selon les dimensions';
    default:
      return method ? 'Estimation automatique' : '—';
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
