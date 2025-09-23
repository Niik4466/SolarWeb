// src/app/pages/graficos/graficos.ts
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';

import { IrradianceChartComponent, Serie } from '../../components/charts/irradiance-chart/irradiance-chart';
import { ImagenesPorHoraComponent, SkyFrame } from '../../components/imagenes/imagenes.component';

type MinioObject = { name: string; size: number; last_modified?: string; Last_modified?: string };
type MinioListResponse = { bucket: string; objects: MinioObject[] };

@Component({
  selector: 'app-graficos',
  standalone: true,
  imports: [CommonModule, HttpClientModule, IrradianceChartComponent, ImagenesPorHoraComponent],
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

        <div *ngIf="loading" class="hint">Cargando imágenes…</div>
        <div *ngIf="!loading && skyFrames.length === 0" class="hint">No hay imágenes para mostrar.</div>
        <div *ngIf="error" class="error">Error cargando imágenes: {{ error }}</div>
      </div>
    </section>
  `,
  styleUrls: ['./graficos.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficosComponent implements OnInit {
  // === AJUSTA ESTO A TU ENTORNO ===
  private readonly API_BASE = 'http://127.0.0.1:8000';
  private readonly BUCKET = 'imagenes-cielo';
  private readonly DAY_ISO = '2025-08-02'; // ej. 2025-08-04

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  // Chart (lo dejas estático por ahora)
  hours = ['6 AM','7 AM','8 AM','9 AM','10 AM','11 AM','12 PM','2 PM','4 PM','6 PM','8 PM'];
  series: Serie[] = [
    { name: 'Global',  data: [0,200,450,700,900,960,920,700,450,200,0] },
    { name: 'Direct',  data: [0,180,420,650,820,840,800,620,400,180,0] },
    { name: 'Diffuse', data: [0,120,300,480,620,680,660,520,340,150,0] },
  ];

  skyFrames: SkyFrame[] = [];
  loading = false;
  error = '';

  ngOnInit(): void {
    const prefix = this.DAY_ISO.replaceAll('-', '/') + '/'; // "YYYY/MM/DD/"
    this.fetchDayFrames(prefix);
  }

  private fetchDayFrames(prefix: string) {
    this.loading = true;
    this.error = '';
    this.skyFrames = [];

    const listUrl = `${this.API_BASE}/images?bucket=${encodeURIComponent(this.BUCKET)}&prefix=${encodeURIComponent(prefix)}`;

    this.http.get<MinioListResponse>(listUrl).subscribe({
      next: (resp) => {
        const objects = Array.isArray(resp?.objects) ? resp.objects : [];

        // Convierte a frames (acepta 13_56_14.jpg / 13-56-14.JPG / 13:56:14.png)
        const frames = objects
          .map(o => this.objectToFrame(o))
          .filter((f): f is SkyFrame => !!f)
          // ordena por hora "HH:MM"
          .sort((a, b) => String(a.time).localeCompare(String(b.time), 'es', { numeric: true }))
        this.skyFrames = frames;
        this.loading = false;
        this.cdr.markForCheck(); // asegura render con OnPush
        // console.debug('Frames cargados:', frames);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.message ?? 'desconocido';
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Convierte el objeto MinIO a un SkyFrame.
   * 1) Intenta parsear hora desde el nombre: HH[_:-]MM[_:-]SS.ext
   * 2) Si falla, usa last_modified/Last_modified ISO: ...T13:56:14...
   */
  private objectToFrame(o: MinioObject): SkyFrame | null {
    const name = (o?.name ?? '').trim();
    if (!name) return null;

    const last = name.split('/').pop() ?? '';
    let hh: string | undefined, mm: string | undefined, ss: string | undefined;

    // Regex tolerante a separadores _, -, :
    const m = last.match(/(\d{2})[:_-](\d{2})[:_-](\d{2})\.(jpg|jpeg|png)$/i);
    if (m) {
      hh = m[1]; mm = m[2]; ss = m[3];
    } else {
      const iso = o.last_modified ?? o.Last_modified ?? '';
      const tm = String(iso).match(/T(\d{2}):(\d{2})(?::(\d{2}))/);
      if (tm) { hh = tm[1]; mm = tm[2]; ss = tm[3] ?? '00'; }
    }

    if (!hh || !mm) return null;

    const timeLabel = `${hh}:${mm}`;
    const objectNameParam = encodeURIComponent(name);
    const src = `${this.API_BASE}/images/view?bucket=${encodeURIComponent(this.BUCKET)}&object_name=${objectNameParam}`;

    return { time: timeLabel, src, alt: `Cielo ${timeLabel}` };
  }

  onFrameChange(f: SkyFrame) {
    // futuro: sincronizar con gráfico si quieres resaltar el punto de esa hora
    // console.log('Imagen seleccionada', f);
  }
}
