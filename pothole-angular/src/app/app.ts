import { ChangeDetectionStrategy, Component, HostListener, signal, viewChild, viewChildren, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import {
  ApiService,
  type EventRecord,
  type ModelInfo,
  type PredictResponse,
  type SignDetection,
  type UserActivity,
  type UserSessionEntry,
} from './api.service';
import { AuthService, type UserInfo } from './auth.service';
import { EventsMapComponent } from './events-map.component';
import { EventFrameComponent } from './event-frame.component';
import { CountUpDirective } from './count-up.directive';
import { DashboardChartsComponent } from './dashboard-charts.component';
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
  compactRepairMaterials,
  formatMaterialLine,
  repairTypeLabel,
  type RepairMaterial,
} from './materials.util';
import { confidencePct, displayLabel, findingLabel, isClearFinding, modelLabel, placeLabel, roleLabel } from './ui-labels';
import {
  averageConfidencePct,
  averageResolutionDays,
  citiesCoveredCount,
  depthBreakdown,
  potholeCountTotal,
  severityBreakdown,
  signsDamageCountTotal,
  sizeBreakdown,
  sourceBreakdown,
  statusBreakdown,
  topByCount,
  totalBudgetMidTnd,
  totalBudgetRangeLabel,
} from './stats.util';

type AppSection = 'dashboard' | 'detection' | 'live' | 'video' | 'events' | 'gallery' | 'map' | 'users' | 'activity';
type GalleryPhotoKind = 'all' | 'pothole' | 'signs_damage';

type GalleryDayGroup = {
  key: string;
  label: string;
  events: EventRecord[];
  potholeCount: number;
  signsCount: number;
};

type AccueilScene = {
  id: 'city' | 'sign' | 'pothole';
  src: string;
  label: string;
  kicker: string;
  title: string;
  text: string;
  target: AppSection;
};

@Component({
  selector: 'app-main',
  imports: [CommonModule, NgOptimizedImage, EventsMapComponent, EventFrameComponent, CountUpDirective, DashboardChartsComponent],
  styleUrl: './app.scss',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnDestroy {
  protected readonly title = signal('pothole-angular');

  protected readonly file = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly photoDragOver = signal(false);
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
  protected readonly assignUpdatingId = signal<string | null>(null);
  protected readonly resolveEventTarget = signal<EventRecord | null>(null);
  protected readonly resolveAfterFile = signal<File | null>(null);
  protected readonly resolveAfterPreview = signal<string | null>(null);
  protected readonly resolveBeforeUrl = signal<string | null>(null);
  protected readonly resolveError = signal('');
  protected readonly resolveLoading = signal(false);
  protected readonly signalementAfterUrl = signal<string | null>(null);
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
  protected readonly compactRepairMaterials = compactRepairMaterials;
  protected readonly formatMaterialLine = formatMaterialLine;
  protected readonly repairTypeLabel = repairTypeLabel;
  protected readonly roleLabel = roleLabel;
  protected readonly displayLabel = displayLabel;
  protected readonly findingLabel = findingLabel;
  protected readonly isClearFinding = isClearFinding;
  protected readonly modelLabel = modelLabel;
  protected readonly confidencePct = confidencePct;
  protected readonly placeLabel = placeLabel;

  placeOf(e: { city?: string | null; zone?: string | null; lat?: number | null; lon?: number | null }) {
    return placeLabel(e);
  }

  displayName(name?: string | null) {
    return (name ?? '').replace(/\bONSR\b/gi, '').replace(/\s+/g, ' ').trim();
  }

  headerLabel() {
    const name = this.displayName(this.auth.user()?.fullName);
    const role = this.roleLabel(this.auth.user()?.role);
    if (!name || name.toLowerCase() === role.toLowerCase()) return '';
    return name;
  }
  protected readonly geminiConfigured = signal(false);
  protected readonly materialsLoadingId = signal<string | null>(null);
  protected readonly materialsError = signal('');
  protected readonly city = signal<string>('');
  protected readonly zone = signal<string>('');
  protected readonly threshold = signal<number>(0.8);
  protected readonly gpsLoading = signal<boolean>(false);
  protected readonly placeLoading = signal<boolean>(false);
  protected readonly gpsAccuracy = signal<number | null>(null);
  protected readonly gpsError = signal<string>('');
  protected readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');
  protected readonly lat = signal<number | null>(null);
  protected readonly lon = signal<number | null>(null);
  protected readonly pendingMapsEvent = signal<EventRecord | null>(null);
  protected readonly videoFile = signal<File | null>(null);
  protected readonly sampleFps = signal<number>(0.5);
  protected readonly maxVideoFrames = signal<number>(40);
  protected readonly videoDurationSec = signal<number>(0);
  protected readonly videoLoading = signal<boolean>(false);
  protected readonly videoError = signal<string>('');
  protected readonly videoEvents = signal<EventRecord[]>([]);
  protected readonly videoModel = signal<string>('both');
  protected readonly videoSummary = signal<{ pothole: number; signs_damage: number } | null>(null);
  protected readonly videoNote = signal<string>('');
  protected readonly videoPreviewUrl = signal<string | null>(null);
  protected readonly ocrEnabled = signal<boolean>(false);
  protected readonly videoPlayer = viewChild<ElementRef<HTMLVideoElement>>('videoPlayer');
  protected readonly models = signal<ModelInfo[]>([
    { id: 'pothole', title: 'Nids-de-poule', task: 'pothole', kind: 'classifier', ready: true, path: 'models/model.pt' },
    {
      id: 'signs_damage',
      title: 'Panneaux abîmés',
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
  protected readonly authScreen = signal<'login' | 'forgot' | 'welcome' | 'change-password'>('login');
  protected readonly forgotEmail = signal('');
  protected readonly forgotLoading = signal(false);
  protected readonly forgotError = signal('');
  protected readonly forgotMessage = signal('');
  protected readonly loginSuccess = signal('');
  protected readonly changeCurrent = signal('');
  protected readonly changePassword = signal('');
  protected readonly changeConfirm = signal('');
  protected readonly changeLoading = signal(false);
  protected readonly changeError = signal('');
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
  protected readonly liveLastPothole = signal<PredictResponse | null>(null);
  protected readonly liveLastSigns = signal<PredictResponse | null>(null);
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
  protected readonly newUserRole = signal<'ADMIN' | 'OPERATOR' | 'VIEWER'>('OPERATOR');
  protected readonly newUserPassword = signal('');
  // --- Suivi d'activité (Superadmin/Admin) ---
  protected readonly activityUsers = signal<UserActivity[]>([]);
  protected readonly activityLoading = signal(false);
  protected readonly activityError = signal('');
  protected readonly expandedActivityUserId = signal<string | null>(null);
  protected readonly activitySessions = signal<UserSessionEntry[]>([]);
  protected readonly activitySessionsLoading = signal(false);
  protected readonly activitySessionsPage = signal(0);
  protected readonly activitySessionsTotalPages = signal(0);
  private activityRefreshTimer: ReturnType<typeof setInterval> | null = null;
  protected readonly galleryPhotoKind = signal<GalleryPhotoKind>('all');
  protected readonly galleryCollapsedDays = signal<Set<string>>(new Set());
  protected readonly galleryMoreByDay = signal<Record<string, number>>({});
  protected readonly selectedGalleryEvent = signal<EventRecord | null>(null);
  protected readonly gallerySelectedIds = signal<Set<string>>(new Set());
  protected readonly galleryDeleting = signal(false);
  protected readonly galleryError = signal('');
  private readonly galleryPageSize = 12;
  protected readonly dashboardTotal = signal(0);
  protected readonly dashboardAlerts = signal(0);
  protected readonly accueilScenes: AccueilScene[] = [
    {
      id: 'city',
      src: 'assets/videos/accueil-city.mp4',
      label: 'Global',
      kicker: '01 · Balayage nocturne',
      title: 'Le réseau s’allume',
      text: 'Parkey survole la ville. Les nœuds cyan pulsent : le réseau écoute les routes.',
      target: 'map',
    },
    {
      id: 'sign',
      src: 'assets/videos/accueil-sign.mp4',
      label: 'Panneau',
      kicker: '02 · Détection',
      title: 'Panneau abîmé signalé',
      text: 'Le cadre cyan se verrouille. Un panneau endommagé est isolé et transmis.',
      target: 'video',
    },
    {
      id: 'pothole',
      src: 'assets/videos/accueil-pothole.mp4',
      label: 'Chaussée',
      kicker: '03 · Détection',
      title: 'Nid-de-poule prioritaire',
      text: 'La chaussée révèle un creux. Parkey mesure, classe et alerte les équipes.',
      target: 'live',
    },
  ];
  protected readonly accueilSceneIndex = signal(0);
  protected readonly accueilStoryVideos = viewChildren<ElementRef<HTMLVideoElement>>('accueilStoryVideo');
  private accueilStoryTimer: ReturnType<typeof setInterval> | null = null;

  /** Références stables pour le composant carte (évite bind dans le template). */
  protected readonly frameUrlFn = (id: string) => this.api.getEventFrameUrl(id);
  protected readonly toDateFn = (ts: number) => this.toDate(ts);

  constructor(
    private api: ApiService,
    protected readonly auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    const params = this.route.snapshot.queryParamMap;
    const email = (params.get('email') ?? '').trim();
    if (email) this.loginEmail.set(email);
    if (params.get('welcome') === '1' && !this.auth.isLoggedIn()) {
      this.authScreen.set('welcome');
    }
    if (this.auth.isLoggedIn()) {
      this.initAfterLogin();
    }
  }

  doLogout() {
    this.stopAccueilStory();
    this.auth.logout();
    this.loginEmail.set('');
    this.loginPassword.set('');
    this.loginError.set('');
    this.loginSuccess.set('');
    this.authScreen.set('login');
    this.forgotEmail.set('');
    this.forgotError.set('');
    this.forgotMessage.set('');
    this.resetChangeForm();
    this.activeSection.set('dashboard');
    this.dashboardTotal.set(0);
    this.dashboardAlerts.set(0);
  }

  acceptChangePassword() {
    this.changeError.set('');
    this.resetChangeForm();
    this.authScreen.set('change-password');
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  declineChangePassword() {
    this.authScreen.set('login');
    this.loginSuccess.set('Connectez-vous avec le mot de passe reçu par e-mail.');
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  private resetChangeForm() {
    this.changeCurrent.set('');
    this.changePassword.set('');
    this.changeConfirm.set('');
    this.changeLoading.set(false);
    this.changeError.set('');
  }

  doChangePassword() {
    const email = this.loginEmail().trim().toLowerCase();
    const current = this.changeCurrent();
    const password = this.changePassword();
    const confirm = this.changeConfirm();
    this.changeError.set('');
    if (!email) {
      this.changeError.set('Indiquez votre adresse e-mail.');
      return;
    }
    if (password.length < 8) {
      this.changeError.set('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      this.changeError.set('Les deux mots de passe ne correspondent pas.');
      return;
    }
    this.changeLoading.set(true);
    this.auth.changePassword(email, current, password, confirm).subscribe({
      next: (res) => {
        this.changeLoading.set(false);
        this.resetChangeForm();
        this.loginPassword.set('');
        this.loginSuccess.set(res.message || 'Mot de passe mis à jour. Connectez-vous avec le nouveau.');
        this.authScreen.set('login');
      },
      error: (err) => {
        this.changeLoading.set(false);
        this.changeError.set(err?.error?.error ?? 'Impossible de changer le mot de passe. Réessayez.');
      },
    });
  }

  openForgot() {
    this.forgotEmail.set(this.loginEmail().trim());
    this.forgotError.set('');
    this.forgotMessage.set('');
    this.authScreen.set('forgot');
  }

  backToLogin() {
    this.authScreen.set('login');
    this.forgotError.set('');
    this.forgotMessage.set('');
  }

  doForgotPassword() {
    const email = this.forgotEmail().trim().toLowerCase();
    this.forgotError.set('');
    this.forgotMessage.set('');
    if (!email) {
      this.forgotError.set('Indiquez votre adresse e-mail.');
      return;
    }
    this.forgotLoading.set(true);
    this.auth.forgotPassword(email).subscribe({
      next: (res) => {
        this.forgotLoading.set(false);
        this.forgotMessage.set(res.message || 'Si un compte existe, un e-mail vient d’être envoyé.');
      },
      error: (err) => {
        this.forgotLoading.set(false);
        this.forgotError.set(err?.error?.error ?? 'Impossible d’envoyer le mail. Réessayez.');
      },
    });
  }

  ngOnDestroy() {
    this.stopAccueilStory();
    this.stopLiveCamera();
    this.closeResolveModal();
    this.closeSignalementDetail();
    this.stopActivityRefresh();
  }

  sectionTitle(): string {
    switch (this.activeSection()) {
      case 'detection':
        return 'Analyser une photo';
      case 'live':
        return 'Caméra en direct';
      case 'video':
        return 'Analyser une vidéo';
      case 'events':
        return 'Dossiers';
      case 'gallery':
        return 'Photos';
      case 'map':
        return 'Carte';
      case 'users':
        return 'Équipe';
      case 'activity':
        return 'Suivi utilisateurs';
      default:
        return 'Aperçu général';
    }
  }

  setSensitivity(value: string) {
    this.threshold.set(this.parseNumber(value));
  }

  setVideoPace(value: string) {
    const fps = this.parseNumber(value);
    this.sampleFps.set(fps);
    if (fps <= 0.5) this.maxVideoFrames.set(40);
    else if (fps <= 1) this.maxVideoFrames.set(80);
    else this.maxVideoFrames.set(160);
  }

  setSection(section: AppSection) {
    if (this.activeSection() === 'live' && section !== 'live') {
      this.stopLiveCamera();
    }
    if (section !== 'activity') {
      this.stopActivityRefresh();
    }
    this.activeSection.set(section);
    this.sidebarOpen.set(false);
    if (section === 'dashboard') {
      this.loadDashboardStats();
      this.refreshEvents(false);
      this.startAccueilStory();
      return;
    }
    this.stopAccueilStory();
    if (section === 'gallery' || section === 'map' || section === 'events') {
      this.refreshEvents(section === 'gallery' ? false : section !== 'map');
    }
    if (section === 'detection' || section === 'live') {
      this.ensureLocation();
    }
    if (section === 'video') {
      const ev = this.mapSeekEvent();
      if (ev) {
        this.mapSeekEvent.set(null);
        setTimeout(() => this.seekVideoToEvent(ev), 400);
      }
    }
    if (section === 'activity') {
      this.startActivityRefresh();
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

  @HostListener('document:keydown.escape')
  closeSidebarOnEscape() {
    if (this.sidebarOpen()) this.sidebarOpen.set(false);
  }

  canAnalyze() {
    const r = this.auth.user()?.role;
    return r === 'SUPERADMIN' || r === 'ADMIN' || r === 'OPERATOR';
  }

  canManageTeam() {
    const r = this.auth.user()?.role;
    return r === 'SUPERADMIN' || r === 'ADMIN';
  }

  canCreateAdmin() {
    return this.auth.user()?.role === 'SUPERADMIN';
  }

  canDeleteUser(u: UserInfo) {
    if (u.role === 'SUPERADMIN') return false;
    if (u.role === 'ADMIN') return this.canCreateAdmin();
    return this.canManageTeam();
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
        this.galleryError.set(err?.error?.error ?? 'Impossible de supprimer cette photo.');
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
        this.galleryError.set(err?.error?.error ?? 'Impossible de supprimer cette photo.');
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
    this.loadSignalementAfterFrame(e);
  }

  closeSignalementDetail() {
    this.selectedSignalement.set(null);
    this.revokeSignalementFrame();
    this.revokeSignalementAfterFrame();
  }

  private signalementFrameObjectUrl: string | null = null;
  private signalementAfterObjectUrl: string | null = null;

  private revokeSignalementFrame() {
    if (this.signalementFrameObjectUrl) {
      URL.revokeObjectURL(this.signalementFrameObjectUrl);
      this.signalementFrameObjectUrl = null;
    }
    this.signalementFrameUrl.set(null);
    this.signalementFrameLoading.set(false);
    this.signalementFrameError.set('');
  }

  private revokeSignalementAfterFrame() {
    if (this.signalementAfterObjectUrl) {
      URL.revokeObjectURL(this.signalementAfterObjectUrl);
      this.signalementAfterObjectUrl = null;
    }
    this.signalementAfterUrl.set(null);
  }

  loadSignalementAfterFrame(e: EventRecord) {
    this.revokeSignalementAfterFrame();
    if (!e.has_after_photo) return;
    this.api.getAfterFrame(e.id).subscribe({
      next: (blob) => {
        this.signalementAfterObjectUrl = URL.createObjectURL(blob);
        this.signalementAfterUrl.set(this.signalementAfterObjectUrl);
      },
      error: () => this.signalementAfterUrl.set(null),
    });
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
        this.materialsError.set(err?.error?.error ?? 'Impossible d’estimer les matériaux.');
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
          this.loadSignalementAfterFrame(updated);
        }
        this.statusUpdatingId.set(null);
      },
      error: (err) => {
        this.statusUpdatingId.set(null);
        this.eventsError.set(err?.error?.error ?? 'Impossible de mettre à jour ce dossier.');
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
    this.openResolveModal(event);
  }

  operators(): UserInfo[] {
    return this.users().filter((u) => u.role === 'OPERATOR' && u.enabled);
  }

  canPickAssignee(): boolean {
    return this.canManageTeam();
  }

  canTakeEvent(e: EventRecord): boolean {
    return this.auth.user()?.role === 'OPERATOR' && !e.assigned_user_id;
  }

  isAssignedToMe(e: EventRecord): boolean {
    const me = this.auth.user();
    return !!me && e.assigned_user_id === me.id;
  }

  assignEvent(event: EventRecord, userId: string | null) {
    this.assignUpdatingId.set(event.id);
    this.eventsError.set('');
    this.api.assignEvent(event.id, userId).subscribe({
      next: (res) => {
        const updated = res.event;
        this.events.update((list) => list.map((e) => (e.id === updated.id ? updated : e)));
        if (this.selectedSignalement()?.id === updated.id) {
          this.selectedSignalement.set(updated);
        }
        this.assignUpdatingId.set(null);
      },
      error: (err) => {
        this.assignUpdatingId.set(null);
        this.eventsError.set(err?.error?.error ?? 'Impossible d’assigner ce dossier.');
      },
    });
  }

  takeEvent(event: EventRecord) {
    const me = this.auth.user();
    if (!me) return;
    this.assignEvent(event, me.id);
  }

  unassignEvent(event: EventRecord) {
    this.assignEvent(event, null);
  }

  onAssignSelect(event: EventRecord, value: string) {
    this.assignEvent(event, value || null);
  }

  slaCssClass(e: EventRecord): string {
    if (!e.confirmed_at_ms) return 'sla-pending';
    return e.sla_overdue ? 'sla-overdue' : 'sla-ontrack';
  }

  slaLabel(e: EventRecord): string {
    if (!e.confirmed_at_ms) return 'En attente de confirmation';
    return e.sla_overdue ? 'En retard' : 'Dans les délais';
  }

  slaDueLabel(e: EventRecord): string {
    if (!e.sla_due_ms) return '—';
    return this.toDate(e.sla_due_ms);
  }

  openResolveModal(event: EventRecord) {
    this.closeResolveModal();
    this.resolveEventTarget.set(event);
    this.api.getEventFrame(event.id).subscribe({
      next: (blob) => {
        if (this.resolveEventTarget()?.id !== event.id) return;
        this.resolveBeforeUrl.set(URL.createObjectURL(blob));
      },
      error: () => {
        if (this.resolveEventTarget()?.id === event.id) this.resolveBeforeUrl.set(null);
      },
    });
    if (event.has_after_photo) {
      this.api.getAfterFrame(event.id).subscribe({
        next: (blob) => {
          if (this.resolveEventTarget()?.id !== event.id) return;
          this.resolveAfterPreview.set(URL.createObjectURL(blob));
        },
        error: () => {
          if (this.resolveEventTarget()?.id === event.id) this.resolveAfterPreview.set(null);
        },
      });
    }
  }

  closeResolveModal() {
    const preview = this.resolveAfterPreview();
    if (preview) URL.revokeObjectURL(preview);
    const before = this.resolveBeforeUrl();
    if (before) URL.revokeObjectURL(before);
    this.resolveEventTarget.set(null);
    this.resolveAfterFile.set(null);
    this.resolveAfterPreview.set(null);
    this.resolveBeforeUrl.set(null);
    this.resolveError.set('');
    this.resolveLoading.set(false);
  }

  onResolveAfterSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const prev = this.resolveAfterPreview();
    if (prev) URL.revokeObjectURL(prev);
    this.resolveAfterFile.set(file);
    this.resolveAfterPreview.set(file ? URL.createObjectURL(file) : null);
    this.resolveError.set('');
  }

  confirmResolve() {
    const event = this.resolveEventTarget();
    const file = this.resolveAfterFile();
    if (!event) return;
    if (!file && !event.has_after_photo) {
      this.resolveError.set('Ajoutez une photo après réparation pour clôturer le dossier.');
      return;
    }
    this.resolveLoading.set(true);
    this.resolveError.set('');
    const finishResolve = (updated: EventRecord) => {
      this.events.update((list) => list.map((e) => (e.id === updated.id ? updated : e)));
      this.api.updateEventStatus(updated.id, 'RESOLU', 'Réparation vérifiée avec photo après').subscribe({
        next: (res) => {
          const done = res.event;
          this.events.update((list) => list.map((e) => (e.id === done.id ? done : e)));
          if (this.selectedSignalement()?.id === done.id) {
            this.selectedSignalement.set(done);
            this.loadSignalementAfterFrame(done);
          }
          this.statusUpdatingId.set(null);
          this.closeResolveModal();
        },
        error: (err) => {
          this.resolveLoading.set(false);
          this.resolveError.set(err?.error?.error ?? 'Photo enregistrée, mais le statut n’a pas pu être mis à jour.');
        },
      });
    };
    if (!file) {
      finishResolve(event);
      return;
    }
    this.api.uploadAfterPhoto(event.id, file).subscribe({
      next: (res) => finishResolve(res.event),
      error: (err) => {
        this.resolveLoading.set(false);
        this.resolveError.set(err?.error?.error ?? 'Impossible d’enregistrer la photo après.');
      },
    });
  }

  onMapStatusChange(payload: { event: EventRecord; status: EventStatus }) {
    if (payload.status === 'RESOLU') {
      this.openResolveModal(payload.event);
      return;
    }
    const notes: Partial<Record<EventStatus, string>> = {
      CONFIRME: 'Validé depuis la carte',
      FAUX_POSITIF: 'Rejeté depuis la carte',
      EN_COURS: 'Intervention planifiée (carte)',
    };
    this.updateEventStatus(payload.event, payload.status, notes[payload.status]);
  }

  doLogin() {
    this.loginError.set('');
    this.loginSuccess.set('');
    this.loginLoading.set(true);
    this.auth.login(this.loginEmail().trim().toLowerCase(), this.loginPassword().trim()).subscribe({
      next: () => {
        this.loginLoading.set(false);
        this.initAfterLogin();
      },
      error: (err) => {
        this.loginLoading.set(false);
        this.loginError.set(err?.error?.error ?? 'Identifiants incorrects. Réessayez.');
      },
    });
  }

  private initAfterLogin() {
    this.loadDashboardStats();
    this.refreshEvents(false);
    this.startAccueilStory();
    const later = () => this.loadSecondaryData();
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(later, { timeout: 2500 });
    } else {
      setTimeout(later, 1200);
    }
  }

  accueilScene() {
    return this.accueilScenes[this.accueilSceneIndex()];
  }

  accueilResolutionRate() {
    const total = this.dashboardTotal();
    const open = this.dashboardAlerts();
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((total - open) / total) * 1000) / 10));
  }

  // ---- Statistiques détaillées (page d'accueil) ----

  severityBreakdownAccueil() {
    return severityBreakdown(this.events());
  }

  statusBreakdownAccueil() {
    return statusBreakdown(this.events());
  }

  sizeBreakdownAccueil() {
    return sizeBreakdown(this.events());
  }

  depthBreakdownAccueil() {
    return depthBreakdown(this.events());
  }

  topCities() {
    return topByCount(this.events().map((e) => e.city), 5);
  }

  topMaterials() {
    const names = this.events().flatMap((e) => (e.repair_materials ?? []).map((m) => m.name));
    return topByCount(names, 5);
  }

  sourceBreakdownAccueil() {
    return sourceBreakdown(this.events());
  }

  totalBudgetMidTnd() {
    return totalBudgetMidTnd(this.events());
  }

  totalBudgetRangeLabel() {
    return totalBudgetRangeLabel(this.events());
  }

  averageConfidencePct() {
    return averageConfidencePct(this.events());
  }

  averageResolutionDays() {
    return averageResolutionDays(this.events());
  }

  citiesCoveredCount() {
    return citiesCoveredCount(this.events());
  }

  potholeCountTotal() {
    return potholeCountTotal(this.events());
  }

  signsDamageCountTotal() {
    return signsDamageCountTotal(this.events());
  }

  selectAccueilScene(index: number) {
    this.accueilSceneIndex.set(index);
    this.startAccueilStory();
    this.playAccueilVideos();
  }

  openAccueilScene(scene: AccueilScene) {
    const needsAnalyze = scene.target === 'live' || scene.target === 'video' || scene.target === 'detection';
    this.setSection(needsAnalyze && !this.canAnalyze() ? 'map' : scene.target);
  }

  private startAccueilStory() {
    this.stopAccueilStory();
    this.playAccueilVideos();
    this.accueilStoryTimer = setInterval(() => {
      this.accueilSceneIndex.update((i) => (i + 1) % this.accueilScenes.length);
    }, 8000);
  }

  private stopAccueilStory() {
    if (this.accueilStoryTimer != null) {
      clearInterval(this.accueilStoryTimer);
      this.accueilStoryTimer = null;
    }
  }

  private playAccueilVideos() {
    queueMicrotask(() => {
      for (const ref of this.accueilStoryVideos()) {
        const video = ref.nativeElement;
        video.muted = true;
        void video.play().catch(() => {});
      }
    });
  }

  private loadDashboardStats() {
    this.api.dashboardStats().subscribe({
      next: (s) => {
        this.dashboardTotal.set(s.total ?? 0);
        this.dashboardAlerts.set(s.alerts ?? 0);
      },
      error: () => {},
    });
  }

  private loadSecondaryData() {
    this.api.listModels().subscribe({
      next: (res) => {
        if (res.models?.length) {
          this.models.set(
            res.models.map((m) => ({
              ...m,
              title: m.id === 'signs_damage' ? 'Panneaux abîmés' : m.id === 'pothole' ? 'Nids-de-poule' : displayLabel(m.title),
            })),
          );
        }
        if (res.default) this.selectedModel.set(res.default);
      },
      error: () => {},
    });
    this.api.getMaterialsStatus().subscribe({
      next: (s) => this.geminiConfigured.set(!!s.gemini_configured),
      error: () => this.geminiConfigured.set(false),
    });
    if (this.canManageTeam()) {
      this.loadUsers();
    }
    this.useGps();
  }

  currentPlace() {
    if (this.gpsLoading() || this.placeLoading()) return 'Recherche de votre position…';
    return placeLabel({
      city: this.city(),
      zone: this.zone(),
      lat: this.lat(),
      lon: this.lon(),
    });
  }

  placeIsApproximate() {
    const acc = this.gpsAccuracy();
    return acc != null && acc > 800;
  }

  placeAccuracyLabel() {
    const acc = this.gpsAccuracy();
    if (acc == null) return '';
    return `Précision : ${Math.round(acc)} m`;
  }

  ensureLocation() {
    if (this.lat() != null && this.lon() != null) {
      if (!this.city() || !this.zone()) this.fillPlaceFromCoords(this.lat()!, this.lon()!);
      return;
    }
    this.useGps();
  }

  openPhotoPicker() {
    this.photoInput()?.nativeElement.click();
  }

  onPhotoDragOver(e: DragEvent) {
    e.preventDefault();
    this.photoDragOver.set(true);
  }

  onPhotoDragLeave(e: DragEvent) {
    e.preventDefault();
    const current = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (related && current.contains(related)) return;
    this.photoDragOver.set(false);
  }

  onPhotoDrop(e: DragEvent) {
    e.preventDefault();
    this.photoDragOver.set(false);
    const f = e.dataTransfer?.files?.[0] ?? null;
    this.applyPhotoFile(f);
  }

  photoFileSizeLabel() {
    const f = this.file();
    if (!f) return '';
    if (f.size < 1024) return `${f.size} o`;
    if (f.size < 1024 * 1024) return `${Math.round(f.size / 1024)} Ko`;
    return `${(f.size / (1024 * 1024)).toFixed(1)} Mo`;
  }

  videoFileSizeLabel() {
    const f = this.videoFile();
    if (!f) return '';
    if (f.size < 1024) return `${f.size} o`;
    if (f.size < 1024 * 1024) return `${Math.round(f.size / 1024)} Ko`;
    return `${(f.size / (1024 * 1024)).toFixed(1)} Mo`;
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
        this.usersError.set(err?.error?.error ?? 'Impossible de charger l’équipe.');
        this.usersLoading.set(false);
      },
    });
  }

  createUser() {
    const email = this.newUserEmail().trim();
    const fullName = this.newUserName().trim();
    if (!email || !fullName) {
      this.usersError.set('Indiquez le nom et l’e-mail.');
      return;
    }
    this.usersSaving.set(true);
    this.usersError.set('');
    this.usersSuccess.set('');
    const role = this.newUserRole();
    if (role === 'ADMIN' && !this.canCreateAdmin()) {
      this.usersError.set('Seul un Superadmin peut créer un administrateur.');
      return;
    }
    const body: { email: string; fullName: string; role: 'ADMIN' | 'OPERATOR' | 'VIEWER'; password?: string } = {
      email,
      fullName,
      role,
    };
    const pwd = this.newUserPassword().trim();
    if (pwd) body.password = pwd;
    this.api.createUser(body).subscribe({
      next: (res) => {
        this.usersSaving.set(false);
        this.usersSuccess.set(
          (res.message ?? 'Compte créé') +
            ` — la personne pourra se connecter avec ${email} (mot de passe reçu par e-mail).`,
        );
        this.newUserName.set('');
        this.newUserEmail.set('');
        this.newUserPassword.set('');
        this.loadUsers();
      },
      error: (err) => {
        this.usersSaving.set(false);
        this.usersError.set(err?.error?.error ?? 'Impossible de créer le compte.');
      },
    });
  }

  deleteUser(id: string) {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    this.api.deleteUser(id).subscribe({
      next: () => this.loadUsers(),
      error: (err) => this.usersError.set(err?.error?.error ?? 'Impossible de supprimer ce compte.'),
    });
  }

  // --- Suivi d'activité (Superadmin/Admin) ---

  loadUserActivity() {
    this.activityLoading.set(true);
    this.activityError.set('');
    this.api.getUserActivity().subscribe({
      next: (res) => {
        this.activityUsers.set(res.users ?? []);
        this.activityLoading.set(false);
      },
      error: (err) => {
        this.activityError.set(err?.error?.error ?? 'Impossible de charger le suivi d’activité.');
        this.activityLoading.set(false);
      },
    });
  }

  private startActivityRefresh() {
    this.loadUserActivity();
    this.stopActivityRefresh();
    this.activityRefreshTimer = setInterval(() => this.loadUserActivity(), 20_000);
  }

  private stopActivityRefresh() {
    if (this.activityRefreshTimer != null) {
      clearInterval(this.activityRefreshTimer);
      this.activityRefreshTimer = null;
    }
    this.expandedActivityUserId.set(null);
  }

  toggleActivityHistory(userId: string) {
    if (this.expandedActivityUserId() === userId) {
      this.expandedActivityUserId.set(null);
      this.activitySessions.set([]);
      return;
    }
    this.expandedActivityUserId.set(userId);
    this.activitySessions.set([]);
    this.activitySessionsPage.set(0);
    this.loadActivitySessions(userId, 0);
  }

  loadActivitySessions(userId: string, page: number) {
    this.activitySessionsLoading.set(true);
    this.api.getUserSessions(userId, page, 10).subscribe({
      next: (res) => {
        this.activitySessions.update((prev) => (page === 0 ? res.sessions : [...prev, ...res.sessions]));
        this.activitySessionsPage.set(res.page);
        this.activitySessionsTotalPages.set(res.totalPages);
        this.activitySessionsLoading.set(false);
      },
      error: (err) => {
        this.activityError.set(err?.error?.error ?? 'Impossible de charger l’historique de connexion.');
        this.activitySessionsLoading.set(false);
      },
    });
  }

  loadMoreActivitySessions(userId: string) {
    this.loadActivitySessions(userId, this.activitySessionsPage() + 1);
  }

  hasMoreActivitySessions() {
    return this.activitySessionsPage() + 1 < this.activitySessionsTotalPages();
  }

  /** Formate une durée en millisecondes en « 2 h 15 » / « 8 min » lisible (suivi d'activité). */
  formatActivityDuration(ms?: number | null): string {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} h`;
    return `${hours} h ${minutes}`;
  }

  sessionEndLabel(reason?: string | null): string {
    if (reason === 'logout') return 'Déconnexion';
    if (reason === 'timeout') return 'Session expirée';
    return '—';
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
      this.gpsError.set('La localisation n’est pas disponible sur cet appareil.');
      return;
    }
    this.gpsLoading.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.lat.set(pos.coords.latitude);
        this.lon.set(pos.coords.longitude);
        this.gpsAccuracy.set(Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null);
        this.gpsLoading.set(false);
        this.fillPlaceFromCoords(pos.coords.latitude, pos.coords.longitude);

        const pending = this.pendingMapsEvent();
        if (pending) {
          this.pendingMapsEvent.set(null);
          this.openMaps(pending);
        }
      },
      () => {
        this.gpsError.set('Impossible d’obtenir votre position. Autorisez la localisation précise, puis réessayez.');
        this.gpsLoading.set(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  private pickAddressPart(address: Record<string, string>, keys: string[], exclude = '') {
    const skip = exclude.trim().toLowerCase();
    for (const key of keys) {
      const value = (address[key] ?? '').trim();
      if (value && value.toLowerCase() !== skip) return value;
    }
    return '';
  }

  private cleanPlaceName(name: string) {
    return name
      .replace(/^Gouvernorat\s+/i, '')
      .replace(/^Délégation\s+/i, '')
      .replace(/\bEl\s+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tunisiaGovernorate(address: Record<string, string>) {
    const iso = (address['ISO3166-2-lvl4'] ?? '').toUpperCase();
    const byIso: Record<string, string> = {
      'TN-11': 'Tunis',
      'TN-12': 'Ariana',
      'TN-13': 'Ben Arous',
      'TN-14': 'Manouba',
      'TN-21': 'Nabeul',
      'TN-22': 'Zaghouan',
      'TN-23': 'Bizerte',
      'TN-31': 'Béja',
      'TN-32': 'Jendouba',
      'TN-33': 'Le Kef',
      'TN-34': 'Siliana',
      'TN-41': 'Kairouan',
      'TN-42': 'Kasserine',
      'TN-43': 'Sidi Bouzid',
      'TN-51': 'Sousse',
      'TN-52': 'Monastir',
      'TN-53': 'Mahdia',
      'TN-61': 'Sfax',
      'TN-71': 'Gafsa',
      'TN-72': 'Tozeur',
      'TN-73': 'Kébili',
      'TN-81': 'Gabès',
      'TN-82': 'Médenine',
      'TN-83': 'Tataouine',
    };
    return byIso[iso] || this.cleanPlaceName(address['state'] ?? '');
  }

  private parsePlace(address: Record<string, string>, fallback = { city: '', zone: '' }) {
    const code = (address['country_code'] ?? '').toLowerCase();
    if (code === 'tn') {
      const city = this.tunisiaGovernorate(address) || this.cleanPlaceName(fallback.city);
      const quartier = this.cleanPlaceName(
        address['village'] ||
          address['town'] ||
          address['hamlet'] ||
          address['suburb'] ||
          address['neighbourhood'] ||
          address['county'] ||
          address['state_district'] ||
          fallback.zone,
      );
      return {
        city,
        zone: quartier && quartier.toLowerCase() !== city.toLowerCase() ? quartier : this.cleanPlaceName(address['state_district'] ?? ''),
      };
    }
    const city =
      this.pickAddressPart(address, ['city', 'municipality', 'town', 'county', 'state']) || fallback.city;
    const zone =
      this.pickAddressPart(
        address,
        ['suburb', 'neighbourhood', 'quarter', 'city_district', 'residential', 'hamlet', 'village', 'road'],
        city,
      ) || fallback.zone;
    return { city, zone };
  }

  private nominatimUrl(lat: number, lon: number, zoom: number) {
    return `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&format=jsonv2&addressdetails=1&zoom=${zoom}&accept-language=fr`;
  }

  private async readNominatim(lat: number, lon: number, zoom: number) {
    const res = await fetch(this.nominatimUrl(lat, lon, zoom), { headers: { Accept: 'application/json' } });
    if (!res.ok) return {} as Record<string, string>;
    const data = (await res.json()) as { address?: Record<string, string> };
    return data.address ?? {};
  }

  private async readBrowserPlace(lat: number, lon: number) {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}&localityLanguage=fr`,
    );
    if (!res.ok) return { city: '', zone: '' };
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
    };
    return {
      city: this.cleanPlaceName(data.principalSubdivision || data.city || ''),
      zone: this.cleanPlaceName(data.locality || data.city || ''),
    };
  }

  private fillPlaceFromCoords(lat: number, lon: number) {
    this.placeLoading.set(true);
    Promise.all([this.readNominatim(lat, lon, 16), this.readBrowserPlace(lat, lon)])
      .then(([streetAddr, browserPlace]) => {
        const place = this.parsePlace(streetAddr, browserPlace);
        this.city.set(place.city);
        this.zone.set(place.zone && place.zone.toLowerCase() !== place.city.toLowerCase() ? place.zone : browserPlace.zone);
      })
      .catch(() => {})
      .finally(() => this.placeLoading.set(false));
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

  openResultMap() {
    const ev = this.result()?.event;
    if (ev) {
      this.openMaps(ev);
      return;
    }
    const d = this.detections()[0];
    if (d) {
      this.openMapsFromDetection(d);
      return;
    }
    this.openMaps({
      id: '',
      ts_ms: 0,
      label: this.result()?.label ?? '',
      prob: this.result()?.prob ?? 0,
      lat: this.lat(),
      lon: this.lon(),
    });
  }

  openMapsFromDetection(d: SignDetection) {
    const lat = d.street?.lat ?? this.lat();
    const lon = d.street?.lon ?? this.lon();
    this.openMaps({ id: '', ts_ms: 0, label: d.label, prob: d.conf, lat, lon });
  }

  onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    this.applyPhotoFile(input.files?.[0] ?? null);
  }

  applyPhotoFile(f: File | null) {
    this.error.set('');
    this.result.set(null);
    this.detections.set([]);

    this.file.set(f);
    this.fileIsImage.set(f ? this.isImageFile(f) : false);

    if (f && !this.isImageFile(f)) {
      this.error.set(
        'Ce fichier n’est pas une photo. Pour une vidéo, ouvrez « Analyser une vidéo ».',
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
      this.error.set('Choisissez une photo, pas une vidéo.');
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
      return 'L’analyse a pris trop de temps. Réessayez avec un fichier plus court.';
    }
    if (e?.error && typeof e.error === 'object' && e.error !== null && 'error' in e.error) {
      return String((e.error as { error: string }).error);
    }
    if (typeof e?.error === 'string') {
      if (e.error.includes('<!doctype') || e.error.includes('<html')) {
        return 'Une erreur s’est produite. Vérifiez que le fichier est bien une photo.';
      }
      return e.error.slice(0, 500);
    }
    if (e?.error && typeof e.error === 'object') {
      return 'Une erreur s’est produite. Réessayez dans un instant.';
    }
    return e?.message ? String(e.message) : 'Une erreur inattendue s’est produite.';
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
    return placeLabel({
      city: e.city,
      zone: e.zone,
      lat: e.lat ?? this.lat(),
      lon: e.lon ?? this.lon(),
    });
  }

  timeLabel(e: EventRecord) {
    const ms = e.video_ts_ms ?? 0;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `À ${m}:${rs.toString().padStart(2, '0')}`;
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
              'Aucun problème trouvé sur cette vidéo. Essayez une sensibilité plus élevée ou un autre type de contrôle.',
            );
          }
        },
        error: (err) => {
          const msg = this.formatApiError(err);
          if (msg.includes('trop de temps') || msg.toLowerCase().includes('timeout')) {
            this.videoError.set(
              'L’analyse a pris trop de temps. Essayez un extrait plus court, ou choisissez l’option « Rapide ».',
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
      this.gpsError.set('Autorisez la localisation : la carte s’ouvrira ensuite automatiquement.');
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
        this.eventsError.set('Impossible de charger les dossiers. Réessayez.');
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

  tableDate(ts?: number | null) {
    if (ts == null) return '—';
    return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  tableTime(ts?: number | null) {
    if (ts == null) return '';
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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
      this.liveError.set('Votre navigateur ne peut pas ouvrir la caméra.');
      return;
    }
    try {
      const stream = await this.openCameraStream();
      this.liveStream = stream;
      this.liveActive.set(true);
      const video = this.liveVideo()?.nativeElement;
      if (!video) {
        this.stopLiveCamera();
        this.liveError.set('La vue caméra n’est pas prête. Réessayez.');
        return;
      }
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Flux déjà branché : certains navigateurs rejettent play() alors que l’image s’affiche.
      }
      this.liveDetections.set([]);
      this.liveAlerts.set([]);
      this.liveFramesAnalyzed.set(0);
      this.liveLastResult.set(null);
      this.liveLastPothole.set(null);
      this.liveLastSigns.set(null);
      this.startLiveLoop();
      setTimeout(() => this.captureLiveFrame(), 800);
    } catch (err) {
      this.stopLiveCamera();
      this.liveError.set(this.cameraErrorMessage(err));
    }
  }

  private async openCameraStream(): Promise<MediaStream> {
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr: unknown;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastErr = err;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') throw err;
      }
    }
    throw lastErr;
  }

  private cameraErrorMessage(err: unknown): string {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Accès à la caméra refusé. Autorisez-le dans le navigateur, puis réessayez.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'Aucune caméra utilisable n’a été trouvée sur cet appareil.';
    }
    if (name === 'NotReadableError') {
      return 'La caméra est déjà utilisée par une autre application. Fermez-la, puis réessayez.';
    }
    if (name === 'AbortError') {
      return 'L’ouverture de la caméra a été interrompue. Réessayez.';
    }
    return 'Impossible d’ouvrir la caméra. Réessayez, ou rechargez la page.';
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
    this.runLiveModels(file, models, 0, []);
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
  ) {
    if (index >= models.length || !this.liveActive()) {
      this.liveDetections.set(allDets);
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
          if (model === 'pothole') this.liveLastPothole.set(res);
          if (model === 'signs_damage') this.liveLastSigns.set(res);
          if (this.isLiveProblem(res, model)) this.liveLastResult.set(res);
          const dets = this.extractDetections(res, model);
          const merged = [...allDets, ...dets];
          const incoming = res.events?.length ? res.events : res.event ? [res.event] : [];
          const problems = incoming.filter((e) => !!e.alert && !isClearFinding(e));
          if (problems.length) {
            this.liveAlerts.update((list) => [...problems, ...list].slice(0, 50));
            this.events.update((list) => [...problems, ...list].slice(0, 200));
          }
          this.runLiveModels(file, models, index + 1, merged);
        },
        error: (err) => {
          this.liveError.set(this.formatApiError(err));
          this.liveAnalyzing.set(false);
          this.liveCaptureInFlight = false;
        },
      });
  }

  private isLiveProblem(res: PredictResponse, model: string): boolean {
    if (model === 'signs_damage') {
      return (res.detection_count ?? 0) > 0 || !!res.event?.alert;
    }
    return !!res.event?.alert || (res.label === 'potholes' && (res.prob ?? 0) >= this.threshold());
  }

  protected liveChecksPothole(): boolean {
    const m = this.liveModel();
    return m === 'both' || m === 'pothole';
  }

  protected liveChecksSigns(): boolean {
    const m = this.liveModel();
    return m === 'both' || m === 'signs_damage';
  }

  protected livePotholeHit(): boolean {
    const res = this.liveLastPothole();
    return !!res && this.isLiveProblem(res, 'pothole');
  }

  protected liveSignsHit(): boolean {
    const res = this.liveLastSigns();
    return !!res && this.isLiveProblem(res, 'signs_damage');
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
    return this.liveAlerts().filter((e) => (e.model === 'pothole' || !e.model) && !!e.alert && !isClearFinding(e));
  }

  liveSignsAlerts() {
    return this.liveAlerts().filter((e) => e.model === 'signs_damage' && !!e.alert && !isClearFinding(e));
  }
}
