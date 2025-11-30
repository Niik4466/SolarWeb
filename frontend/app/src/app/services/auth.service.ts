// src/app/services/auth.service.ts
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { tap } from 'rxjs/operators';

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
   * Momento (en ms desde epoch) en que expira el token actual.
   */
  private tokenExpirationTime: number | null = null;

  /**
   * Id del timeout que dispara el pop-up de extender sesión.
   */
  private sessionTimeoutId: any = null;

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
   *  - inicia el watcher de expiración para mostrar el pop-up
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

      // Manejo de expiración del token
      if (p?.exp) {
        this.tokenExpirationTime = p.exp * 1000; // pasa a milisegundos
        this.startSessionWatcher();
      } else {
        this.tokenExpirationTime = null;
        this.clearSessionWatcher();
      }
    } else {
      // Si no hay token, reseteamos el estado de admin
      this._isAdmin.set(false);
      localStorage.removeItem('isAdmin');

      this.tokenExpirationTime = null;
      this.clearSessionWatcher();
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
   *  - watcher de expiración
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

    this.tokenExpirationTime = null;
    this.clearSessionWatcher();
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
  // WATCHER DE EXPIRACIÓN Y POP-UP
  // =========================================================

  /**
   * Inicia o reinicia el timer que mostrará el pop-up
   * unos minutos antes de que el token expire.
   */
  private startSessionWatcher() {
    if (!this.tokenExpirationTime) {
      return;
    }

    // Limpiar timer anterior si existe
    this.clearSessionWatcher();

    const fiveMinutes = 5 * 60 * 1000; // 5 minutos antes de la expiración
    const msBeforePrompt = this.tokenExpirationTime - Date.now() - fiveMinutes;

    // Si ya estamos dentro de la ventana de 5 minutos, preguntar de inmediato
    if (msBeforePrompt <= 0) {
      this.askToExtendSession();
      return;
    }

    this.sessionTimeoutId = setTimeout(() => {
      this.askToExtendSession();
    }, msBeforePrompt);
  }

  /**
   * Limpia el timeout, si existe.
   */
  private clearSessionWatcher() {
    if (this.sessionTimeoutId) {
      clearTimeout(this.sessionTimeoutId);
      this.sessionTimeoutId = null;
    }
  }

  /**
   * Muestra un pop-up sencillo preguntando si se quiere
   * mantener la sesión activa. Si el usuario acepta,
   * se llama al endpoint de refresh.
   */
  private askToExtendSession() {
    const keep = window.confirm(
      'Tu sesión está por expirar. ¿Quieres mantenerla activa?'
    );

    if (keep) {
      this.refreshToken().subscribe({
        error: (err) => {
          console.warn('Error al refrescar token', err);
          // Si falla el refresh, no hacemos nada más:
          // cuando el token expire, el backend responderá 401
          // y el interceptor se encargará de desloguear.
        },
      });
    }
    // Si el usuario elige "Cancelar" o cierra el pop-up,
    // no hacemos nada: el token expirará y el flujo 401 + interceptor sigue igual.
  }

  /**
   * Llama al backend para obtener un nuevo token y
   * lo guarda con setToken().
   *
   * Endpoint: POST http://127.0.0.1:8000/users/refresh-token
   */
  private refreshToken() {
    return this.http
      .post<{ access_token: string; token_type: string }>(
        `${API_BASE}/users/refresh-token`,
        {}
      )
      .pipe(
        tap((res) => {
          if (res.access_token) {
            this.setToken(res.access_token);
          }
        })
      );
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
   *   - Recalcula expiración y arranca el watcher
   * - Si la llamada falla, podrías opcionalmente desloguear al usuario.
   */
  initFromBackend() {
    const token = this.token;
    if (!token) return; // Si no hay token, no hay nada que inicializar

    const payload = this.decodeJwt<JwtPayload>(token);
    if (payload?.exp) {
      this.tokenExpirationTime = payload.exp * 1000;
      this.startSessionWatcher();
    }

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
