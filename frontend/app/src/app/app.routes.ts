import { Routes } from '@angular/router';
import { GraficosComponent } from './pages/graficos/graficos';
import { ExportarComponent } from './pages/exportar/exportar';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'graficos' },
  { path: 'graficos', component: GraficosComponent },
  { path: 'exportar', component: ExportarComponent },   // <-- nueva ruta
  { path: '**', redirectTo: 'graficos' }
];