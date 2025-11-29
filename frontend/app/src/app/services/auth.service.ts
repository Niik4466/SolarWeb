// src/app/services/auth.service.ts
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/**
 * Estructura base de un payload JWT.
 * - sub: suele ser el id del usuario
 * - exp: fecha de expiración (timestamp)
 * - iat: fecha de emisión (timestamp)
 */
type JwtPayload = {
  sub?: string;
  exp?: number;
  iat?: number;
  [k: string]: any;
};

const API_BASE = 'http://127.0.0.1:8000';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  // =========================================================
  // ESTADO BÁSICO DE AUTENTICACIÓN (LOGIN, EMAIL, USER ID)
  // =========================================================

  /**
   * Señal interna que indica si el usuario está logueado.
   * Se inicializa leyendo desde localStorage.
   */
  private _isLoggedIn = signal(localStorage.getItem('isLoggedIn') === 'true');

  /**
   * Señal computada de solo lectura para usar en componentes.
   */
  isLoggedIn = computed(() => this._isLoggedIn());

  /**
   * Señal interna que guarda el correo del usuario autenticado.
   */
  private _email = signal<string | null>(localStorage.getItem('userEmail'));

  /**
   * Señal computada para leer el correo del usuario.
   */
  email = computed(() => this._email());

  /**
   * Señal interna que guarda el id numérico del usuario.
   * Se inicializa leyendo desde localStorage si existe.
   */
  private _userId = signal<number | null>(
    localStorage.getItem('userId') ? Number(localStorage.getItem('userId')) : null
  );

  /**
   * Señal computada para leer el id del usuario.
   */
  userId = computed(() => this._userId());

  // =========================================================
  // Recuperacion de contraseña
  // =========================================================

  generateRecoveryCode(email: string) {
    return this.http.post<string>(
      `${API_BASE}/users/pass/generate_code`,
      { email }
    );
  }

  /**
   * Verifica el código de recuperación y actualiza la contraseña.
   */
  recoverPassword(email: string, code: string, password: string) {
    return this.http.post<string>(
      `${API_BASE}/users/pass/recovery`,
      { email, code, password }
    );
  }

  // =========================================================
  // ROL DE ADMINISTRADOR
  // =========================================================

  /**
   * Señal interna que indica si el usuario es administrador.
   * Se inicializa leyendo desde localStorage.
   */
  private _isAdmin = signal(localStorage.getItem('isAdmin') === 'true');

  /**
   * Señal computada para saber si el usuario es admin.
   */
  isAdmin = computed(() => this._isAdmin());

  // =========================================================
  // TOKEN JWT
  // =========================================================

  /**
   * Clave que se usa para guardar el token en localStorage.
   */
  private readonly TOKEN_KEY = 'access_token';

  /**
   * Getter conveniente para obtener el token actual desde localStorage.
   */
  get token(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Setter para guardar o eliminar el token.
   * Además:
   *  - decodifica el JWT
   *  - actualiza el estado de isAdmin según el payload
   *  - sincroniza localStorage
   */
  setToken(token: string | null) {
    if (token) {
      localStorage.setItem(this.TOKEN_KEY, token);
    } else {
      localStorage.removeItem(this.TOKEN_KEY);
    }

    if (token) {
      const p = this.decodeJwt<JwtPayload>(token);
      // Se considera admin si `es_admin` viene como true o 1
      const isAdminFromToken = p?.['es_admin'] === true || p?.['es_admin'] === 1;
      this._isAdmin.set(isAdminFromToken);
      localStorage.setItem('isAdmin', isAdminFromToken ? 'true' : 'false');
    } else {
      // Si no hay token, reseteamos el estado de admin
      this._isAdmin.set(false);
      localStorage.removeItem('isAdmin');
    }
  }

  // =========================================================
  // HELPERS PARA JWT
  // =========================================================

  /**
   * Decodifica un JWT sin verificar la firma.
   * Solo se usa para leer el payload (sub, es_admin, etc.).
   *
   * @param jwt Token JWT en formato 'header.payload.signature'
   * @returns El payload como objeto o null si algo falla.
   */
  private decodeJwt<T = JwtPayload>(jwt: string): T | null {
    try {
      const parts = jwt.split('.');
      if (parts.length < 2) return null;

      const payloadB64 = parts[1];
      // Reemplazo de caracteres URL-safe por los estándar de Base64
      const normalized = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(normalized);
      return JSON.parse(json);
    } catch {
      // Si algo falla en la decodificación, devolvemos null
      return null;
    }
  }

  /**
   * Devuelve el id del usuario autenticado (tomado del token si existe).
   * 1. Intenta leer `sub` desde el JWT.
   * 2. Si no existe o no es numérico, usa el valor local de _userId.
   */
  get adminId(): number | null {
    const tok = this.token;
    if (tok) {
      const p = this.decodeJwt<JwtPayload>(tok);
      if (p?.sub && !isNaN(+p.sub)) {
        return +p.sub;
      }
    }
    return this._userId();
  }

  // =========================================================
  // SETTERS / GETTERS PÚBLICOS PARA ESTADO LOCAL
  // =========================================================

  /**
   * Marca al usuario como logueado, guardando email en estado y localStorage.
   */
  setLoggedIn(email: string) {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', email);
    this._isLoggedIn.set(true);
    this._email.set(email);
  }

  /**
   * Limpia todo el estado de autenticación:
   *  - isLoggedIn
   *  - email
   *  - userId
   *  - token
   *  - isAdmin
   */
  setLoggedOut() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem('isAdmin');

    this._isLoggedIn.set(false);
    this._email.set(null);
    this._userId.set(null);
    this._isAdmin.set(false);
  }

  logout() {
    this.setLoggedOut();
  }

  /**
   * Guarda el id del usuario en estado y en localStorage.
   */
  setUserId(id: number) {
    localStorage.setItem('userId', String(id));
    this._userId.set(id);
  }
  

  /**
   * Getters simples para obtener el id y email actuales
   * sin exponer directamente la señal.
   */
  getUserId(): number | null {
    return this._userId();
  }

  getEmail(): string | null {
    return this._email();
  }

  // =========================================================
  // LLAMADAS OPCIONALES AL BACKEND
  // =========================================================

  /**
   * Obtiene el id del usuario desde el backend a partir de su email.
   *
   * @param email correo del usuario
   * @returns Observable con un objeto { id: number }
   */
  fetchUserIdByEmail(email: string) {
    const params = new HttpParams().set('email', email);
    return this.http.get<{ id: number }>(`${API_BASE}/users/by-email`, { params });
  }

  /**
   * Inicializa el estado del AuthService consultando al backend
   * usando el token actual.
   *
   * - Si hay token:
   *   - Llama a /users/me
   *   - Actualiza isAdmin, email y userId con la info del backend
   * - Si la llamada falla, podrías opcionalmente desloguear al usuario.
   */
  initFromBackend() {
    const token = this.token;
    if (!token) return; // Si no hay token, no hay nada que inicializar

    this.http.get<any>(`${API_BASE}/users/me`).subscribe({
      next: (user) => {
        // es_admin viene del backend (por ejemplo, booleano)
        const isAdmin = !!user.es_admin;
        this._isAdmin.set(isAdmin);
        localStorage.setItem('isAdmin', String(isAdmin));

        // Actualiza email si viene en la respuesta
        if (user.correo) {
          this._email.set(user.correo);
          localStorage.setItem('userEmail', user.correo);
        }

        // Actualiza id si viene en la respuesta
        if (user.id != null) {
          this._userId.set(user.id);
          localStorage.setItem('userId', String(user.id));
        }

        // Marcar como logueado si todo fue bien
        this._isLoggedIn.set(true);
        localStorage.setItem('isLoggedIn', 'true');
      },
      error: () => {
        // Si algo falla podrías dejar al usuario como deslogueado
        // this.setLoggedOut();
      },
    });
  }
}
