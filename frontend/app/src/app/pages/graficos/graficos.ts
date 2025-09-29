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

/**
 * Devuelve la fecha de hoy en formato local ISO (yyyy-MM-dd).
 * Se ajusta la zona horaria para que coincida con la hora local.
 */
function todayLocalISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10); // yyyy-MM-dd
}

@Component({
  selector: 'app-graficos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    IrradianceChartComponent,
    ImagenesPorHoraComponent
  ],
  templateUrl: './graficos.html',
  styleUrls: ['./graficos.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush, // Optimiza la detección de cambios
})
export class GraficosComponent {

  // =====================
  // Estado de la UI
  // =====================
  isLoading = false;     // bandera de carga
  errorMsg = '';         // mensajes de error
  resetCounter = 0;      // contador para forzar reset de los gráficos

  // =====================
  // Gestión de fechas
  // =====================
  readonly defaultDay = todayLocalISO();   // día por defecto = HOY
  selectedDay = this.defaultDay;           // día seleccionado en la UI
  private day$ = new BehaviorSubject<string>(this.defaultDay); // estado reactivo del día
  readonly viewingDay$ = this.day$.asObservable(); // día "actualmente mostrado"

  // =====================
  // Configuración de imágenes
  // =====================
  private readonly FRAME_SAMPLE_EVERY = 10;  // tomar 1 frame cada 10 (submuestreo)
  private readonly FRAME_MAX = 20000;        // límite máximo de frames cargados

  /**
   * Stream reactivo de imágenes del día seleccionado.
   * - Filtra y submuestrea las imágenes según la configuración.
   * - Maneja errores devolviendo un arreglo vacío.
   */
  frames$ = this.day$.pipe(
    switchMap(day => {
      // valida formato de fecha
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return of<SkyFrame[]>([]);
      return this.images.getDayFrames(day).pipe(
        map(frames =>
          frames
            .filter((_, i) => i % this.FRAME_SAMPLE_EVERY === 0) // muestreo
            .slice(0, this.FRAME_MAX)                           // límite máximo
        ),
        catchError(err => {
          console.error('[Graficos] frames error', err);
          this.errorMsg = 'No fue posible cargar las imágenes.';
          return of<SkyFrame[]>([]);
        })
      );
    }),
    shareReplay(1) // memoriza el último valor para nuevos suscriptores
  );

  /**
   * Stream reactivo de series de irradiancia (GHI, DNI, DHI).
   * - Consulta la API con agregación de 5 minutos.
   * - Convierte los datos a formato XY para el gráfico.
   * - Maneja errores devolviendo un arreglo vacío.
   */
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
          // Helper para convertir cada serie a XY
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
    private irrApi: IrradianceApi,   // servicio para datos de irradiancia
    private images: ImagesService,   // servicio para imágenes
  ) {}

  /**
   * Acción de búsqueda: valida la fecha y actualiza el stream `day$`.
   * También reinicia los gráficos y gestiona el estado de carga.
   */
  onBuscar(): void {
    const day = this.selectedDay?.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      this.errorMsg = 'Fecha inválida.';
      return;
    }
    if (this.isLoading) return;
    this.errorMsg = '';
    this.isLoading = true;
    this.day$.next(day);     // dispara carga de datos
    this.resetCounter++;     // fuerza reset de gráficos
    // libera el "loading" en el próximo ciclo del event loop
    setTimeout(() => (this.isLoading = false), 0);
  }

  /**
   * Devuelve la fecha en formato "DD/MM/YYYY" para mostrar en la UI.
   */
  prettyDay(d: string): string {
    const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  }

  /**
   * Handler para cuando cambia un frame en la UI (placeholder).
   */
  onFrameChange(_f: SkyFrame) {}
}
