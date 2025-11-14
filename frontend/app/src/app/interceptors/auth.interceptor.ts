// src/app/interceptors/auth.interceptor.ts

import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor de autenticación para SolarWeb.
 *
 * Su función principal es:
 * 1) Adjuntar el token JWT almacenado en AuthService a todas las solicitudes
 *    HTTP salientes mediante el header:
 *        Authorization: Bearer <token>
 *
 * 2) Detectar errores 401 (Unauthorized) provenientes del backend.
 *    Cuando ocurren:
 *       - elimina el estado de sesión del usuario
 *       - redirige automáticamente a /login
 *
 * Este interceptor permite:
 * - Mantener protegidas las rutas que requieren autenticación.
 * - Evitar escribir `setHeaders` en cada request manualmente.
 * - Expulsar al usuario si su token expira o si ya no es válido.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService); // servicio que gestiona token y sesión
  const router = inject(Router);    // se usa para redirigir en caso de 401

  /**
   * Recuperamos el token almacenado localmente.
   * `auth.token` contiene el JWT guardado en login.
   */
  const token = auth.token;

  /**
   * Si hay token → clonamos la request original y le agregamos el header Authorization.
   * Si NO hay token → dejamos que la request salga tal cual.
   */
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  // Enviamos request al siguiente interceptor o al backend
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      /**
       * Si el backend responde 401 Unauthorized:
       * - Algo está mal con el token (expirado, inválido, falta, etc.)
       * - Cerramos sesión
       * - Redirigimos automáticamente a /login
       */
      if (error.status === 401) {
        auth.setLoggedOut();
        router.navigate(['/login']);
      }

      // Propagamos el error para otros handlers o componentes
      return throwError(() => error);
    })
  );
};
