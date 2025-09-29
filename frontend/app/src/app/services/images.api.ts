// src/app/services/images.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';

/* =========================
   MODELOS (tipos compartidos)
   ========================= */

/**
 * Representa un frame (imagen) del cielo.
 * Usado por la UI para mostrar imágenes en un slider/galería.
 */
export interface SkyFrame {
  /** Hora local en formato "HH:MM". */
  time: string;

  /** URL de la imagen servida por el backend. */
  src: string;

  /** Texto alternativo para accesibilidad. */
  alt: string;
}

/**
 * Objeto tal cual lo entrega MinIO (o el backend).
 */
export type MinioObject = {
  /** Nombre del archivo (incluye path relativo). */
  name: string;

  /** Tamaño en bytes del archivo. */
  size: number;

  /** Marca de tiempo opcional (ISO8601). */
  last_modified?: string;
};

/**
 * Respuesta de la API para un listado de objetos en un bucket.
 */
export type MinioListResponse = {
  /** Nombre del bucket. */
  bucket: string;

  /** Lista de objetos contenidos. */
  objects: MinioObject[];
};

/* =========================
   UTILS (funciones puras)
   ========================= */

/**
 * Base de la API (mueve a environments para producción).
 */
const API_BASE = 'http://127.0.0.1:8000';

/** Devuelve siempre dos dígitos (ej: 8 → "08"). */
function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }

/**
 * Transforma un objeto MinIO en un `SkyFrame`.
 * - Intenta extraer la hora desde el nombre de archivo (regex).
 * - Si no encuentra, usa `last_modified` convertido a hora local.
 * - Construye la URL para servir la imagen.
 *
 * @param o Objeto MinIO
 * @param bucket Nombre del bucket donde está almacenado
 * @returns Un `SkyFrame` válido o `null` si no se pudo extraer hora
 */
function minioObjectToSkyFrame(o: MinioObject, bucket: string): SkyFrame | null {
  const name = (o?.name ?? '').trim();
  if (!name) return null;

  // último segmento del path (ignora YYYY/MM/DD/)
  const last = name.split('/').pop() || name;

  let hh: string | undefined;
  let mm: string | undefined;

  // 1) Extrae hora desde el nombre con regex
  let m =
    last.match(/^(\d{2})[-_:](\d{2})[-_.](\d{2})\.(?:jpg|jpeg|png)$/i) || // HH-MM-SS
    last.match(/^(\d{2})[-_:](\d{2})\.(?:jpg|jpeg|png)$/i) ||             // HH-MM
    last.match(/(?:^|[_-])(\d{2})(\d{2})(\d{2})\.(?:jpg|jpeg|png)$/i);   // HHMMSS

  if (m) {
    hh = m[1];
    mm = m[2];
  }

  // 2) Si no salió del nombre, usa last_modified → hora local
  if (!hh || !mm) {
    const iso = (o.last_modified ?? '').toString();
    if (iso) {
      const dt = new Date(iso);
      if (!isNaN(dt.getTime())) {
        hh = pad2(dt.getHours());
        mm = pad2(dt.getMinutes());
      } else {
        // fallback regex en caso de fecha inválida
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

/** Convierte "HH:MM" a minutos absolutos del día (ej: "02:30" → 150). */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(n => parseInt(n, 10));
  return (h * 60) + (m || 0);
}

/**
 * Ordena frames por su hora ascendente.
 *
 * @param frames Arreglo de SkyFrame
 * @returns Frames ordenados cronológicamente
 */
function sortFramesByTime(frames: SkyFrame[]): SkyFrame[] {
  return [...frames].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

/* =========================
   SERVICIO (HTTP + RxJS)
   ========================= */

/**
 * Servicio Angular para interactuar con la API de imágenes del cielo.
 *
 * Se encarga de:
 * - Llamar al endpoint `/images` con `bucket` y `prefix`.
 * - Transformar objetos MinIO (`MinioObject`) en modelos de UI (`SkyFrame`).
 * - Manejar errores y cachear resultados recientes.
 */
@Injectable({ providedIn: 'root' })
export class ImagesService {                                                        
  private http = inject(HttpClient);
  private readonly BUCKET = 'imagenes-cielo';

  /**
   * Obtiene todos los frames de un día específico.
   *
   * @param dayISO Fecha en formato `YYYY-MM-DD`
   * @returns Observable con un arreglo de `SkyFrame[]`, ordenados por hora.
   */
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
      catchError(err => {
        console.error('[ImagesService] getDayFrames error', err);
        return of<SkyFrame[]>([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }
}
