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

const API_BASE = 'http://127.0.0.1:8000'; // Adjust the base URL as needed

export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot, 
  state: RouterStateSnapshot
) => {
  const auth = inject(AuthService);
  const http = inject(HttpClient);
  const router = inject(Router);

  // Obtener el token de acceso del almacenamiento local
  const token = localStorage.getItem('access_token');

  // si no hay token -> LoginComponent
  if (!token) {
    router.navigate(['/login'], {
      queryParams: { returnUrl: state.url },
    });
    return false;
  }

  // validar contra el backend
  const headers = new HttpHeaders({
    Authorization: `Bearer ${token}`,
  });

  return http.get(`${API_BASE}/users/me`, { headers }).pipe(
    map((user): any => {
      // Si la respuesta es exitosa, el usuario está autenticado
      return true;
    }),
    catchError((error) => {
      // Si hay un error (por ejemplo, token inválido), redirigir al login
      auth.setLoggedOut();
      router.navigate(['/login'], {
        queryParams: { returnUrl: state.url },
      });
      return of(false);
    })
  );
};
  