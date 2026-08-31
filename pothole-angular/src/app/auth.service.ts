import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';

export type UserInfo = {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  enabled: boolean;
};

export type AuthResponse = {
  token: string;
  tokenType: string;
  user: UserInfo;
};

const TOKEN_KEY = 'onsr_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<UserInfo | null>(null);
  readonly isLoggedIn = signal(false);

  constructor(private http: HttpClient) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      this.isLoggedIn.set(true);
      this.fetchMe().subscribe({ error: () => this.logout() });
    }
  }

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_KEY, res.token);
        this.user.set(res.user);
        this.isLoggedIn.set(true);
      }),
    );
  }

  fetchMe() {
    return this.http.get<UserInfo>('/api/auth/me').pipe(
      tap((u) => {
        this.user.set(u);
        this.isLoggedIn.set(true);
      }),
    );
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.user.set(null);
    this.isLoggedIn.set(false);
  }
}
