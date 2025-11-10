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

  // Si es admin
  private _isAdmin = signal(
    localStorage.getItem('isAdmin') === 'true'
  );
  isAdmin = computed(() => this._isAdmin()
  )
  
  // === Token ===
  private readonly TOKEN_KEY = 'access_token';

  get token(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  setToken(token: string | null) {
    if (token) localStorage.setItem(this.TOKEN_KEY, token);
    else localStorage.removeItem(this.TOKEN_KEY);
    if (token) {
      const p = this.decodeJwt<JwtPayload>(token);
      const isAdminFromToken = p?.['es_admin'] === true || p?.['es_admin'] === 1;
      this._isAdmin.set(isAdminFromToken);
      localStorage.setItem('isAdmin', isAdminFromToken ? 'true' : 'false');
    } else {
      this._isAdmin.set(false);
      localStorage.removeItem('isAdmin');
    }
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

  initFromBackend() {
  const token = this.token;
  if (!token) return;

  this.http.get<any>('http://127.0.0.1:8000/users/me').subscribe({
    next: (user) => {
      const isAdmin = !!user.es_admin;
      this._isAdmin.set(isAdmin);
      localStorage.setItem('isAdmin', String(isAdmin));
      // por si quieres también actualizar email/id
      if (user.correo) {
        this._email.set(user.correo);
        localStorage.setItem('userEmail', user.correo);
      }
      if (user.id) {
        this._userId.set(user.id);
        localStorage.setItem('userId', String(user.id));
      }
    },
    error: () => {
      // si falla, podrías desloguear
      // this.setLoggedOut();
    },
  });
 }
}