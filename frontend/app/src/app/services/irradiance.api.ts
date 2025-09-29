import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';

const API_BASE = 'http://127.0.0.1:8000/api/v1';

export type FieldName = 'GHI'|'DNI'|'DHI';

export type IrrPoint = {
  time: string;          // ISO 8601 (backend)
  value: number;
  field: FieldName;
};

export type SeriesOut = {
  field: FieldName;
  points: IrrPoint[];
};

@Injectable({ providedIn: 'root' })
export class IrradianceApi {
  private http = inject(HttpClient);

  getSeries(params: {
    startISO: string;
    stopISO: string;
    field: FieldName;
    limit?: number;
    aggregate_every?: string;   // p.ej. '5m' | '1h'
    bucket?: string;
  }): Observable<SeriesOut> {

    let httpParams = new HttpParams()
      .set('start', params.startISO)
      .set('stop', params.stopISO)
      .set('field', params.field)
      .set('limit', String(params.limit ?? 20000));

    if (params.aggregate_every) httpParams = httpParams.set('aggregate_every', params.aggregate_every);
    if (params.bucket)          httpParams = httpParams.set('bucket', params.bucket);

    return this.http.get<SeriesOut>(`${API_BASE}/irradiance`, { params: httpParams });
  }

  /** Las tres series (GHI/DNI/DHI) ya agregadas por hora para un día UTC (YYYY-MM-DD) */
  getDaySeriesUTC(dateISOyyyyMMdd: string, bucket?: string): Observable<[SeriesOut, SeriesOut, SeriesOut]> {
    const startISO = `${dateISOyyyyMMdd}T00:00:00Z`;
    const stopISO  = `${dateISOyyyyMMdd}T23:59:59Z`;
    const common = { startISO, stopISO, limit: 20000, aggregate_every: '1h', bucket };

    return forkJoin([
      this.getSeries({ ...common, field: 'GHI' }),
      this.getSeries({ ...common, field: 'DNI' }),
      this.getSeries({ ...common, field: 'DHI' }),
    ]);
  }
}
