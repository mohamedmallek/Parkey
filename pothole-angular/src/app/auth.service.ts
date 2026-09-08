import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';

export type UserInfo = {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  enabled: boolean;
};

export type AuthResponse = {
  token: string;
  tokenType: string;
  sessionId?: string;
  user: UserInfo;
};

const TOKEN_KEY = 'onsr_token';
const SESSION_KEY = 'onsr_session_id';
/** Signal envoyé tant que l'app reste ouverte : sert au suivi « en ligne / hors ligne » côté admin. */
const HEARTBEAT_INTERVAL_MS = 45_000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<UserInfo | null>(null);
  readonly isLoggedIn = signal(false);

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private http: HttpClient) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      this.isLoggedIn.set(true);
      this.fetchMe().subscribe({ error: () => this.logout() });
      this.startHeartbeat();
    }
  }

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  private getSessionId() {
    return localStorage.getItem(SESSION_KEY);
  }

  login(email: string, password: string) {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_KEY, res.token);
        if (res.sessionId) localStorage.setItem(SESSION_KEY, res.sessionId);
        this.user.set(res.user);
        this.isLoggedIn.set(true);
        this.startHeartbeat();
      }),
    );
  }

  forgotPassword(email: string) {
    return this.http.post<{ message: string }>('/api/auth/forgot-password', { email });
  }

  resetPassword(token: string, password: string, confirmPassword: string) {
    return this.http.post<{ message: string }>('/api/auth/reset-password', {
      token,
      password,
      confirmPassword,
    });
  }

  changePassword(email: string, currentPassword: string, password: string, confirmPassword: string) {
    return this.http.post<{ message: string }>('/api/auth/change-password', {
      email,
      currentPassword,
      password,
      confirmPassword,
    });
  }

  fetchMe() {
    return this.http.get<UserInfo>('/api/auth/me').pipe(
      tap((u) => {
        this.user.set(u);
        this.isLoggedIn.set(true);
      }),
    );
  }

  /** Signal périodique « l'app est toujours ouverte », utilisé par le suivi d'activité admin. */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer != null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat() {
    const sessionId = this.getSessionId();
    if (!sessionId || !this.isLoggedIn()) return;
    this.http.post('/api/auth/heartbeat', { sessionId }).subscribe({ error: () => {} });
  }

  logout() {
    this.stopHeartbeat();
    const sessionId = this.getSessionId();
    if (sessionId && this.isLoggedIn()) {
      this.http.post('/api/auth/logout', { sessionId }).subscribe({ error: () => {} });
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    this.user.set(null);
    this.isLoggedIn.set(false);
  }
}
