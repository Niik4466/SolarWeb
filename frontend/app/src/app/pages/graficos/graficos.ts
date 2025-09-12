// src/app/pages/graficos/graficos.ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-graficos',
  standalone: true,
  template: `
    <section class="graficos">
      <h1>Gráficos</h1>
      <a routerLink="/">Volver</a>
    </section>
  `,
  styleUrls: ['./graficos.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GraficosComponent {}
