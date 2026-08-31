import { Component, signal, viewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  ApiService,
  type EventRecord,
  type ModelInfo,
  type PredictResponse,
  type SignDetection,
} from './api.service';
import { AuthService, type UserInfo } from './auth.service';
import { EventsMapComponent } from './events-map.component';
import { EventFrameComponent } from './event-frame.component';
import {
  ALL_SEVERITIES,
  ALL_STATUSES,
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
import {
  formatMaterialLine,
  repairConfidenceLabel,
  repairMethodLabel,
  repairTypeLabel,
  type RepairMaterial,
} from './materials.util';

type AppSection = 'dashboard' | 'detection' | 'live' | 'video' | 'events' | 'gallery' | 'map' | 'users';
type GalleryPhotoKind = 'all' | 'pothole' | 'signs_damage';

type GalleryDayGroup = {
  key: string;
  label: string;
  events: EventRecord[];
  potholeCount: number;
  signsCount: number;
};

@Component({
  selector: 'app-root',
  imports: [CommonModule, EventsMapComponent, EventFrameComponent],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnDestroy {
  protected readonly title = signal('pothole-angular');

  protected readonly file = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly result = signal<PredictResponse | null>(null);
  protected readonly error = signal<string>('');
  protected readonly loading = signal<boolean>(false);
  protected readonly events = signal<EventRecord[]>([]);
  protected readonly eventsLoading = signal<boolean>(false);
  protected readonly eventsError = signal<string>('');
  protected readonly eventFilterStatus = signal('');
  protected readonly eventFilterCity = signal('');
  protected readonly eventFilterSeverity = signal('');
  protected readonly statusUpdatingId = signal<string | null>(null);
  protected readonly expandedHistoryId = signal<string | null>(null);
  protected readonly selectedSignalement = signal<EventRecord | null>(null);
  protected readonly signalementFrameUrl = signal<string | null>(null);
  protected readonly signalementFrameLoading = signal(false);
  protected readonly signalementFrameError = signal('');
  protected readonly workflowStatuses = ALL_STATUSES;
  protected readonly workflowSeverities = ALL_SEVERITIES;
  protected readonly statusLabel = statusLabel;
  protected readonly statusCssClass = statusCssClass;
  protected readonly severityLabel = severityLabel;
  protected readonly severityCssClass = severityCssClass;
  protected readonly sizeClassLabel = sizeClassLabel;
  protected readonly sizeClassShort = sizeClassShort;
  protected readonly sizeClassCss = sizeClassCss;
  protected readonly depthProxyLabel = depthProxyLabel;
  protected readonly formatSizeCm = formatSizeCm;
  protected readonly isPotholeEvent = isPotholeEvent;
  protected readonly formatMaterialLine = formatMaterialLine;
  protected readonly repairConfidenceLabel = repairConfidenceLabel;
  protected readonly repairMethodLabel = repairMethodLabel;
  protected readonly repairTypeLabel = repairTypeLabel;
  protected readonly geminiConfigured = signal(false);
  protected readonly materialsLoadingId = signal<string | null>(null);
  protected readonly materialsError = signal('');
  protected readonly city = signal<string>('Tunis');
  protected readonly zone = signal<string>('Centre-ville');
  protected readonly threshold = signal<number>(0.8);
  protected readonly gpsLoading = signal<boolean>(false);
  protected readonly gpsError = signal<string>('');
  protected readonly lat = signal<number | null>(null);
  protected readonly lon = signal<number | null>(null);
  protected readonly pendingMapsEvent = signal<EventRecord | null>(null);
  protected readonly videoFile = signal<File | null>(null);
  protected readonly sampleFps = signal<number>(1);
  protected readonly maxVideoFrames = signal<number>(0);
  protected readonly videoDurationSec = signal<number>(0);
  protected readonly videoLoading = signal<boolean>(false);
  protected readonly videoError = signal<string>('');
  protected readonly videoEvents = signal<EventRecord[]>([]);
  protected readonly videoModel = signal<string>('both');
  protected readonly videoSummary = signal<{ pothole: number; signs_damage: number } | null>(null);
  protected readonly videoNote = signal<string>('');
  protected readonly videoPreviewUrl = signal<string | null>(null);
  protected readonly ocrEnabled = signal<boolean>(true);
  protected readonly videoPlayer = viewChild<ElementRef<HTMLVideoElement>>('videoPlayer');
  protected readonly models = signal<ModelInfo[]>([
    { id: 'pothole', title: 'Nids-de-poule', task: 'pothole', kind: 'classifier', ready: true, path: 'models/model.pt' },
    {
      id: 'signs_damage',
      title: 'Signalétique cassée (détection)',
      task: 'signs_damage',
      kind: 'yolo',
      ready: false,
      path: 'models/signs_damage_yolo.pt',
    },
  ]);
  protected readonly selectedModel = signal<string>('pothole');
  protected readonly detections = signal<SignDetection[]>([]);
  protected readonly fileIsImage = signal<boolean>(false);
  protected readonly loginEmail = signal('');
  protected readonly loginPassword = signal('');
  protected readonly activeSection = signal<AppSection>('dashboard');
  protected readonly liveActive = signal(false);
  protected readonly liveError = signal('');
  protected readonly liveAnalyzing = signal(false);
  protected readonly liveModel = signal<'pothole' | 'signs_damage' | 'both'>('both');
  protected readonly liveIntervalSec = signal(3);
  protected readonly liveDetections = signal<SignDetection[]>([]);
  protected readonly liveAlerts = signal<EventRecord[]>([]);
  protected readonly liveFramesAnalyzed = signal(0);
  protected readonly liveLastResult = signal<PredictResponse | null>(null);
  protected readonly liveVideo = viewChild<ElementRef<HTMLVideoElement>>('liveVideo');
  protected readonly liveCanvas = viewChild<ElementRef<HTMLCanvasElement>>('liveCanvas');
  private liveStream: MediaStream | null = null;
  private liveIntervalId: ReturnType<typeof setInterval> | null = null;
  private liveCaptureInFlight = false;
  protected readonly mapSeekEvent = signal<EventRecord | null>(null);
  protected readonly sidebarOpen = signal(false);
  protected readonly loginError = signal('');
  protected readonly loginLoading = signal(false);
  protected readonly users = signal<UserInfo[]>([]);
  protected readonly usersLoading = signal(false);
  protected readonly usersSaving = signal(false);
  protected readonly usersError = signal('');
  protected readonly usersSuccess = signal('');
  protected readonly newUserName = signal('');
  protected readonly newUserEmail = signal('');
  protected readonly newUserRole = signal<'OPERATOR' | 'VIEWER'>('OPERATOR');
  protected readonly newUserPassword = signal('');
  protected readonly galleryPhotoKind = signal<GalleryPhotoKind>('all');
  protected readonly galleryCollapsedDays = signal<Set<string>>(new Set());
  protected readonly galleryMoreByDay = signal<Record<string, number>>({});
  protected readonly selectedGalleryEvent = signal<EventRecord | null>(null);
  protected readonly gallerySelectedIds = signal<Set<string>>(new Set());
  protected readonly galleryDeleting = signal(false);
  protected readonly galleryError = signal('');
  private readonly galleryPageSize = 12;

  /** Références stables pour le composant carte (évite bind dans le template). */
  protected readonly frameUrlFn = (id: string) => this.api.getEventFrameUrl(id);
  protected readonly toDateFn = (ts: number) => this.toDate(ts);

  constructor(
    private api: ApiService,
    protected readonly auth: AuthService,
  ) {
    if (this.auth.isLoggedIn()) {
      this.initAfterLogin();
    }
  }

  doLogout() {
    this.auth.logout();
    this.loginEmail.set('');
    this.loginPassword.set('');
    this.loginError.set('');
    this.activeSection.set('dashboard');
  }

  ngOnDestroy() {
    this.stopLiveCamera();
  }

  setSection(section: AppSection) {
    if (this.activeSection() === 'live' && section !== 'live') {
      this.stopLiveCamera();
    }
    this.activeSection.set(section);
    this.sidebarOpen.set(false);
    if (section === 'dashboard' || section === 'gallery') {
      this.refreshEvents(false);
    }
    if (section === 'map' || section === 'events') {
      this.refreshEvents();
    }
    if (section === 'video') {
      const ev = this.mapSeekEvent();
      if (ev) {
        this.mapSeekEvent.set(null);
        setTimeout(() => this.seekVideoToEvent(ev), 400);
      }
    }
  }

  onMapOpenVideo(e: EventRecord) {
    this.mapSeekEvent.set(e);
    this.setSection('video');
  }

  eventsWithCoordsCount() {
    return this.events().filter((e) => e.lat != null && e.lon != null).length;
  }

  toggleSidebar() {
    this.sidebarOpen.update((v) => !v);
  }

  canAnalyze() {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATOR';
  }

  canManageSignalements() {
    return this.canAnalyze();
  }

  countByStatus(status: EventStatus) {
    return this.events().filter((e) => (e.status ?? 'NOUVEAU') === status).length;
  }

  potholePhotoCount() {
    return this.events().filter((e) => this.isPotholeEvent(e)).length;
  }

  signsPhotoCount() {
    return this.events().filter((e) => this.isSignsEvent(e)).length;
  }

  isSignsEvent(e: EventRecord) {
    return e.model === 'signs_damage' || e.task === 'signs_damage';
  }

  setGalleryPhotoKind(kind: GalleryPhotoKind) {
    this.galleryPhotoKind.set(kind);
    this.galleryMoreByDay.set({});
    this.galleryCollapsedDays.set(new Set());
    this.gallerySelectedIds.set(new Set());
  }

  galleryDayGroups(): GalleryDayGroup[] {
    const kind = this.galleryPhotoKind();
    const filtered = this.events().filter((e) => {
      const pothole = this.isPotholeEvent(e);
      const signs = this.isSignsEvent(e);
      if (!pothole && !signs) return false;
      if (kind === 'pothole') return pothole;
      if (kind === 'signs_damage') return signs;
      return true;
    });

    const byDay = new Map<string, EventRecord[]>();
    for (const e of filtered) {
      const key = this.dayKey(e.ts_ms);
      const list = byDay.get(key);
      if (list) list.push(e);
      else byDay.set(key, [e]);
    }

    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, events]) => {
        events.sort((a, b) => (b.ts_ms ?? 0) - (a.ts_ms ?? 0));
        return {
          key,
          label: this.dayHeading(key),
          events,
          potholeCount: events.filter((e) => this.isPotholeEvent(e)).length,
          signsCount: events.filter((e) => this.isSignsEvent(e)).length,
        };
      });
  }

  isGalleryDayOpen(key: string) {
    return !this.galleryCollapsedDays().has(key);
  }

  toggleGalleryDay(key: string) {
    this.galleryCollapsedDays.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  galleryVisibleEvents(day: GalleryDayGroup) {
    const extra = this.galleryMoreByDay()[day.key] ?? 0;
    return day.events.slice(0, this.galleryPageSize + extra);
  }

  galleryHiddenCount(day: GalleryDayGroup) {
    return Math.max(0, day.events.length - this.galleryVisibleEvents(day).length);
  }

  showMoreGalleryDay(key: string) {
    this.galleryMoreByDay.update((m) => ({
      ...m,
      [key]: (m[key] ?? 0) + this.galleryPageSize,
    }));
  }

  openGalleryPhoto(e: EventRecord) {
    this.selectedGalleryEvent.set(e);
  }

  closeGalleryPhoto() {
    this.selectedGalleryEvent.set(null);
  }

  openGallerySignalement(e: EventRecord) {
    this.selectedGalleryEvent.set(null);
    this.openSignalementDetail(e);
    this.setSection('events');
  }

  galleryFilteredIds() {
    return this.galleryDayGroups().flatMap((day) => day.events.map((e) => e.id));
  }

  gallerySelectedCount() {
    return this.gallerySelectedIds().size;
  }

  isGallerySelected(id: string) {
    return this.gallerySelectedIds().has(id);
  }

  isGalleryAllSelected() {
    const ids = this.galleryFilteredIds();
    return ids.length > 0 && ids.every((id) => this.gallerySelectedIds().has(id));
  }

  toggleGallerySelect(id: string, event?: Event) {
    event?.stopPropagation();
    this.gallerySelectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleSelectAllGallery() {
    const ids = this.galleryFilteredIds();
    if (this.isGalleryAllSelected()) {
      this.gallerySelectedIds.set(new Set());
      return;
    }
    this.gallerySelectedIds.set(new Set(ids));
  }

  clearGallerySelection() {
    this.gallerySelectedIds.set(new Set());
  }

  private removeEventsByIds(ids: string[]) {
    const gone = new Set(ids);
    this.events.update((list) => list.filter((e) => !gone.has(e.id)));
    this.videoEvents.update((list) => list.filter((e) => !gone.has(e.id)));
    this.liveAlerts.update((list) => list.filter((e) => !gone.has(e.id)));
    this.gallerySelectedIds.update((current) => {
      const next = new Set(current);
      for (const id of gone) next.delete(id);
      return next;
    });
    const selected = this.selectedGalleryEvent();
    if (selected && gone.has(selected.id)) this.selectedGalleryEvent.set(null);
    const signalement = this.selectedSignalement();
    if (signalement && gone.has(signalement.id)) this.closeSignalementDetail();
  }

  deleteGalleryPhoto(e: EventRecord, event?: Event) {
    event?.stopPropagation();
    if (!this.canManageSignalements()) return;
    if (!confirm('Supprimer cette photo ?')) return;
    this.galleryError.set('');
    this.galleryDeleting.set(true);
    this.api.deleteEvent(e.id).subscribe({
      next: () => {
        this.removeEventsByIds([e.id]);
        this.galleryDeleting.set(false);
      },
      error: (err) => {
        this.galleryDeleting.set(false);
        this.galleryError.set(err?.error?.error ?? 'Suppression impossible');
      },
    });
  }

  deleteSelectedGalleryPhotos() {
    if (!this.canManageSignalements()) return;
    const ids = [...this.gallerySelectedIds()];
    if (!ids.length) return;
    if (!confirm(`Supprimer ${ids.length} photo${ids.length > 1 ? 's' : ''} sélectionnée${ids.length > 1 ? 's' : ''} ?`)) {
      return;
    }
    this.galleryError.set('');
    this.galleryDeleting.set(true);
    this.api.deleteEvents(ids).subscribe({
      next: () => {
        this.removeEventsByIds(ids);
        this.galleryDeleting.set(false);
      },
      error: (err) => {
        this.galleryDeleting.set(false);
        this.galleryError.set(err?.error?.error ?? 'Suppression impossible');
      },
    });
  }

  private dayKey(ts: number) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private dayHeading(key: string) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    const today = new Date();
    const todayKey = this.dayKey(today.getTime());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const long = date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const titled = long.charAt(0).toUpperCase() + long.slice(1);
    if (key === todayKey) return `Aujourd'hui — ${titled}`;
    if (key === this.dayKey(yesterday.getTime())) return `Hier — ${titled}`;
    return titled;
  }

  eventCities() {
    const set = new Set<string>();
    for (const e of this.events()) {
      if (e.city?.trim()) set.add(e.city.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  applyEventFilters() {
    this.refreshEvents();
  }

  clearEventFilters() {
    this.eventFilterStatus.set('');
    this.eventFilterCity.set('');
    this.eventFilterSeverity.set('');
    this.refreshEvents();
  }

  toggleEventHistory(id: string, event?: Event) {
    if (event) event.stopPropagation();
    this.expandedHistoryId.update((cur) => (cur === id ? null : id));
  }

  openSignalementDetail(e: EventRecord) {
    this.selectedSignalement.set(e);
    this.loadSignalementFrame(e);
  }

  closeSignalementDetail() {
    this.selectedSignalement.set(null);
    this.revokeSignalementFrame();
  }

  private signalementFrameObjectUrl: string | null = null;

  private revokeSignalementFrame() {
    if (this.signalementFrameObjectUrl) {
      URL.revokeObjectURL(this.signalementFrameObjectUrl);
      this.signalementFrameObjectUrl = null;
    }
    this.signalementFrameUrl.set(null);
    this.signalementFrameLoading.set(false);
    this.signalementFrameError.set('');
  }

  loadSignalementFrame(e: EventRecord) {
    this.revokeSignalementFrame();
    this.signalementFrameLoading.set(true);
    this.api.getEventFrame(e.id).subscribe({
      next: (blob) => {
        this.signalementFrameObjectUrl = URL.createObjectURL(blob);
        this.signalementFrameUrl.set(this.signalementFrameObjectUrl);
        this.signalementFrameLoading.set(false);
      },
      error: () => {
        this.signalementFrameLoading.set(false);
        this.signalementFrameError.set('Capture non disponible pour ce signalement.');
      },
    });
  }

  signalementBboxStyle(e: EventRecord) {
    const b = e.bbox_norm;
    if (!b) return {};
    return {
      left: `${b.x1 * 100}%`,
      top: `${b.y1 * 100}%`,
      width: `${(b.x2 - b.x1) * 100}%`,
      height: `${(b.y2 - b.y1) * 100}%`,
    };
  }

  signalementHasBbox(e: EventRecord) {
    return e.bbox_norm != null;
  }

  stopClick(event: Event) {
    event.stopPropagation();
  }

  analyzeMaterialsForSignalement(e: EventRecord) {
    this.materialsLoadingId.set(e.id);
    this.materialsError.set('');
    this.api.analyzeMaterialsForEvent(e).subscribe({
      next: (res) => {
        const updated = res.event;
        if (updated) {
          this.events.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
          if (this.selectedSignalement()?.id === updated.id) {
            this.selectedSignalement.set(updated);
          }
        }
        this.materialsLoadingId.set(null);
      },
      error: (err) => {
        this.materialsLoadingId.set(null);
        this.materialsError.set(err?.error?.error ?? 'Analyse matériaux impossible');
      },
    });
  }

  signalementMaterialsSummary(e: EventRecord): string {
    const mats = e.repair_materials ?? [];
    if (!mats.length) return '—';
    if (mats.length === 1) return formatMaterialLine(mats[0]);
    return `${mats.length} matériaux`;
  }

  eventMaterials(e: EventRecord): RepairMaterial[] {
    return e.repair_materials ?? [];
  }

  updateEventStatus(event: EventRecord, status: EventStatus, note?: string) {
    this.statusUpdatingId.set(event.id);
    this.eventsError.set('');
    this.api.updateEventStatus(event.id, status, note).subscribe({
      next: (res) => {
        const updated = res.event;
        this.events.update((list) => list.map((e) => (e.id === updated.id ? updated : e)));
        if (this.selectedSignalement()?.id === updated.id) {
          this.selectedSignalement.set(updated);
        }
        this.statusUpdatingId.set(null);
      },
      error: (err) => {
        this.statusUpdatingId.set(null);
        this.eventsError.set(err?.error?.error ?? 'Mise à jour du statut impossible');
      },
    });
  }

  confirmEvent(event: EventRecord) {
    this.updateEventStatus(event, 'CONFIRME', 'Validé par opérateur');
  }

  rejectEvent(event: EventRecord) {
    this.updateEventStatus(event, 'FAUX_POSITIF', 'Rejeté — erreur IA');
  }

  planEvent(event: EventRecord) {
    this.updateEventStatus(event, 'EN_COURS', 'Intervention planifiée');
  }

  resolveEvent(event: EventRecord) {
    this.updateEventStatus(event, 'RESOLU', 'Réparation effectuée');
  }

  onMapStatusChange(payload: { event: EventRecord; status: EventStatus }) {
    const notes: Partial<Record<EventStatus, string>> = {
      CONFIRME: 'Validé depuis la carte',
      FAUX_POSITIF: 'Rejeté depuis la carte',
      EN_COURS: 'Intervention planifiée (carte)',
      RESOLU: 'Résolu depuis la carte',
    };
    this.updateEventStatus(payload.event, payload.status, notes[payload.status]);
  }

  doLogin() {
    this.loginError.set('');
    this.loginLoading.set(true);
    this.auth.login(this.loginEmail().trim().toLowerCase(), this.loginPassword().trim()).subscribe({
      next: () => {
        this.loginLoading.set(false);
        this.initAfterLogin();
      },
      error: (err) => {
        this.loginLoading.set(false);
        this.loginError.set(err?.error?.error ?? 'Connexion impossible');
      },
    });
  }

  private initAfterLogin() {
    this.api.listModels().subscribe({
      next: (res) => {
        if (res.models?.length) this.models.set(res.models);
        if (res.default) this.selectedModel.set(res.default);
      },
      error: () => {},
    });
    this.refreshEvents(false);
    this.api.getMaterialsStatus().subscribe({
      next: (s) => this.geminiConfigured.set(!!s.gemini_configured),
      error: () => this.geminiConfigured.set(false),
    });
    if (this.auth.user()?.role === 'ADMIN') {
      this.loadUsers();
    }
  }

  loadUsers() {
    this.usersLoading.set(true);
    this.usersError.set('');
    this.api.listUsers().subscribe({
      next: (res) => {
        this.users.set(res.users ?? []);
        this.usersLoading.set(false);
      },
      error: (err) => {
        this.usersError.set(err?.error?.error ?? 'Impossible de charger les utilisateurs');
        this.usersLoading.set(false);
      },
    });
  }

  createUser() {
    const email = this.newUserEmail().trim();
    const fullName = this.newUserName().trim();
    if (!email || !fullName) {
      this.usersError.set('Nom et email obligatoires');
      return;
    }
    this.usersSaving.set(true);
    this.usersError.set('');
    this.usersSuccess.set('');
    const body: { email: string; fullName: string; role: 'OPERATOR' | 'VIEWER'; password?: string } = {
      email,
      fullName,
      role: this.newUserRole(),
    };
    const pwd = this.newUserPassword().trim();
    if (pwd) body.password = pwd;
    this.api.createUser(body).subscribe({
      next: (res) => {
        this.usersSaving.set(false);
        this.usersSuccess.set(
          (res.message ?? 'Compte créé') +
            ` — connexion avec : ${email} (mot de passe exact de l'email, sans espaces)`,
        );
        this.newUserName.set('');
        this.newUserEmail.set('');
        this.newUserPassword.set('');
        this.loadUsers();
      },
      error: (err) => {
        this.usersSaving.set(false);
        this.usersError.set(err?.error?.error ?? 'Création échouée');
      },
    });
  }

  deleteUser(id: string) {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    this.api.deleteUser(id).subscribe({
      next: () => this.loadUsers(),
      error: (err) => this.usersError.set(err?.error?.error ?? 'Suppression échouée'),
    });
  }

  parseNumber(v: unknown) {
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : 0.8;
  }

  parseIntSafe(v: unknown, fallback: number) {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  alertCount() {
    return this.events().filter((e) => e.alert).length;
  }

  activeModelTitle() {
    const m = this.models().find((x) => x.id === this.selectedModel());
    return m?.title ?? this.selectedModel();
  }

  modelsReadyCount() {
    return this.models().filter((m) => m.ready).length;
  }

  videoPotholeEvents() {
    return this.videoEvents().filter((e) => e.model === 'pothole');
  }

  videoSignsEvents() {
    return this.videoEvents().filter((e) => e.model === 'signs_damage');
  }

  useGps() {
    this.gpsError.set('');
    if (!('geolocation' in navigator)) {
      this.gpsError.set('Geolocation not supported by this browser.');
      return;
    }
    this.gpsLoading.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.lat.set(pos.coords.latitude);
        this.lon.set(pos.coords.longitude);
        this.gpsLoading.set(false);

        const pending = this.pendingMapsEvent();
        if (pending) {
          this.pendingMapsEvent.set(null);
          // Now that we have coords, try opening maps again.
          this.openMaps(pending);
        }
      },
      (err) => {
        this.gpsError.set(err?.message ? String(err.message) : 'GPS error');
        this.gpsLoading.set(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
  }

  bboxStyle(d: SignDetection) {
    const b = d.bbox_norm;
    return {
      left: `${b.x1 * 100}%`,
      top: `${b.y1 * 100}%`,
      width: `${(b.x2 - b.x1) * 100}%`,
      height: `${(b.y2 - b.y1) * 100}%`,
    };
  }

  openMapsFromDetection(d: SignDetection) {
    const lat = d.street?.lat ?? this.lat();
    const lon = d.street?.lon ?? this.lon();
    this.openMaps({ id: '', ts_ms: 0, label: d.label, prob: d.conf, lat, lon });
  }

  onFile(e: Event) {
    this.error.set('');
    this.result.set(null);
    this.detections.set([]);

    const input = e.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.file.set(f);
    this.fileIsImage.set(f ? this.isImageFile(f) : false);

    if (f && !this.isImageFile(f)) {
      this.error.set(
        'Ce fichier est une vidéo ou un format non supporté. Pour une vidéo, descendez à « Analyse séquentielle ».',
      );
    }

    const prev = this.previewUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.previewUrl.set(f && this.isImageFile(f) ? URL.createObjectURL(f) : null);
  }

  isImageFile(f: File) {
    if (f.type.startsWith('image/')) return true;
    return /\.(jpe?g|png|webp|bmp)$/i.test(f.name);
  }

  onPredict() {
    const f = this.file();
    if (!f) return;
    if (!this.isImageFile(f)) {
      this.error.set('Choisissez une photo (JPG/PNG), pas une vidéo MP4.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.api
      .predict(f, {
        model: this.selectedModel(),
        source: 'angular',
        city: this.city().trim(),
        zone: this.zone().trim(),
        threshold: this.threshold(),
        lat: this.lat() ?? undefined,
        lon: this.lon() ?? undefined,
      })
      .subscribe({
      next: (res) => {
        this.result.set(res);
        let dets = res.detections ?? [];
        const ev = res.event;
        const bbox = res.size_estimate?.bbox_norm ?? ev?.bbox_norm;
        if (!dets.length && bbox && (res.model === 'pothole' || this.selectedModel() === 'pothole')) {
          dets = [
            {
              label: res.label,
              conf: res.prob,
              bbox_norm: bbox,
            },
          ];
        }
        this.detections.set(dets);
        this.loading.set(false);
        const newEv = res.events?.length ? res.events : res.event ? [res.event] : [];
        if (newEv.length) this.events.set([...newEv, ...this.events()].slice(0, 200));
      },
      error: (err) => {
        this.error.set(this.formatApiError(err));
        this.loading.set(false);
      },
    });
  }

  formatApiError(err: unknown): string {
    const e = err as { error?: unknown; message?: string; status?: number };
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'TimeoutError') {
      return 'Timeout';
    }
    if (e?.error && typeof e.error === 'object' && e.error !== null && 'error' in e.error) {
      return String((e.error as { error: string }).error);
    }
    if (typeof e?.error === 'string') {
      if (e.error.includes('<!doctype') || e.error.includes('<html')) {
        return 'Erreur serveur (500). Vérifiez que vous envoyez une image JPG/PNG, pas une vidéo.';
      }
      return e.error.slice(0, 500);
    }
    if (e?.error && typeof e.error === 'object') {
      try {
        return JSON.stringify(e.error);
      } catch {
        return 'Erreur API';
      }
    }
    return e?.message ? String(e.message) : 'Erreur inconnue';
  }

  onVideoMetadata() {
    const v = this.videoPlayer()?.nativeElement;
    if (!v || !Number.isFinite(v.duration)) return;
    this.videoDurationSec.set(v.duration);
    const d = v.duration;
    if (d > 900 && this.sampleFps() > 0.5) this.sampleFps.set(0.5);
    else if (d > 300 && this.sampleFps() > 1) this.sampleFps.set(1);
  }

  estimatedVideoSamples() {
    const d = this.videoDurationSec();
    const fps = this.sampleFps();
    const max = this.maxVideoFrames();
    if (d <= 0 || fps <= 0) return 0;
    const est = Math.ceil(d * fps);
    return max > 0 ? Math.min(est, max) : est;
  }

  formatDuration(sec: number) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  onVideo(e: Event) {
    this.videoError.set('');
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.videoFile.set(f);

    const prev = this.videoPreviewUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.videoPreviewUrl.set(f ? URL.createObjectURL(f) : null);
    this.videoDurationSec.set(0);
    this.videoEvents.set([]);
    this.videoSummary.set(null);
  }

  seekVideoToEvent(e: EventRecord) {
    const v = this.videoPlayer()?.nativeElement;
    if (!v || e.video_ts_ms == null) return;
    const sec = e.video_ts_ms / 1000;
    v.currentTime = sec;
    v.play().catch(() => {});
    v.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  coordLabel(e: EventRecord) {
    if (e.lat != null && e.lon != null) return `${e.lat}, ${e.lon}`;
    if (this.lat() != null && this.lon() != null) return `GPS appareil: ${this.lat()}, ${this.lon()}`;
    return '— (activez GPS ou OCR sur la vidéo)';
  }

  timeLabel(e: EventRecord) {
    const ms = e.video_ts_ms ?? 0;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `Moment: ${m}:${rs.toString().padStart(2, '0')} (${ms} ms)`;
  }

  analyzeVideo() {
    const f = this.videoFile();
    if (!f) return;
    this.videoLoading.set(true);
    this.videoError.set('');
    this.videoNote.set('');
    this.videoSummary.set(null);
    this.videoEvents.set([]);
    this.api
      .analyzeVideo(f, {
        model: this.videoModel() as 'pothole' | 'signs_damage' | 'both',
        city: this.city().trim(),
        zone: this.zone().trim(),
        threshold: this.threshold(),
        sample_fps: this.sampleFps(),
        max_frames: this.maxVideoFrames(),
        ocr_enabled: this.ocrEnabled(),
        source: 'video-test',
        lat: this.lat() ?? undefined,
        lon: this.lon() ?? undefined,
      })
      .subscribe({
        next: (res) => {
          this.videoEvents.set(res.events ?? []);
          this.videoSummary.set(res.summary ?? null);
          this.videoNote.set(res.note ?? '');
          this.videoLoading.set(false);
          if ((res.events ?? []).length) this.events.set([...(res.events ?? []), ...this.events()].slice(0, 200));
          if (!res.events?.length) {
            this.videoError.set(
              'Aucune alerte sur toute la vidéo. Baissez le seuil (ex. 0.5) ou testez un autre modèle.',
            );
          }
        },
        error: (err) => {
          const msg = this.formatApiError(err);
          if (msg.includes('Timeout') || msg.includes('timeout')) {
            this.videoError.set(
              'Délai dépassé. Réduisez max images à 50, FPS à 0.5, ou testez un extrait de 1–2 min.',
            );
          } else {
            this.videoError.set(msg);
          }
          this.videoLoading.set(false);
        },
      });
  }

  frameUrl(eventId: string) {
    return this.api.getEventFrameUrl(eventId);
  }

  openMaps(e: EventRecord) {
    const lat = e.lat ?? this.lat();
    const lon = e.lon ?? this.lon();
    if (lat == null || lon == null) {
      this.pendingMapsEvent.set(e);
      this.gpsError.set('Veuillez autoriser le GPS (puis je vais ouvrir Google Maps automatiquement).');
      this.useGps();
      return;
    }
    const url = `https://www.google.com/maps?q=${encodeURIComponent(String(lat) + ',' + String(lon))}`;
    window.open(url, '_blank');
  }

  refreshEvents(useFilters = true) {
    this.eventsLoading.set(true);
    this.eventsError.set('');
    const filters: { status?: string; city?: string; severity?: string } = {};
    if (useFilters) {
      const st = this.eventFilterStatus().trim();
      const city = this.eventFilterCity().trim();
      const sev = this.eventFilterSeverity().trim();
      if (st) filters.status = st;
      if (city) filters.city = city;
      if (sev) filters.severity = sev;
    }
    this.api.listEvents(useFilters ? 500 : 1000, filters).subscribe({
      next: (res) => {
        this.events.set(res.events ?? []);
        this.eventsLoading.set(false);
      },
      error: (err) => {
        const msg =
          err?.error ? JSON.stringify(err.error) : err?.message ? String(err.message) : String(err);
        this.eventsError.set(msg);
        this.eventsLoading.set(false);
      },
    });
  }

  toDate(ts: number) {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadJson() {
    this.api.exportJson().subscribe((blob) => this.downloadBlob(blob, 'events.json'));
  }

  downloadCsv() {
    this.api.exportCsv().subscribe((blob) => this.downloadBlob(blob, 'events.csv'));
  }

  async startLiveCamera() {
    this.liveError.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.liveError.set('Votre navigateur ne supporte pas l’accès à la caméra.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.liveStream = stream;
      const video = this.liveVideo()?.nativeElement;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      this.liveActive.set(true);
      this.liveDetections.set([]);
      this.liveAlerts.set([]);
      this.liveFramesAnalyzed.set(0);
      this.liveLastResult.set(null);
      this.startLiveLoop();
      setTimeout(() => this.captureLiveFrame(), 800);
    } catch (err) {
      this.liveError.set(err instanceof Error ? err.message : 'Accès caméra refusé');
      this.liveActive.set(false);
    }
  }

  stopLiveCamera() {
    if (this.liveIntervalId != null) {
      clearInterval(this.liveIntervalId);
      this.liveIntervalId = null;
    }
    if (this.liveStream) {
      for (const track of this.liveStream.getTracks()) track.stop();
      this.liveStream = null;
    }
    const video = this.liveVideo()?.nativeElement;
    if (video) video.srcObject = null;
    this.liveActive.set(false);
    this.liveAnalyzing.set(false);
    this.liveCaptureInFlight = false;
  }

  private startLiveLoop() {
    if (this.liveIntervalId != null) clearInterval(this.liveIntervalId);
    const ms = Math.max(2, this.liveIntervalSec()) * 1000;
    this.liveIntervalId = setInterval(() => this.captureLiveFrame(), ms);
  }

  onLiveIntervalChange(v: unknown) {
    const sec = Math.max(2, Math.min(15, this.parseNumber(v)));
    this.liveIntervalSec.set(sec);
    if (this.liveActive()) this.startLiveLoop();
  }

  captureLiveFrame() {
    if (this.liveCaptureInFlight || !this.liveActive()) return;
    const video = this.liveVideo()?.nativeElement;
    const canvas = this.liveCanvas()?.nativeElement;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;

    this.liveCaptureInFlight = true;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.liveCaptureInFlight = false;
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.liveCaptureInFlight = false;
          return;
        }
        const file = new File([blob], `live-${Date.now()}.jpg`, { type: 'image/jpeg' });
        this.analyzeLiveFrame(file);
      },
      'image/jpeg',
      0.85,
    );
  }

  private analyzeLiveFrame(file: File) {
    this.liveAnalyzing.set(true);
    this.liveError.set('');
    const models = this.liveModelsToRun();
    this.runLiveModels(file, models, 0, [], null);
  }

  private liveModelsToRun(): string[] {
    const m = this.liveModel();
    if (m === 'both') return ['pothole', 'signs_damage'];
    return [m];
  }

  private runLiveModels(
    file: File,
    models: string[],
    index: number,
    allDets: SignDetection[],
    lastAlert: PredictResponse | null,
  ) {
    if (index >= models.length || !this.liveActive()) {
      this.liveDetections.set(allDets);
      if (lastAlert) this.liveLastResult.set(lastAlert);
      this.liveFramesAnalyzed.update((n) => n + 1);
      this.liveAnalyzing.set(false);
      this.liveCaptureInFlight = false;
      return;
    }

    const model = models[index];
    this.api
      .predict(file, {
        model,
        source: 'live-camera',
        city: this.city().trim(),
        zone: this.zone().trim(),
        threshold: this.threshold(),
        lat: this.lat() ?? undefined,
        lon: this.lon() ?? undefined,
      })
      .subscribe({
        next: (res) => {
          const dets = this.extractDetections(res, model);
          const merged = [...allDets, ...dets];
          const newEv = res.events?.length ? res.events : res.event ? [res.event] : [];
          if (newEv.length) {
            this.liveAlerts.update((list) => [...newEv, ...list].slice(0, 50));
            this.events.update((list) => [...newEv, ...list].slice(0, 200));
          }
          const isAlert =
            !!res.event?.alert ||
            (res.detection_count ?? 0) > 0 ||
            (model === 'pothole' && res.label === 'potholes');
          this.runLiveModels(file, models, index + 1, merged, isAlert ? res : lastAlert);
        },
        error: (err) => {
          this.liveError.set(this.formatApiError(err));
          this.liveAnalyzing.set(false);
          this.liveCaptureInFlight = false;
        },
      });
  }

  private extractDetections(res: PredictResponse, model: string): SignDetection[] {
    let dets = res.detections ?? [];
    const bbox = res.size_estimate?.bbox_norm ?? res.event?.bbox_norm;
    if (!dets.length && bbox && model === 'pothole') {
      dets = [{ label: res.label, conf: res.prob, bbox_norm: bbox }];
    }
    return dets;
  }

  livePotholeAlerts() {
    return this.liveAlerts().filter((e) => e.model === 'pothole' || !e.model);
  }

  liveSignsAlerts() {
    return this.liveAlerts().filter((e) => e.model === 'signs_damage');
  }
}
