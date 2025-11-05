import { Routes } from '@angular/router';
import { GraficosComponent } from './pages/graficos/graficos';
import { ExportarPage } from './pages/exportar/exportar';
import { SolicitarRegistroComponent } from './pages/auth/solicitar-registro/solicitar-registro';
import { LoginComponent } from './pages/auth/login/login'; 
import { ForgotPasswordComponent } from './pages/auth/forgot-password/forgot-password'; 
import { SolicitudesComponent } from './pages/solicitudes/solicitudes'; 

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'solicitar-registro', component: SolicitarRegistroComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'login', component: LoginComponent },
  { path: 'graficos', component: GraficosComponent },
  { path: 'exportar', component: ExportarPage },   // <-- nueva ruta
  { path: 'solicitudes', component: SolicitudesComponent },
  { path: '**', redirectTo: 'login' }
];