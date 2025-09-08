import { Routes } from '@angular/router';
import { GraficosComponent } from '../pages/graficos/graficos.component';


export const routes: Routes = [
  { path: '', redirectTo: 'graficos', pathMatch: 'full' },
  { path: 'graficos', component: GraficosComponent },
  { path: '**', redirectTo: 'graficos' }
];
