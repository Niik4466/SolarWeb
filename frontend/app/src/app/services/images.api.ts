// src/app/services/images.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, Subject } from 'rxjs';
import { map, catchError, shareReplay, bufferTime, filter } from 'rxjs/operators';

/* =========================
   MODELOS (tipos compartidos)
   ========================= */

export interface SkyFrame {
  time: string; // "HH:MM"
  src: string;
  alt: string;
}

export type MinioObject = { name: string };

export type MinioListResponse = {
  bucket: string;
  objects: MinioObject[];
};

/* =========================
   UTILS (funciones puras)
   ========================= */

// Mueve a environments en prod
const API_BASE = '/api';
function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }

function minioObjectToSkyFrame(o: MinioObject, bucket: string): SkyFrame | null {
  const name = (o?.name ?? '').trim();
  if (!name) return null;

  const last = name.split('/').pop() || name;

  let hh: string | undefined;
  let mm: string | undefined;

  const m =
    last.match(/^(\d{2})[-_:](\d{2})[-_.](\d{2})\.(?:jpg|jpeg|png)$/i) ||
    last.match(/^(\d{2})[-_:](\d{2})\.(?:jpg|jpeg|png)$/i) ||
    last.match(/(?:^|[_-])(\d{2})(\d{2})(\d{2})\.(?:jpg|jpeg|png)$/i);

  if (m) {
    hh = m[1]; mm = m[2];
  }
  if (!hh || !mm) return null;

  const time = `${hh}:${mm}`;
  const src  = `${API_BASE}/images/view?bucket=${encodeURIComponent(bucket)}&object_name=${encodeURIComponent(name)}`;
  const alt  = `Cielo ${time}`;
  return { time, src, alt };
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(n => parseInt(n, 10));
  return (h * 60) + (m || 0);
}

function sortFramesByTime(frames: SkyFrame[]): SkyFrame[] {
  return [...frames].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

/* =========================
   SERVICIO (HTTP + RxJS)
   ========================= */

@Injectable({ providedIn: 'root' })
export class ImagesService {
  private http = inject(HttpClient);
  private readonly BUCKET = 'imagenes-cielo';

  // ===== Abortador del stream actual =====
  private currentStreamAbort?: AbortController;

  /**
   * Lista "clásica" (respuesta JSON completa).
   */
  getDayFrames(dayISO: string): Observable<SkyFrame[]> {
    const prefix = dayISO.replaceAll('-', '/') + '/';

    const params = new HttpParams()
      .set('bucket', this.BUCKET)
      .set('prefix', prefix);

    const url = `${API_BASE}/images`;

    return this.http.get<MinioListResponse>(url, { params }).pipe(
      map(resp => Array.isArray(resp?.objects) ? resp.objects : []),
      map(objects => objects.map(o => minioObjectToSkyFrame(o, this.BUCKET))),
      map(list => list.filter((f): f is SkyFrame => f !== null)),
      map(frames => sortFramesByTime(frames)),
      catchError(err => {
        console.error('[ImagesService] getDayFrames error', err);
        return of<SkyFrame[]>([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /**
   * Stream NDJSON: emite SkyFrame a medida que llegan líneas.
   * - Usa AbortController para cancelar al cambiar de día.
   * - Aplica parámetros de muestreo/rango en el servidor.
   */
  streamDayFrames(dayISO: string, opts?: {
    startHHMM?: string;   // '08:00'
    endHHMM?: string;     // '18:00'
    sampleEvery?: number; // 10
    limit?: number;       // 5000
    startAfter?: string;  // cursor opcional
    granularity?: string; // '1s', '30s', '1m', '5m', '10m', '15m', '30m', '1h'
  }): Observable<SkyFrame> {
    // Cancela el stream anterior si está vivo
    this.cancelCurrentStream();

    const prefix = dayISO.replaceAll('-', '/') + '/';
    const params = new URLSearchParams({
      bucket: this.BUCKET,
      prefix,
      sample_every: String(opts?.sampleEvery ?? 10),
      limit: String(opts?.limit ?? 5000),
    });
    if (opts?.startHHMM) params.set('start_hhmm', opts.startHHMM);
    if (opts?.endHHMM)   params.set('end_hhmm',  opts.endHHMM);
    if (opts?.startAfter)params.set('start_after', opts.startAfter);
    if (opts?.granularity) params.set('granularity', opts.granularity);

    const url = `${API_BASE}/images/stream?${params.toString()}`;
    const controller = new AbortController();
    this.currentStreamAbort = controller;

    return new Observable<SkyFrame>(observer => {
      fetch(url, { signal: controller.signal })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (!res.body) throw new Error('Response has no readable body');
          const reader  = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';

          const pump = (): any =>
            reader.read().then(({ done, value }) => {
              if (done) { observer.complete(); return; }
              buf += decoder.decode(value, { stream: true });

              // Procesa líneas completas NDJSON
              let idx: number;
              while ((idx = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 1);
                if (!line) continue;
                try {
                  const obj = JSON.parse(line) as MinioObject | { error?: string };
                  if ((obj as any).error) {
                    console.warn('[ImagesService] stream error line:', (obj as any).error);
                    continue;
                  }
                  const frame = minioObjectToSkyFrame(obj as MinioObject, this.BUCKET);
                  if (frame) observer.next(frame);
                } catch (e) {
                  console.warn('[ImagesService] NDJSON parse error', e);
                }
              }
              return pump();
            })
            .catch(err => observer.error(err));

          return pump();
        })
        .catch(err => observer.error(err));

      // Teardown: aborta el fetch cuando se unsubscribe
      return () => controller.abort();
    });
  }

  /**
   * Variante en lotes: emite arrays de SkyFrame cada ~100ms (si hay elementos).
   * Útil para reducir repaints en listas/galerías grandes.
   */
  streamDayFramesBatched(dayISO: string, opts?: {
    startHHMM?: string;
    endHHMM?: string;
    sampleEvery?: number;
    limit?: number;
    startAfter?: string;
    bufferMs?: number;     // default 100ms
    granularity?: string;  // default '5m'
  }): Observable<SkyFrame[]> {
    const bufferMs = opts?.bufferMs ?? 100;
    const granularity = opts?.granularity ?? '5m';
    return this.streamDayFrames(dayISO, opts).pipe(
      bufferTime(bufferMs),
      // emite solo si hay elementos en el lote
      map(batch => batch.filter(Boolean)),
      filter(batch => batch.length > 0)
    );
  }

  /**
   * Cancela el stream NDJSON en curso (si existe).
   */
  cancelCurrentStream(): void {
    try {
      this.currentStreamAbort?.abort();
    } catch { /* no-op */ }
    this.currentStreamAbort = undefined;
  }
}
