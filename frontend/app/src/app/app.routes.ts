import { Routes } from '@angular/router';

export const routes: Routes = [

    // Ruta para el componente Graficos
  {
    path: 'graficos',
    loadComponent: () =>
      import('./pages/graficos/graficos').then(m => m.GraficosComponent),
    title: 'Gráficos'
  },
];
