// src/app/guards/admin.guard.ts

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard de ruta para restringir acceso solo a administradores.
 *
 * Este guard se ejecuta antes de cargar una ruta protegida y decide
 * si el usuario puede entrar o no.
 *
 * Lógica aplicada:
 * 1. Comprueba si el usuario está logueado (`auth.isLoggedIn()`).
 * 2. Comprueba si el usuario tiene rol administrador (`auth.isAdmin()`).
 *
 * Si ambas condiciones se cumplen → acceso permitido.
 *
 * Si alguna falla → el usuario es redirigido a la página de inicio (`/`)
 * para prevenir acceso a rutas que requieren privilegios de administrador.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService); // servicio que maneja estado de login, token y rol
  const router = inject(Router);    // redirecciona si no cumple condiciones

  // Autorización solo si está logeado Y además es admin
  if (auth.isLoggedIn() && auth.isAdmin()) {
    return true;  // permitir acceso a la ruta protegida
  }

  // Si no es administrador (o no está logeado), redirigir
  router.navigate(['/']);
  return false;   // bloquear la activación de la ruta
};
