// src/app/guards/admin.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // usamos los signals del servicio
  if (auth.isLoggedIn() && auth.isAdmin()) {
    return true;
  }

  // si no es admin, lo mandamos a inicio (o login)
  router.navigate(['/']);
  return false;
};
