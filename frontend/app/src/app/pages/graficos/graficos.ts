// src/app/pages/graficos/graficos.ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IrradianceChartComponent, Serie } from '../../components/charts/irradiance-chart/irradiance-chart';


@Component({
  selector: 'app-graficos',
  standalone: true,
  imports: [IrradianceChartComponent],
  template:  `
    <div style="max-width:1100px;margin:24px auto;">
      <app-irradiance-chart [series]="series" [categories]="hours"></app-irradiance-chart>
    </div>
  `,
  styleUrls: ['./graficos.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GraficosComponent {
  hours = ['6 AM','7 AM','8 AM','9 AM','10 AM','11 AM','12 PM','2 PM','4 PM','6 PM','8 PM'];
  series: Serie[] = [
    { name: 'Global',  data: [0,200,450,700,900,960,920,700,450,200,0] },
    { name: 'Direct',  data: [0,180,420,650,820,840,800,620,400,180,0] },
    { name: 'Diffuse', data: [0,120,300,480,620,680,660,520,340,150,0] },
  ];
}