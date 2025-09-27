// src/app/pages/graficos/graficos.ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, forkJoin, of } from 'rxjs';
import { switchMap, map, catchError, shareReplay } from 'rxjs/operators';

import { IrradianceChartComponent, Serie } from '../../components/charts/irradiance-chart/irradiance-chart';
import { ImagenesPorHoraComponent, SkyFrame } from '../../components/imagenes/imagenes.component';

import { ImagesService } from '../../services/images.api';
import { IrradianceApi, SeriesOut } from '../../services/irradiance.api';

function todayLocalISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10); // yyyy-MM-dd
}

@Component({
  selector: 'app-graficos',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, IrradianceChartComponent, ImagenesPorHoraComponent],
  templateUrl: './graficos.html',
  styleUrls: ['./graficos.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficosComponent {

  // UI
  isLoading = false;
  errorMsg = '';
  resetCounter = 0; // para forzar reset de gráficos

  // Día seleccionado (por defecto: HOY)
  readonly defaultDay = todayLocalISO();
  selectedDay = this.defaultDay;
  private day$ = new BehaviorSubject<string>(this.defaultDay);

  // Limites de protección para imágenes (ajusta si quieres)
  private readonly FRAME_SAMPLE_EVERY = 10; // 1 cada 10 min si tienes 1/min
  private readonly FRAME_MAX = 20000;         // tope duro

  // IMÁGENES — derivadas del día, ya muestreadas y acotadas
  frames$ = this.day$.pipe(
    switchMap(day => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return of<SkyFrame[]>([]);
      return this.images.getDayFrames(day).pipe(
        map(frames =>
          frames
            .filter((_, i) => i % this.FRAME_SAMPLE_EVERY === 0)
            .slice(0, this.FRAME_MAX)
        ),
        catchError(err => {
          console.error('[Graficos] frames error', err);
          this.errorMsg = 'No fue posible cargar las imágenes.';
          return of<SkyFrame[]>([]);
        })
      );
    }),
    shareReplay(1)
  );

  // SERIES — derivadas del día (usa tu API con agregación 5m/1h según prefieras)
  series$ = this.day$.pipe(
    switchMap(day => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return of<Serie[]>([]);
      const startISO = `${day}T00:00:00Z`;
      const stopISO  = `${day}T23:59:59Z`;
      const agg: string | undefined = '5m';

      return forkJoin([
        this.irrApi.getSeries({ startISO, stopISO, field: 'GHI', aggregate_every: agg, limit: 200000 }),
        this.irrApi.getSeries({ startISO, stopISO, field: 'DNI', aggregate_every: agg, limit: 200000 }),
        this.irrApi.getSeries({ startISO, stopISO, field: 'DHI', aggregate_every: agg, limit: 200000 }),
      ]).pipe(
        map(([ghi, dni, dhi]) => {
          const toXY = (s?: SeriesOut) =>
            (s?.points ?? [])
              .map(p => ({ x: Date.parse(p.time), y: Number(p.value) }))
              .filter(pt => Number.isFinite(pt.y));
          return [
            { name: 'Global',  data: toXY(ghi) as any },
            { name: 'Directa', data: toXY(dni) as any },
            { name: 'Difusa',  data: toXY(dhi) as any },
          ] as Serie[];
        }),
        catchError(err => {
          console.error('[Graficos] series error', err);
          this.errorMsg = 'No fue posible cargar las series de irradiancia.';
          return of<Serie[]>([]);
        })
      );
    }),
    shareReplay(1)
  );

  constructor(
    private irrApi: IrradianceApi,
    private images: ImagesService,
  ) {}

  onBuscar(): void {
    const day = this.selectedDay?.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      this.errorMsg = 'Fecha inválida.';
      return;
    }
    if (this.isLoading) return;
    this.errorMsg = '';
    this.isLoading = true;
    this.day$.next(day);
    this.resetCounter++; // fuerza reset de gráficos
    // liberamos loading cuando la UI reciba el primer tick de cualquiera de los streams
    setTimeout(() => (this.isLoading = false), 0);
  }

  onFrameChange(_f: SkyFrame) {}
}
