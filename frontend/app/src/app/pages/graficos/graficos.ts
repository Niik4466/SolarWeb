import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IrradianceChartComponent, Serie } from '../../components/charts/irradiance-chart/irradiance-chart';
import { ImagenesPorHoraComponent, SkyFrame } from '../../components/imagenes/imagenes.component';
import { ImagesService } from '../../services/images.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-graficos',
  standalone: true,
  imports: [CommonModule, IrradianceChartComponent, ImagenesPorHoraComponent],
  templateUrl: './graficos.html', 
  styleUrls: ['./graficos.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficosComponent {
  // Chart (queda igual por ahora)
  hours = ['6 AM','7 AM','8 AM','9 AM','10 AM','11 AM','12 PM','2 PM','4 PM','6 PM','8 PM'];
  series: Serie[] = [
    { name: 'Global',  data: [0,200,450,700,900,960,920,700,450,200,0] },
    { name: 'Direct',  data: [0,180,420,650,820,840,800,620,400,180,0] },
    { name: 'Diffuse', data: [0,120,300,480,620,680,660,520,340,150,0] },
  ];

  // Parámetro de día (si luego quieres hacerlo ‘dinámico’, lo expones como input/router param)
  readonly dayISO = '2025-08-02';
  frames$!: Observable<SkyFrame[]>;   // nota la “!”

  constructor(private images: ImagesService) {
    this.frames$ = this.images.getDayFrames(this.dayISO);
  }

  onFrameChange(f: SkyFrame) {
    // futuro: sincronizar con gráfico
  }
}
