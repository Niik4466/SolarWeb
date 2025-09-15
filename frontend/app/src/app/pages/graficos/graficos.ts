// src/app/pages/graficos/graficos.ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IrradianceChartComponent, Serie } from '../../components/charts/irradiance-chart/irradiance-chart';
import { ImagenesPorHoraComponent, SkyFrame } from '../../components/imagenes/imagenes.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-graficos',
  standalone: true,
  imports: [CommonModule, IrradianceChartComponent, ImagenesPorHoraComponent],
  template: `
    <section class="panel">
      <div class="col chart">
        <app-irradiance-chart
          [series]="series"
          [categories]="hours">
        </app-irradiance-chart>
      </div>

      <div class="col photos">
        <app-imagenes-por-hora
          [frames]="skyFrames"
          [autoplay]="true"
          [intervalMs]="10000"
          [showHeader]="true"
          [maxHeight]="290"
          [ratio]="'16 / 9'"
          (frameChange)="onFrameChange($event)">
        </app-imagenes-por-hora>
      </div>
    </section>
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

  // Mapea tus horas a imágenes (coloca archivos en /public o /assets)
  skyFrames: SkyFrame[] = [
    { time: '06:00', src: 'assets/sky/01.jpeg', alt: 'Amanecer' },
    { time: '08:00', src: 'assets/sky/02.jpeg' },
    { time: '10:00', src: 'assets/sky/03.jpeg' },                                                                     
    { time: '12:00', src: 'assets/sky/01.jpeg', alt: 'Mediodía' },
    { time: '14:00', src: 'assets/sky/02.jpeg' },
    { time: '16:00', src: 'assets/sky/03.jpeg' },
    { time: '18:00', src: 'assets/sky/01.jpeg', alt: 'Atardecer' },
  ];

  onFrameChange(f: SkyFrame) {
    // aquí puedes sincronizar con el gráfico si luego expones un @Input() selectedIndex en el chart
    // console.log('Imagen seleccionada:', f);
  }
}                                                                                                                                                                           
                                                                                                