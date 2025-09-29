// src/app/services/images.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';

/* =========================
   MODELOS (tipos compartidos)
   ========================= */
export interface SkyFrame {
  time: string;  // "HH:MM"
  src:  string;  // URL de la imagen
  alt:  string;  // texto alternativo
}

export type MinioObject = {
  name: string;
  size: number;
  last_modified?: string;   // ISO opcional (si el backend lo envía)
};

export type MinioListResponse = {
  bucket: string;
  objects: MinioObject[];
};

/* =========================
   UTILS (funciones puras)
   ========================= */
const API_BASE = 'http://127.0.0.1:8000'; // mueve a environments si quieres

function minioObjectToSkyFrame(o: MinioObject, bucket: string): SkyFrame | null {
  const name = (o?.name ?? '').trim();
  if (!name) return null;

  // intenta deducir HH:MM desde el nombre; si no, desde last_modified
  let hh: string | undefined, mm: string | undefined;

  // matches: 14-20.jpg / 14:20.jpg / ..._14-20.png
  const byName = name.match(/(\d{2})[:\-_\.](\d{2})\.(jpg|jpeg|png)$/i);
  if (byName) { hh = byName[1]; mm = byName[2]; }

  if (!hh || !mm) {
    const lm = (o.last_modified ?? '').toString().match(/T(\d{2}):(\d{2})/);
    if (lm) { hh = lm[1]; mm = lm[2]; }
  }
  if (!hh || !mm) return null;

  const time = `${hh}:${mm}`;
  const src  = `${API_BASE}/images/view?bucket=${encodeURIComponent(bucket)}&object_name=${encodeURIComponent(name)}`;
  const alt  = `Cielo ${time}`;

  return { time, src, alt };
}

function sortFramesByTime(frames: SkyFrame[]): SkyFrame[] {
  return [...frames].sort((a, b) =>
    a.time.localeCompare(b.time, 'es', { numeric: true })
  );
}

/* =========================
   SERVICIO (HTTP + RxJS)
   ========================= */
@Injectable({ providedIn: 'root' })
export class ImagesService {
  private http = inject(HttpClient);
  private readonly BUCKET = 'imagenes-cielo';

  /** Devuelve los frames de un día (YYYY-MM-DD) como SkyFrame[], ordenados por hora. */
  getDayFrames(dayISO: string): Observable<SkyFrame[]> {
    const prefix = dayISO.replaceAll('-', '/') + '/'; // "YYYY/MM/DD/"

    const params = new HttpParams()
      .set('bucket', this.BUCKET)
      .set('prefix', prefix);

    const url = `${API_BASE}/images`;

    return this.http.get<MinioListResponse>(url, { params }).pipe(
      map(resp => Array.isArray(resp?.objects) ? resp.objects : []),
      map(objects => objects.map(o => minioObjectToSkyFrame(o, this.BUCKET))),
      map(list => list.filter((f): f is SkyFrame => f !== null)),
      map(frames => sortFramesByTime(frames)),
      catchError(err => { console.error('[ImagesService] getDayFrames error', err); return of<SkyFrame[]>([]); }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }
}
