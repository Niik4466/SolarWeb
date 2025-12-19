// src/app/pages/graficos/graficos.ts

import { ChangeDetectionStrategy, Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, forkJoin, of, combineLatest } from 'rxjs';
import { switchMap, map, catchError, shareReplay, scan, startWith, finalize, tap, distinctUntilChanged } from 'rxjs/operators';

import { IrradianceChartComponent, Serie } from '../../components/charts/irradiance-chart/irradiance-chart';
import { ImagenesPorHoraComponent, SkyFrame } from '../../components/imagenes/imagenes.component';

import { ImagesService } from '../../services/images.api';
import { FieldName, IrradianceApi, SeriesOut } from '../../services/irradiance.api';
import { LoadingService } from '../../services/loading.service';

// ---------------- helpers ----------------

function todayLocalISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(n => parseInt(n, 10));
  return (h * 60) + (m || 0);
}

function sortFramesByTime(frames: SkyFrame[]): SkyFrame[] {
  return [...frames].sort((a, b) => toMinutes(String(a.time)) - toMinutes(String(b.time)));
}

function granularityToMs(granularity: string): number {
  const match = /^(\d+)([smhd])$/.exec(granularity);
  if (!match) return 1000;
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

function fillMissingTimestamps(
  points: { x: number; y: number }[],
  start: number,
  stop: number,
  stepMs: number
) {
  if (points.length === 0) return points;

  const filled: { x: number; y: number }[] = [];
  const existing = new Map(points.map(p => [p.x, p.y]));

  for (let t = start; t <= stop; t += stepMs) {
    filled.push({ x: t, y: existing.get(t) ?? 0 });
  }
  return filled;
}

// ---------------- component ----------------

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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficosComponent implements OnInit {
  ngOnInit(): void {
    this.onBuscar();
  }

  // UI state
  isLoading = false;
  errorMsg = '';
  resetCounter = 0;

  private framesDone = false;
  private seriesDone = false;
  private framesStreamingFinished = signal(true);

  // Granularidad
  selectedRange = '5m';
  readonly range$ = new BehaviorSubject<string>(this.selectedRange);

  // Fechas
  readonly defaultDay = todayLocalISO();
  selectedDay = this.defaultDay;
  private day$ = new BehaviorSubject<string>(this.defaultDay);
  readonly viewingDay$ = this.day$.asObservable();

  // Config imágenes
  private readonly FRAME_SAMPLE_EVERY = 10;
  private readonly FRAME_MAX = 20000;
  private readonly START_HHMM = '06:00';
  private readonly END_HHMM = '22:00';
  private readonly BATCH_MS = 100;

  // TODO: reemplazar por nombres reales del backend/influx
  private readonly FIELD_TEMP = 'Temp';
  private readonly FIELD_HUM = 'HR';

  // 🔑 Fuente reactiva única: día + granularidad
  private readonly query$ = combineLatest([
    this.day$.pipe(distinctUntilChanged()),
    this.range$.pipe(distinctUntilChanged()),
  ]).pipe(shareReplay(1));

  // ---------------- Frames ----------------
  frames$ = this.query$.pipe(
    switchMap(([day, range]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return of<SkyFrame[]>([]);

      this.errorMsg = '';
      this.framesDone = false;
      this.framesStreamingFinished.set(false);

      return this.images.streamDayFramesBatched(day, {
        startHHMM: this.START_HHMM,
        endHHMM: this.END_HHMM,
        sampleEvery: this.FRAME_SAMPLE_EVERY,
        limit: this.FRAME_MAX,
        bufferMs: this.BATCH_MS,
        granularity: range, // ✅ usar range reactivo
      }).pipe(
        scan((acc, batch) => {
          const next = acc.concat(batch);
          return next.length > this.FRAME_MAX ? next.slice(0, this.FRAME_MAX) : next;
        }, [] as SkyFrame[]),
        map(list => sortFramesByTime(list)),
        tap(list => {
          if (!this.framesDone && list.length > 0) {
            this.framesDone = true;
            this.stopLoadingIfReady();
          }
        }),
        catchError(err => {
          console.error('[Graficos] frames stream error', err);
          this.errorMsg = 'No fue posible cargar las imágenes (stream).';
          return of<SkyFrame[]>([]);
        }),
        finalize(() => {
          if (!this.framesDone) {
            this.framesDone = true;
            this.stopLoadingIfReady();
          }
          this.framesStreamingFinished.set(true);
        }),
        startWith([] as SkyFrame[])
      );
    }),
    shareReplay(1)
  );

  // ---------------- Irradiancia ----------------
  series$ = this.query$.pipe(
    switchMap(([day, range]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return of<Serie[]>([]);
      const startISO = `${day}T00:00:00Z`;
      const stopISO = `${day}T23:59:59Z`;

      this.seriesDone = false;

      return forkJoin([
        this.irrApi.getSeries({ startISO, stopISO, field: 'GHI', granularity: range, limit: 200000 }),
        this.irrApi.getSeries({ startISO, stopISO, field: 'DNI', granularity: range, limit: 200000 }),
        this.irrApi.getSeries({ startISO, stopISO, field: 'DHI', granularity: range, limit: 200000 }),
      ]).pipe(
        map(([ghi, dni, dhi]) => {
          const toXY = (s?: SeriesOut) =>
            (s?.points ?? [])
              .map(p => ({ x: Date.parse(p.time), y: Number(p.value) }))
              .filter(pt => Number.isFinite(pt.y));

          const start = Date.parse(startISO);
          const stop = Date.parse(stopISO);
          const stepMs = granularityToMs(range || '1s');

          return [
            { name: 'Global', data: fillMissingTimestamps(toXY(ghi), start, stop, stepMs) },
            { name: 'Directa', data: fillMissingTimestamps(toXY(dni), start, stop, stepMs) },
            { name: 'Difusa', data: fillMissingTimestamps(toXY(dhi), start, stop, stepMs) },
          ] as Serie[];
        }),
        tap(() => {
          this.seriesDone = true;
          this.stopLoadingIfReady();
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

  // ---------------- Temp/Hum (reutiliza misma lógica) ----------------
  tempSeries$ = this.buildTimeSeries$(this.FIELD_TEMP, 'Temperatura');
  humSeries$ = this.buildTimeSeries$(this.FIELD_HUM, 'Humedad');

  tempEmpty$ = this.tempSeries$.pipe(
    map(series => !series?.some(s => (s?.data?.length ?? 0) > 0)),
    shareReplay(1)
  );

  humEmpty$ = this.humSeries$.pipe(
    map(series => !series?.some(s => (s?.data?.length ?? 0) > 0)),
    shareReplay(1)
  );

  constructor(
    private irrApi: IrradianceApi,
    private images: ImagesService,
    private loadingSrv: LoadingService,
  ) {}

  private stopLoadingIfReady() {
    if (!this.isLoading) return;
    if (this.framesDone && this.seriesDone) {
      this.isLoading = false;
      this.loadingSrv.hide();
    }
  }

  onBuscar(): void {
    const day = this.selectedDay?.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      this.errorMsg = 'Fecha inválida.';
      return;
    }
    if (this.isLoading) return;

    this.errorMsg = '';
    this.isLoading = true;
    this.loadingSrv.show();

    this.framesDone = false;
    this.seriesDone = false;

    this.day$.next(day);
    this.range$.next(this.selectedRange); // ✅ importante: emite granularidad
    this.resetCounter++;
  }

  prettyDay(d: string): string {
    const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  }

  readonly seriesEmpty$ = this.series$.pipe(
    map(series => !series?.some(s => (s?.data?.length ?? 0) > 0)),
    shareReplay(1)
  );

  readonly framesEmpty$ = this.frames$.pipe(
    map(frames => (frames?.length ?? 0) === 0),
    shareReplay(1)
  );

  readonly noData$ = combineLatest([this.seriesEmpty$, this.framesEmpty$]).pipe(
    map(([seriesEmpty, framesEmpty]) => seriesEmpty && framesEmpty),
    startWith(false),
    shareReplay(1)
  );

  resetToToday(): void {
    this.selectedDay = this.defaultDay;
    this.onBuscar();
  }

  onFrameChange(_f: SkyFrame) {}
  readonly isFramesStreaming = computed(() => !this.framesStreamingFinished());

  private buildTimeSeries$(field: FieldName, name: string) {
    return this.query$.pipe(
      switchMap(([day, range]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return of<Serie[]>([]);
        const startISO = `${day}T00:00:00Z`;
        const stopISO = `${day}T23:59:59Z`;

        return this.irrApi.getSeries({
          startISO,
          stopISO,
          field,
          granularity: range, // ✅ usar range reactivo
          limit: 200000
        }).pipe(
          map(s => {
            const points =
              (s?.points ?? [])
                .map(p => ({ x: Date.parse(p.time), y: Number(p.value) }))
                .filter(pt => Number.isFinite(pt.y));

            const start = Date.parse(startISO);
            const stop = Date.parse(stopISO);
            const stepMs = granularityToMs(range || '1s');

            return [{
              name,
              data: fillMissingTimestamps(points, start, stop, stepMs)
            }] as Serie[];
          }),
          catchError(err => {
            console.error(`[Graficos] series error field=${field}`, err);
            return of<Serie[]>([]);
          })
        );
      }),
      shareReplay(1)
    );
  }
}
