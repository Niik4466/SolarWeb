

// src/app/services/login.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service'; // ajusta la ruta si es distinta
import { Observable, of } from 'rxjs';
import { switchMap, tap, catchError, map, take } from 'rxjs/operators';

export const environment = {
  production: false,
  apiBase: 'http://127.0.0.1:8000',
};

/**
 * Respuesta esperada del endpoint /users/log-in.
 */
export type LoginResponse = {
  success: boolean;
  estado?: 'aprobado' | 'pendiente' | 'eliminado' | string | null;
  message?: string;
  user_id?: number;
  access_token?: string;
  token_type?: string;
};

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  /**
   * Realiza el login contra el backend y actualiza el AuthService en caso de éxito.
   * Devuelve el mismo LoginResponse para que el componente decida qué hacer (redirigir, mostrar error, etc.).
   */
  login(email: string, password: string): Observable<LoginResponse> {
    // Limpia cualquier sesión previa
    this.auth.setLoggedOut();

    return this.http
      .post<LoginResponse>(`${environment.apiBase}/users/log-in`, { email, password })
      .pipe(
        take(1),
        switchMap((res) => {
          // Si no es login exitoso o no está aprobado, devolvemos la respuesta tal cual
          if (!(res.success && res.estado === 'aprobado')) {
            return of(res);
          }

          // -----------------------
          // Login exitoso aprobado
          // -----------------------
          // Guarda login básico
          this.auth.setLoggedIn(email);

          // Guarda token
          if (res.access_token) {
            this.auth.setToken(res.access_token);
          }

          // Si ya viene user_id, lo guardamos y devolvemos la respuesta
          if (res.user_id != null) {
            this.auth.setUserId(res.user_id);
            return of(res);
          }

          // Si NO viene user_id, lo buscamos por correo
          return this.auth.fetchUserIdByEmail(environment.apiBase, email).pipe(
            tap((r) => this.auth.setUserId(r.id)),
            map(() => res),
            catchError((err) => {
              console.warn('No se pudo obtener user_id por correo', err);
              // Igual devolvemos el res para que el componente continúe
              return of(res);
            })
          );
        })
      );
  }
}
