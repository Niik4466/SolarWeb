// src/app/interceptors/backend-status.interceptor.ts
import {
  HttpInterceptorFn,
  HttpErrorResponse
} from '@angular/common/http';
import { throwError,catchError } from 'rxjs';

export const backendStatusInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {

      // 🌐 BACKEND CAÍDO / SIN RESPUESTA / MANTENIMIENTO
      if (
        error.status === 0 ||    // ERR_CONNECTION_REFUSED, CORS, etc.
        error.status === 502 ||
        error.status === 503 ||
        error.status === 504
      ) {
        // Lanzamos un error "custom" que podamos detectar en los componentes
        return throwError(() => ({
          backendDown: true,
          message:
            'El servicio actualmente se encuentra fuera de servicio. Inténtelo más tarde.'
        }));
      }

      // Otros errores "normales"
      return throwError(() => error);
    })
  );
};
