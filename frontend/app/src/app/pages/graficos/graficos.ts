// src/app/pages/graficos/graficos.ts
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';

import { IrradianceChartComponent, Serie } from '../../components/charts/irradiance-chart/irradiance-chart';
import { ImagenesPorHoraComponent, SkyFrame } from '../../components/imagenes/imagenes.component';

import { ImagesService } from '../../services/images.api';
import { IrradianceApi, SeriesOut } from '../../services/irradiance.api';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-graficos',
  standalone: true,
  imports: [CommonModule, HttpClientModule, IrradianceChartComponent, ImagenesPorHoraComponent],
  templateUrl: './graficos.html',
  styleUrls: ['./graficos.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficosComponent implements OnInit {
  // Series para el chart en formato { x: epochMs, y: number }
  series: Serie[] = [];

  // Imágenes: flujo asíncrono desde el servicio
  readonly dayISO = '2025-02-08';
  frames$!: Observable<SkyFrame[]>;

  constructor(
    private irrApi: IrradianceApi,
    private images: ImagesService,
  ) {}

  ngOnInit(): void {
    // Cargar imágenes del día elegido
    this.frames$ = this.images.getDayFrames(this.dayISO);

    // Cargar irradiancia (ejemplo: todo el día con agregación 5m)
    const day = '2025-04-08';
    const startISO = `${day}T00:00:00Z`;
    const stopISO  = `${day}T23:59:59Z`;
    const agg: string | undefined = '5m'; // usa undefined para crudo (más pesado)

    Promise.all([
      this.irrApi.getSeries({ startISO, stopISO, field: 'GHI', aggregate_every: agg, limit: 200000 }).toPromise(),
      this.irrApi.getSeries({ startISO, stopISO, field: 'DNI', aggregate_every: agg, limit: 200000 }).toPromise(),
      this.irrApi.getSeries({ startISO, stopISO, field: 'DHI', aggregate_every: agg, limit: 200000 }).toPromise(),
    ]).then(([ghi, dni, dhi]) => {
      const toXY = (s?: SeriesOut) =>
        (s?.points ?? [])
          .map(p => ({ x: Date.parse(p.time), y: Number(p.value) }))
          .filter(pt => Number.isFinite(pt.y));

      this.series = [
        { name: 'Global',  data: toXY(ghi) as any },
        { name: 'Directa', data: toXY(dni) as any },
        { name: 'Difusa',  data: toXY(dhi) as any },
      ];
    }).catch(err => {
      console.error('Error cargando series de irradiancia', err);
    });
  }

  onFrameChange(f: SkyFrame) {
    // Hook futuro para sincronizar frame seleccionado con el gráfico
  }
}
