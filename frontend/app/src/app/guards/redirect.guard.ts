// app/guards/redirect.guard.ts

import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard especial para la ruta raíz ('/') que decide
 * automáticamente a dónde enviar al usuario dependiendo
 * de si está autenticado o no.
 *
 * Su función:
 * - Si el usuario YA está logueado → redirige a /inicio
 * - Si NO está logueado → redirige a /login
 *
 * Este guard siempre retorna `false`, lo que impide que la ruta
 * donde está aplicado cargue algún componente.
 *
 * ¿Dónde se usa típicamente?
 * En la ruta vacía del proyecto:
 *
 *    { path: '', canActivate: [redirectGuard], component: Dummy }
 *
 * Gracias a este guard:
 * - Se evita mostrar una página "blanca" o innecesaria.
 * - Se centraliza la lógica de inicio según el estado de login.
 */
export const redirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService); // servicio de autenticación con signals de sesión
  const router = inject(Router);    // para redirecciones

  // Si está autenticado → a la vista principal de la app
  if (auth.isLoggedIn()) {
    router.navigate(['/graficos']);
  } 
  // Si NO está autenticado → al login
  else {
    router.navigate(['/inicio']);
  }

  // Siempre false para que NO cargue la ruta protegida.
  // Solo se usa para redirigir.
  return false;
};
