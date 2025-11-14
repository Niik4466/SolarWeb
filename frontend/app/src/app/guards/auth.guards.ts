// app/guards/auth.guard.ts

import {
  CanActivateFn,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot, 
} from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';

/**
 * URL base del backend utilizada para validar el token.
 * Se puede mover a environment si lo deseas.
 */
const API_BASE = 'http://127.0.0.1:8000';

/**
 * Guard de autenticación: protege rutas que requieren sesión activa.
 *
 * Funciona así:
 * 1. Verifica si existe un token en localStorage.
 *      - Si no existe → redirige a /login con returnUrl (para volver después).
 *
 * 2. Si existe, valida el token contra el backend llamando a /users/me.
 *      - Si la petición es exitosa → acceso permitido.
 *      - Si /users/me responde error (token inválido/expirado) → cierra sesión y redirige a login.
 *
 * Este guard **NO verifica roles**, solo que el usuario esté autenticado.
 * Para acceso a administradores se usa adminGuard.
 */
export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot, 
  state: RouterStateSnapshot
) => {
  const auth = inject(AuthService); // servicio que gestiona sesión y token
  const http = inject(HttpClient);  // para llamar al backend
  const router = inject(Router);    // para navegación

  // ---------------------------------------------------------
  // 1. Verificar si existe token en localStorage
  // ---------------------------------------------------------
  const token = localStorage.getItem('access_token');

  if (!token) {
    // No hay token → Usuario NO autenticado
    router.navigate(['/login'], {
      queryParams: { returnUrl: state.url }, // para volver después del login
    });
    return false;
  }

  // ---------------------------------------------------------
  // 2. Validar token contra el backend usando /users/me
  // ---------------------------------------------------------
  const headers = new HttpHeaders({
    Authorization: `Bearer ${token}`,
  });

  /**
   * Hacemos GET /users/me
   * - Si es válido → continúa navegación (return true).
   * - Si falla → cerrar sesión y redirigir a login.
   */
  return http.get(`${API_BASE}/users/me`, { headers }).pipe(
    map(() => {
      // Token válido → permitir acceso a ruta protegida
      return true;
    }),
    catchError(() => {
      // Token inválido, expirado o error de backend
      auth.setLoggedOut();

      // Redirige a login para que el usuario se vuelva a autenticar
      router.navigate(['/login'], {
        queryParams: { returnUrl: state.url },
      });

      return of(false);
    })
  );
};
