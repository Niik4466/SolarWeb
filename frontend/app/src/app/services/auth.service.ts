import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  // estado básico tomado de localStorage (compatible con tu login.ts)
  private _isLoggedIn = signal(localStorage.getItem('isLoggedIn') === 'true');
  isLoggedIn = computed(() => this._isLoggedIn());
  private _email = signal<string | null>(localStorage.getItem('userEmail'));
  email = computed(() => this._email());

  // si luego consigues el id de usuario, lo persistimos también
  private _userId = signal<number | null>(
    localStorage.getItem('userId') ? Number(localStorage.getItem('userId')) : null
  );
  userId = computed(() => this._userId());

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

  /**
   * Quick-win para conseguir el user_id si tu backend aún no devuelve el id en /users/log-in.
   * Ajusta la URL al endpoint que ya tengas (p.ej. /users/by-email?email=...).
   */
  fetchUserIdByEmail(endpointBase: string, email: string) {
    const params = new HttpParams().set('email', email);
    return this.http.get<{ id: number }>(`${endpointBase}/users/by-email`, { params });
  }
}
