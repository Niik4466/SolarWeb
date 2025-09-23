import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

const API_BASE = 'http://127.0.0.1:8000/api/v1';

export type IrrPoint = { time: string; value: number; field: 'GHI'|'DNI'|'DHI'|string };
export type SeriesOut = { field: 'GHI'|'DNI'|'DHI'|string; points: IrrPoint[] };

@Injectable({ providedIn: 'root' })
export class IrradianceApi {
  private http = inject(HttpClient);

  getSeries(params: {
    startISO: string; stopISO: string; field: 'GHI'|'DNI'|'DHI';
    limit?: number; aggregate_every?: string;
    bucket?: string;
  }): Observable<SeriesOut> {
    let p = new HttpParams()
      .set('start', params.startISO)
      .set('stop',  params.stopISO)
      .set('field', params.field)
      .set('aggregate_every', params.aggregate_every ?? '1h') // 👈 pedimos promedio 1 hora (ideal para gráfica por hora)
      .set('limit', String(params.limit ?? 20000));
    if (params.bucket) p = p.set('bucket', params.bucket);

    return this.http.get<SeriesOut>(`${API_BASE}/irradiance`, { params: p });
  }

  /** Pide las tres series (GHI/DNI/DHI) ya agregadas por hora para un día */
  getDaySeriesUTC(dateISOyyyyMMdd: string, bucket?: string) {
    const startISO = `${dateISOyyyyMMdd}T00:00:00Z`;
    const stopISO  = `${dateISOyyyyMMdd}T23:59:59Z`;
    const common = { startISO, stopISO, limit: 20000, aggregate_every: '1h', bucket };

    return Promise.all([
      this.getSeries({ ...common, field: 'GHI' }).toPromise(),
      this.getSeries({ ...common, field: 'DNI' }).toPromise(),
      this.getSeries({ ...common, field: 'DHI' }).toPromise(),
    ]);
  }
}
