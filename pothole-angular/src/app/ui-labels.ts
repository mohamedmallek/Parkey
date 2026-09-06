/** Libellés grand public — aucun jargon technique dans l’interface. */

export function roleLabel(role?: string | null): string {
  switch (role) {
    case 'SUPERADMIN':
      return 'Superadmin';
    case 'ADMIN':
      return 'Administrateur';
    case 'OPERATOR':
      return 'Opérateur';
    case 'VIEWER':
      return 'Lecteur';
    default:
      return role ?? '';
  }
}

export function modelLabel(model?: string | null): string {
  switch (model) {
    case 'signs_damage':
      return 'Panneau abîmé';
    case 'pothole':
      return 'Nid-de-poule';
    case 'both':
      return 'Tous les types';
    default:
      return model ? displayLabel(model) : '—';
  }
}

export function isClearFinding(e: { label?: string | null; alert?: boolean | null }): boolean {
  if (e.alert === true) return false;
  const shown = displayLabel(e.label);
  return shown === 'Rien à signaler' || shown === 'Route en bon état';
}

export function findingLabel(e: { label?: string | null; model?: string | null; alert?: boolean | null }): string {
  if (isClearFinding(e)) return 'Rien à signaler';
  const label = displayLabel(e.label);
  if (label && label !== '—' && label !== 'Rien à signaler' && label !== 'Route en bon état') return label;
  return modelLabel(e.model);
}

export function displayLabel(raw?: string | null): string {
  const v = (raw ?? '').trim();
  if (!v) return '—';
  const key = v.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const known: Record<string, string> = {
    pothole: 'Nid-de-poule',
    potholes: 'Nid-de-poule',
    'no pothole': 'Route en bon état',
    'no potholes': 'Route en bon état',
    normal: 'Rien à signaler',
    ok: 'Rien à signaler',
    compliant: 'Rien à signaler',
    signs: 'Panneau',
    'signs damage': 'Panneau abîmé',
    damaged: 'Panneau abîmé',
    'damaged sign': 'Panneau abîmé',
    'broken sign': 'Panneau abîmé',
    sign: 'Panneau abîmé',
    none: 'Rien à signaler',
    poor: 'Panneau abîmé',
    'very poor': 'Panneau très abîmé',
    'fallen sign': 'Panneau à terre',
    fallen: 'Panneau à terre',
    acceptable: 'Rien à signaler',
    good: 'Rien à signaler',
    'very good': 'Rien à signaler',
  };
  if (known[key]) return known[key];
  if (key.includes('pothole')) return 'Nid-de-poule';
  if (key.includes('fallen') || key.includes('terre')) return 'Panneau à terre';
  if (key.includes('poor') || key.includes('sign')) return 'Panneau abîmé';
  return v;
}

export function confidencePct(prob?: number | null): string {
  if (prob == null || !Number.isFinite(prob)) return '—';
  const pct = prob <= 1 ? prob * 100 : prob;
  return `${Math.round(pct)} %`;
}

export function placeLabel(opts: { city?: string | null; zone?: string | null; lat?: number | null; lon?: number | null }): string {
  const city = opts.city?.trim();
  const zone = opts.zone?.trim();
  if (city && zone) return `${city} · ${zone}`;
  if (city) return city;
  if (zone) return zone;
  if (opts.lat != null && opts.lon != null) return 'Position enregistrée';
  return 'Position inconnue';
}
