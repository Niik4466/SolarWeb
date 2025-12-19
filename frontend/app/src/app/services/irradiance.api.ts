// frontend/app/src/app/services/irradiance.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';

const API_BASE = '/api';
/**
 * Nombres de campos de irradiancia aceptados por la API.
 * - `GHI`: Global Horizontal Irradiance
 * - `DNI`: Direct Normal Irradiance
 * - `DHI`: Diffuse Horizontal Irradiance
 */
export type FieldName = 'GHI' | 'DNI' | 'DHI' | 'HR' | 'Temp';

/**
 * Representa un punto de la serie temporal de irradiancia.
 */
export type IrrPoint = {
  /** Timestamp en formato ISO 8601 (ej: "2025-09-28T10:00:00Z"). */
  time: string;

  /** Valor numérico de la irradiancia en W/m². */
  value: number;

  /** Tipo de campo: GHI, DNI o DHI. */
  field: FieldName;
};

/**
 * Respuesta de la API para una serie de irradiancia.
 */
export type SeriesOut = {
  /** Campo de irradiancia solicitado (GHI/DNI/DHI). */
  field: FieldName;

  /** Lista de puntos de la serie temporal. */
  points: IrrPoint[];
};

/**
 * Servicio Angular para interactuar con la API de irradiancia.
 *
 * Provee métodos para solicitar series de irradiancia individuales o
 * las tres series (GHI, DNI y DHI) en conjunto, con opciones de
 * agregación temporal y límites de datos.
 */
@Injectable({ providedIn: 'root' })
export class IrradianceApi {
  private http = inject(HttpClient);

  /**
   * Obtiene una serie de irradiancia desde la API.
   *
   * @param params Parámetros de consulta:
   *  - `startISO`: fecha/hora inicial en formato ISO (ej: "2025-09-28T00:00:00Z").
   *  - `stopISO`: fecha/hora final en formato ISO.
   *  - `field`: tipo de serie (`GHI`, `DNI` o `DHI`).
   *  - `limit`: número máximo de puntos a devolver (default: 20000).
   *  - `granularity`: intervalo de agregación (ej: `"5m"`, `"1h"`).
   *  - `bucket`: nombre del bucket (opcional).
   *
   * @returns Observable con la serie solicitada (`SeriesOut`).
   */
  getSeries(params: {
    startISO: string;
    stopISO: string;
    field: FieldName;
    limit?: number;
    granularity?: string;   // p.ej. '5m' | '1h'
    bucket?: string;
  }): Observable<SeriesOut> {

    let httpParams = new HttpParams()
      .set('start', params.startISO)
      .set('stop', params.stopISO)
      .set('field', params.field)
      .set('limit', String(params.limit ?? 20000));

    if (params.granularity) httpParams = httpParams.set('granularity', params.granularity);
    if (params.bucket)          httpParams = httpParams.set('bucket', params.bucket);

    return this.http.get<SeriesOut>(`${API_BASE}/irradiance`, { params: httpParams });
  }

  /**
   * Obtiene las tres series (GHI, DNI y DHI) agregadas por hora para un día completo (UTC).
   *
   * @param dateISOyyyyMMdd Fecha en formato `YYYY-MM-DD` (UTC).
   * @param bucket (Opcional) bucket desde el cual leer los datos.
   *
   * @returns Observable con una tupla `[GHI, DNI, DHI]`, cada una de tipo `SeriesOut`.
   */
  getDaySeriesUTC(dateISOyyyyMMdd: string, bucket?: string): Observable<[SeriesOut, SeriesOut, SeriesOut]> {
    const startISO = `${dateISOyyyyMMdd}T00:00:00Z`;
    const stopISO  = `${dateISOyyyyMMdd}T23:59:59Z`;
    const common = { startISO, stopISO, limit: 20000, bucket };

    return forkJoin([
      this.getSeries({ ...common, field: 'GHI' }),
      this.getSeries({ ...common, field: 'DNI' }),
      this.getSeries({ ...common, field: 'DHI' }),
    ]);
  }
}
