import { Routes } from '@angular/router';
import { GraficosComponent } from './pages/graficos/graficos';
import { ExportarPage } from './pages/exportar/exportar';
import { SolicitarAccesoComponent } from './pages/solicitar-acceso/solicitar-acceso';
import { LoginComponent } from './pages/auth/login/login'; 

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'solicitar-acceso', component: SolicitarAccesoComponent },
  { path: 'login', component: LoginComponent },
  { path: 'graficos', component: GraficosComponent },
  { path: 'exportar', component: ExportarPage },   // <-- nueva ruta
  { path: '**', redirectTo: 'login' }
];