export type EventStatus = 'NOUVEAU' | 'CONFIRME' | 'EN_COURS' | 'RESOLU' | 'FAUX_POSITIF';
export type EventSeverity = 'CRITIQUE' | 'ELEVEE' | 'MOYENNE' | 'FAIBLE';

const STATUS_LABELS: Record<EventStatus, string> = {
  NOUVEAU: 'Nouveau',
  CONFIRME: 'Confirmé',
  EN_COURS: 'En cours',
  RESOLU: 'Résolu',
  FAUX_POSITIF: 'Faux positif',
};

const SEVERITY_LABELS: Record<EventSeverity, string> = {
  CRITIQUE: 'Critique',
  ELEVEE: 'Élevée',
  MOYENNE: 'Moyenne',
  FAIBLE: 'Faible',
};

export function statusLabel(status?: string | null): string {
  if (!status) return STATUS_LABELS.NOUVEAU;
  return STATUS_LABELS[status as EventStatus] ?? status;
}

export function statusCssClass(status?: string | null): string {
  switch (status) {
    case 'CONFIRME':
      return 'status-confirme';
    case 'EN_COURS':
      return 'status-en-cours';
    case 'RESOLU':
      return 'status-resolu';
    case 'FAUX_POSITIF':
      return 'status-faux-positif';
    default:
      return 'status-nouveau';
  }
}

export function severityLabel(severity?: string | null): string {
  if (!severity) return '—';
  return SEVERITY_LABELS[severity as EventSeverity] ?? severity;
}

export function severityCssClass(severity?: string | null): string {
  switch (severity) {
    case 'CRITIQUE':
      return 'severity-critique';
    case 'ELEVEE':
      return 'severity-elevee';
    case 'MOYENNE':
      return 'severity-moyenne';
    default:
      return 'severity-faible';
  }
}

export const ALL_STATUSES: EventStatus[] = ['NOUVEAU', 'CONFIRME', 'EN_COURS', 'RESOLU', 'FAUX_POSITIF'];
export const ALL_SEVERITIES: EventSeverity[] = ['CRITIQUE', 'ELEVEE', 'MOYENNE', 'FAIBLE'];
