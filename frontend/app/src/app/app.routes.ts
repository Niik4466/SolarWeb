import { Routes } from '@angular/router';
import { GraficosComponent } from './pages/graficos/graficos';
import { ExportarPage } from './pages/exportar/exportar';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'graficos' },
  { path: 'graficos', component: GraficosComponent },
  { path: 'exportar', component: ExportarPage },   // <-- nueva ruta
  { path: '**', redirectTo: 'graficos' }
];