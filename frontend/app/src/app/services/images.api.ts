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

function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }

function minioObjectToSkyFrame(o: MinioObject, bucket: string): SkyFrame | null {
  const name = (o?.name ?? '').trim();
  if (!name) return null;

  // Trabaja con el último segmento del path (ignora YYYY/MM/DD/)
  const last = name.split('/').pop() || name;

  let hh: string | undefined;
  let mm: string | undefined;

  // 1) Intento por nombre de archivo (varios patrones comunes)
  //    a) HH-MM-SS.jpg | HH_MM_SS.png | HH.MM.SS.jpeg
  let m =
    last.match(/^(\d{2})[-_:](\d{2})[-_.](\d{2})\.(?:jpg|jpeg|png)$/i) ||
    //    b) HH-MM.jpg | HH_MM.png | HH.MM.jpeg
    last.match(/^(\d{2})[-_:](\d{2})\.(?:jpg|jpeg|png)$/i) ||
    //    c) ..._HHMMSS.jpg  (ej: frame_142003.jpg)
    last.match(/(?:^|[_-])(\d{2})(\d{2})(\d{2})\.(?:jpg|jpeg|png)$/i);

  if (m) {
    hh = m[1];
    mm = m[2];
  }

  // 2) Si no salió del nombre, uso last_modified -> hora LOCAL
  if (!hh || !mm) {
    const iso = (o.last_modified ?? '').toString();
    if (iso) {
      const dt = new Date(iso); // respeta offset si viene con zona; si es 'Z', convierte a local
      if (!isNaN(dt.getTime())) {
        hh = pad2(dt.getHours());   // LOCAL
        mm = pad2(dt.getMinutes()); // LOCAL
      } else {
        // Fallback ultra simple por regex si el Date fallara
        const t = iso.match(/T(\d{2}):(\d{2})/);
        if (t) { hh = t[1]; mm = t[2]; }
      }
    }
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
