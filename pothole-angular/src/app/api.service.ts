import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { timeout } from 'rxjs';
import type { UserInfo } from './auth.service';
import type { EventSeverity, EventStatus } from './event-workflow.util';
import type { RepairAnalysis, RepairMaterial } from './materials.util';

export type StatusHistoryEntry = {
  ts_ms: number;
  from_status?: string | null;
  to_status: string;
  user_id?: string | null;
  user_name?: string | null;
  user_role?: string | null;
  note?: string | null;
};

export type ModelInfo = {
  id: string;
  title: string;
  task: string;
  kind?: 'classifier' | 'yolo';
  ready: boolean;
  path: string;
};

export type BboxNorm = { x1: number; y1: number; x2: number; y2: number };

export type SignDetection = {
  label: string;
  conf: number;
  bbox_norm: BboxNorm;
  bbox_px?: { x1: number; y1: number; x2: number; y2: number };
  center_norm?: { x: number; y: number };
  street?: {
    lat?: number | null;
    lon?: number | null;
    source?: string | null;
    note?: string | null;
  };
  alert?: boolean;
};

export type PredictResponse = {
  model?: string;
  model_title?: string;
  kind?: 'classifier' | 'yolo';
  label: string;
  prob: number;
  topk: { label: string; prob: number }[];
  classes: string[];
  detections?: SignDetection[];
  detection_count?: number;
  image?: { width: number; height: number };
  gps?: { lat?: number | null; lon?: number | null; available?: boolean };
  event?: EventRecord;
  events?: EventRecord[];
  size_estimate?: {
    size_class?: string;
    width_cm_est?: number;
    length_cm_est?: number;
    max_dim_cm_est?: number;
    depth_proxy?: string;
    depth_score?: number;
    bbox_norm?: BboxNorm;
    calibration?: Record<string, unknown>;
  };
  repair_analysis?: RepairAnalysis;
};

export type EventRecord = {
  id: string;
  ts_ms: number;
  model?: string | null;
  task?: string | null;
  filename?: string | null;
  label: string;
  prob: number;
  topk?: { label: string; prob: number }[];
  bbox_norm?: BboxNorm | null;
  bbox_px?: { x1: number; y1: number; x2: number; y2: number } | null;
  center_norm?: { x: number; y: number } | null;
  alert?: boolean | null;
  threshold?: number | null;
  lat?: number | null;
  lon?: number | null;
  speed_kmh?: number | null;
  city?: string | null;
  zone?: string | null;
  source?: string | null;
  video_ts_ms?: number | null;
  frame_idx?: number | null;
  detection_count?: number | null;
  ocr_text?: string | null;
  frame_path?: string | null;
  status?: EventStatus | null;
  severity?: EventSeverity | null;
  status_history?: StatusHistoryEntry[];
  size_class?: string | null;
  width_cm_est?: number | null;
  length_cm_est?: number | null;
  max_dim_cm_est?: number | null;
  depth_proxy?: string | null;
  depth_score?: number | null;
  size_calibration?: Record<string, unknown> | null;
  repair_materials?: RepairMaterial[] | null;
  repair_steps?: string[] | null;
  repair_note?: string | null;
  repair_confidence?: string | null;
  repair_method?: string | null;
  repair_disclaimer?: string | null;
  repair_assessment?: {
    severity?: string;
    repair_type?: string;
    estimated_depth?: string;
  } | null;
  repair_materials_warning?: string | null;
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  listModels() {
    return this.http.get<{ models: ModelInfo[]; default: string }>('/api/models');
  }

  predict(
    file: File,
    meta?: {
      model?: string;
      lat?: number;
      lon?: number;
      speed_kmh?: number;
      source?: string;
      city?: string;
      zone?: string;
      threshold?: number;
    },
  ) {
    const form = new FormData();
    form.append('image', file);
    if (meta?.model) form.append('model', meta.model);
    if (meta?.lat !== undefined) form.append('lat', String(meta.lat));
    if (meta?.lon !== undefined) form.append('lon', String(meta.lon));
    if (meta?.speed_kmh !== undefined) form.append('speed_kmh', String(meta.speed_kmh));
    if (meta?.source) form.append('source', meta.source);
    if (meta?.city) form.append('city', meta.city);
    if (meta?.zone) form.append('zone', meta.zone);
    if (meta?.threshold !== undefined) form.append('threshold', String(meta.threshold));
    return this.http.post<PredictResponse>('/api/predict', form);
  }

  listEvents(
    limit = 200,
    filters?: { status?: string; city?: string; severity?: string },
  ) {
    let params = new HttpParams().set('limit', String(limit));
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.city) params = params.set('city', filters.city);
    if (filters?.severity) params = params.set('severity', filters.severity);
    return this.http.get<{ events: EventRecord[] }>('/api/events', { params });
  }

  updateEventStatus(id: string, status: EventStatus, note?: string) {
    return this.http.patch<{ event: EventRecord }>(`/api/events/${id}/status`, { status, note });
  }

  exportJson() {
    return this.http.get(`/api/events/export.json`, { responseType: 'blob' as const });
  }

  exportCsv() {
    return this.http.get(`/api/events/export.csv`, { responseType: 'blob' as const });
  }

  analyzeVideo(
    file: File,
    meta?: {
      model?: 'pothole' | 'signs_damage' | 'both';
      city?: string;
      zone?: string;
      threshold?: number;
      sample_fps?: number;
      max_frames?: number;
      ocr_enabled?: boolean;
      source?: string;
      lat?: number;
      lon?: number;
    },
  ) {
    const form = new FormData();
    form.append('video', file);
    if (meta?.model) form.append('model', meta.model);
    if (meta?.max_frames !== undefined) form.append('max_frames', String(meta.max_frames));
    if (meta?.ocr_enabled !== undefined) form.append('ocr_enabled', meta.ocr_enabled ? 'true' : 'false');
    if (meta?.city) form.append('city', meta.city);
    if (meta?.zone) form.append('zone', meta.zone);
    if (meta?.threshold !== undefined) form.append('threshold', String(meta.threshold));
    if (meta?.sample_fps !== undefined) form.append('sample_fps', String(meta.sample_fps));
    if (meta?.source) form.append('source', meta.source);
    if (meta?.lat !== undefined) form.append('lat', String(meta.lat));
    if (meta?.lon !== undefined) form.append('lon', String(meta.lon));
    return this.http
      .post<{
        count: number;
        events: EventRecord[];
        summary?: { pothole: number; signs_damage: number };
        video_meta?: {
          duration_sec?: number;
          frames_analyzed?: number;
          max_frames_cap?: number;
        } | null;
        note?: string | null;
        warnings?: string[] | null;
      }>(`/api/video/analyze`, form)
      .pipe(timeout(3_600_000));
  }

  getEventFrameUrl(eventId: string) {
    return `/api/events/frame/${eventId}`;
  }

  getEventFrame(eventId: string) {
    return this.http.get(`/api/events/frame/${eventId}`, { responseType: 'blob' as const });
  }

  deleteEvent(eventId: string) {
    return this.http.delete(`/api/events/${eventId}`);
  }

  deleteEvents(ids: string[]) {
    return this.http.post<{ deleted: number }>('/api/events/bulk-delete', { ids });
  }

  listUsers() {
    return this.http.get<{ users: UserInfo[] }>('/api/users');
  }

  createUser(body: { email: string; fullName: string; role: 'OPERATOR' | 'VIEWER'; password?: string }) {
    return this.http.post<{ user: UserInfo; emailSent: boolean; message: string }>('/api/users', body);
  }

  deleteUser(id: string) {
    return this.http.delete(`/api/users/${id}`);
  }

  getMaterialsStatus() {
    return this.http.get<{ gemini_configured: boolean; gemini_model?: string; analysis_type?: string }>(
      '/api/materials/status',
    );
  }

  analyzeMaterialsForEvent(e: EventRecord) {
    const form = new FormData();
    form.append('event_id', e.id);
    if (e.city) form.append('city', e.city);
    if (e.zone) form.append('zone', e.zone);
    if (e.label) form.append('label', e.label);
    if (e.prob != null) form.append('prob', String(e.prob));
    if (e.size_class) form.append('size_class', e.size_class);
    if (e.width_cm_est != null) form.append('width_cm_est', String(e.width_cm_est));
    if (e.length_cm_est != null) form.append('length_cm_est', String(e.length_cm_est));
    if (e.depth_proxy) form.append('depth_proxy', e.depth_proxy);
    return this.http.post<{ repair_analysis: RepairAnalysis; event?: EventRecord }>(
      '/api/materials/analyze',
      form,
    );
  }
}
