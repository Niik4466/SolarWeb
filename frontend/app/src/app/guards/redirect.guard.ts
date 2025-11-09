// app/guards/redirect.guard.ts
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const redirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    router.navigate(['/graficos']);
  } else {
    router.navigate(['/login']);
  }

  return false; // evita que cargue una página inexistente
};
