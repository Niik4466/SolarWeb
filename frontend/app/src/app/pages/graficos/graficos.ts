// src/app/pages/graficos/graficos.ts

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, forkJoin, of, combineLatest } from 'rxjs';
import { switchMap, map, catchError, shareReplay, scan, startWith, finalize } from 'rxjs/operators';

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
  // retornamos el 1 de mayo
  return "2025-05-01";
  //return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10); // yyyy-MM-dd
}

/** Convierte "HH:MM" a minutos absolutos del día (ej: "02:30" → 150). */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(n => parseInt(n, 10));
  return (h * 60) + (m || 0);
}

/** Ordena frames por su hora ascendente. */
function sortFramesByTime(frames: SkyFrame[]): SkyFrame[] {
  return [...frames].sort((a, b) => toMinutes(String(a.time)) - toMinutes(String(b.time)));
}

/** Transforma un valor de granularidad ej:'10s' a ms**/
function granularityToMs(granularity: string): number {
  const match = /^(\d+)([smhd])$/.exec(granularity);
  if (!match) return 1000; // fallback 1s
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60_000;
    case 'h': return value * 3_600_000;
    case 'd': return value * 86_400_000;
    default: return 1000;
  }
}

/** Rellena valores faltantes en una serie de tiempo con 0's'**/
function fillMissingTimestamps(
  points: { x: number; y: number }[],
  start: number,
  stop: number,
  stepMs: number
) {
  if (points.length == 0) return points; // Si esta vacio, se deja tal cual

  const filled: { x: number; y: number }[] = [];
  const existing = new Map(points.map(p => [p.x, p.y]));

  for (let t = start; t <= stop; t += stepMs) {
    filled.push({ x: t, y: existing.get(t) ?? 0 });
  }

  return filled;
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
  // Gestion de granularidad
  // =====================
  selectedRange = "5m";  // granularidad seleccionada en la UI
  readonly range$ = new BehaviorSubject<string>(this.selectedRange);

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
  private readonly FRAME_SAMPLE_EVERY = 10;  // submuestreo (se aplica en el backend)
  private readonly FRAME_MAX = 20000;        // límite máximo de frames cargados
  private readonly START_HHMM = '08:00';     // ajusta si quieres
  private readonly END_HHMM   = '18:00';     // ajusta si quieres
  private readonly BATCH_MS   = 100;         // agrupa eventos cada 100 ms

  /**
   * Stream reactivo de imágenes del día seleccionado.
   * - Ahora consume el endpoint de streaming NDJSON vía ImagesService.
   * - Acumula progresivamente los frames y los ordena por hora.
   * - Aplica límite máximo de elementos.
   */
  frames$ = this.day$.pipe(
    switchMap(day => {
      // valida formato de fecha
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return of<SkyFrame[]>([]);

      this.errorMsg = '';
      this.isLoading = true;

      return this.images.streamDayFramesBatched(day, {
        startHHMM: this.START_HHMM,
        endHHMM:   this.END_HHMM,
        sampleEvery: this.FRAME_SAMPLE_EVERY,
        limit: this.FRAME_MAX,
        bufferMs: this.BATCH_MS
      }).pipe(
        // Acumula y recorta a FRAME_MAX
        scan((acc, batch) => {
          const next = acc.concat(batch);
          // si quisieras mantener solo los últimos FRAME_MAX:
          // return next.length > this.FRAME_MAX ? next.slice(-this.FRAME_MAX) : next;
          return next.length > this.FRAME_MAX ? next.slice(0, this.FRAME_MAX) : next;
        }, [] as SkyFrame[]),
        // Ordena por hora para estabilidad visual
        map(list => sortFramesByTime(list)),
        catchError(err => {
          console.error('[Graficos] frames stream error', err);
          this.errorMsg = 'No fue posible cargar las imágenes (stream).';
          return of<SkyFrame[]>([]);
        }),
        finalize(() => { this.isLoading = false; }),
        startWith([] as SkyFrame[])
      );
    }),
    shareReplay(1) // memoriza el último valor para nuevos suscriptores
  );

  /*
   * Stream reactivo de series de irradiancia (GHI, DNI, DHI).
   * - Igual que antes.
   */
  series$ = this.day$.pipe(
    switchMap(day => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return of<Serie[]>([]);
      const startISO = `${day}T00:00:00Z`;
      const stopISO  = `${day}T23:59:59Z`;

      return forkJoin([
        this.irrApi.getSeries({ startISO, stopISO, field: 'GHI', granularity: this.selectedRange, limit: 200000 }),
        this.irrApi.getSeries({ startISO, stopISO, field: 'DNI', granularity: this.selectedRange, limit: 200000 }),
        this.irrApi.getSeries({ startISO, stopISO, field: 'DHI', granularity: this.selectedRange, limit: 200000 }),
      ]).pipe(
        map(([ghi, dni, dhi]) => {
          const toXY = (s?: SeriesOut) =>
            (s?.points ?? [])
              .map(p => ({ x: Date.parse(p.time), y: Number(p.value) }))
              .filter(pt => Number.isFinite(pt.y));

          const start = Date.parse(startISO);
          const stop  = Date.parse(stopISO);
          const stepMs = granularityToMs(this.selectedRange || '1s');

          return [
            { name: 'Global',  data: fillMissingTimestamps(toXY(ghi) as any, start, stop, stepMs) },
            { name: 'Directa', data: fillMissingTimestamps(toXY(dni) as any, start, stop, stepMs) },
            { name: 'Difusa',  data: fillMissingTimestamps(toXY(dhi) as any, start, stop, stepMs) },
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
    private images: ImagesService,   // servicio para imágenes (con stream)
  ) {}

  /**
   * Acción de búsqueda: valida la fecha y actualiza el stream `day$`.
   * También reinicia los gráficos (resetCounter).
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
    this.range$.next(this.selectedRange) // se emite el rango junto con el dia

    this.resetCounter++;     // fuerza reset de gráficos

    // El finalize del stream pone isLoading=false al terminar.
    // Si quieres liberar "loading" inmediato para la UI, déjalo:
    // setTimeout(() => (this.isLoading = false), 0);
  }

  /**
   * Devuelve la fecha en formato "DD/MM/YYYY" para mostrar en la UI.
   */
  prettyDay(d: string): string {
    const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  }

  // ¿El chart tiene al menos 1 punto?
readonly seriesEmpty$ = this.series$.pipe(
  map(series => !series?.some(s => (s?.data?.length ?? 0) > 0)),
  shareReplay(1)
);

// ¿Hay al menos 1 frame?
readonly framesEmpty$ = this.frames$.pipe(
  map(frames => (frames?.length ?? 0) === 0),
  shareReplay(1)
);

// No hay datos en NINGUNO de los dos
readonly noData$ = combineLatest([this.seriesEmpty$, this.framesEmpty$]).pipe(
  map(([seriesEmpty, framesEmpty]) => seriesEmpty && framesEmpty),
  startWith(false),
  shareReplay(1)
);

// (opcional) acción rápida
resetToToday(): void {
  this.selectedDay = this.defaultDay;
  this.onBuscar();
}

  /**
   * Handler para cuando cambia un frame en la UI (placeholder).
   */
  onFrameChange(_f: SkyFrame) {}
}
