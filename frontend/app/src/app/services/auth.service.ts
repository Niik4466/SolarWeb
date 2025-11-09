// src/app/services/auth.service.ts
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

type JwtPayload = { sub?: string; exp?: number; iat?: number; [k: string]: any };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  // === Estado básico (como ya lo tenías) ===
  private _isLoggedIn = signal(localStorage.getItem('isLoggedIn') === 'true');
  isLoggedIn = computed(() => this._isLoggedIn());

  private _email = signal<string | null>(localStorage.getItem('userEmail'));
  email = computed(() => this._email());

  private _userId = signal<number | null>(
    localStorage.getItem('userId') ? Number(localStorage.getItem('userId')) : null
  );
  userId = computed(() => this._userId());

  // === Token ===
  private readonly TOKEN_KEY = 'access_token';

  get token(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  setToken(token: string | null) {
    if (token) localStorage.setItem(this.TOKEN_KEY, token);
    else localStorage.removeItem(this.TOKEN_KEY);
  }

  // === JWT helpers ===
  private decodeJwt<T = JwtPayload>(jwt: string): T | null {
    try {
      const [, payloadB64] = jwt.split('.');
      const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
      // decodeURIComponent(escape(...)) maneja UTF-8 en navegadores antiguos
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch {
      return null;
    }
  }

  /** Devuelve el id del usuario autenticado (prioriza JWT.sub; fallback a localStorage.userId) */
  get adminId(): number | null {
    const tok = this.token;
    if (tok) {
      const p = this.decodeJwt<JwtPayload>(tok);
      if (p?.sub && !isNaN(+p.sub)) return +p.sub;
    }
    return this._userId();
  }

  // === Setters existentes ===
  setLoggedIn(email: string) {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', email);
    this._isLoggedIn.set(true);
    this._email.set(email);
  }

  setLoggedOut() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');
    localStorage.removeItem(this.TOKEN_KEY);
    this._isLoggedIn.set(false);
    this._email.set(null);
    this._userId.set(null);
  }

  setUserId(id: number) {
    localStorage.setItem('userId', String(id));
    this._userId.set(id);
  }

  getUserId(): number | null { return this._userId(); }
  getEmail(): string | null { return this._email(); }

  /** Quick-win opcional para obtener id por email si lo necesitas */
  fetchUserIdByEmail(endpointBase: string, email: string) {
    const params = new HttpParams().set('email', email);
    return this.http.get<{ id: number }>(`${endpointBase}/users/by-email`, { params });
  }
}
