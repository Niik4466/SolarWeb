import { Routes } from '@angular/router';
import { Inicio } from './pages/inicio/inicio';
import { GraficosComponent } from './pages/graficos/graficos';
import { ExportarPage } from './pages/exportar/exportar';
import { SolicitarRegistroComponent } from './pages/auth/solicitar-registro/solicitar-registro';
import { LoginComponent } from './pages/auth/login/login'; 
import { ForgotPasswordComponent } from './pages/auth/forgot-password/forgot-password'; 
import { SolicitudesComponent } from './pages/solicitudes/solicitudes'; 
import { UsuariosComponent } from './pages/usuarios/usuarios';
import { redirectGuard } from './guards/redirect.guard';
import { authGuard } from './guards/auth.guards';  // asegúrate de que el archivo se llame auth.guard.ts (no "guards")
import { adminGuard } from './guards/admin.guards';

export const routes: Routes = [
  // ---------------------------
  // PÁGINAS PÚBLICAS (sin login)
  // ---------------------------
  { 
    path: '',
    component: LoginComponent,
    canActivate: [redirectGuard],
  },
  { path: 'inicio', component: Inicio},
  { path: 'login', component: LoginComponent },
  { path: 'solicitar-registro', component: SolicitarRegistroComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },

  // ---------------------------
  // PÁGINAS PRIVADAS (requieren sesión)
  // ---------------------------
  
  { path: 'graficos', component: GraficosComponent, canActivate: [authGuard] },
  { path: 'exportar', component: ExportarPage, canActivate: [authGuard] },
  { path: 'solicitudes', component: SolicitudesComponent, canActivate: [authGuard, adminGuard] },
  { path: 'usuarios', component: UsuariosComponent, canActivate: [authGuard, adminGuard] },

  // ---------------------------
  // RUTA POR DEFECTO (404 → login)
  // ---------------------------
  {
    path: '**',
    component: GraficosComponent,
    canActivate: [redirectGuard],
  },
];
