// src/app/services/export.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API_BASE = 'http://127.0.0.1:8000';
export type MetricKey = 'mean' | 'min' | 'max' | 'sum';

// Opcional: tipo para las granularidades que tienes en backend
export type TimeGranularity =
  | '1s'
  | '10s'
  | '30s'
  | '1m'
  | '5m'
  | '30m'
  | '1h';

type CommonExportBody = {
  variables: ('GHI'|'DNI'|'DHI')[];
  format: 'csv'|'json';
  include_images: boolean;
  images_bucket?: string;
  start_hour?: string;        // "HH:MM"
  end_hour?: string;          // "HH:MM"
  granularity?: TimeGranularity | null;
  metrics?: MetricKey[];
};

/** Día único */
export type ExportDayBody = CommonExportBody & {
  date: string; // YYYY-MM-DD
};

/** Múltiples días */
export type ExportDailyBatchBody = CommonExportBody & {
  dates: string[]; // ["YYYY-MM-DD", ...]
};

/** Rango de fechas */
export type ExportByRangeBody = CommonExportBody & {
  date_init: string;  // YYYY-MM-DD
  date_finish: string;
};

@Injectable({ providedIn: 'root' })
export class ExportApi {
  private http = inject(HttpClient);

  exportDaily(body: ExportDayBody) {
    return this.http.post(`${API_BASE}/export/day`, body, {
      responseType: 'blob' as const,
    });
  }

  exportDailyBatch(body: ExportDailyBatchBody) {
    return this.http.post(`${API_BASE}/export/daily/batch`, body, {
      responseType: 'blob' as const,
    });
  }

  exportRange(body: ExportByRangeBody) {
    return this.http.post(`${API_BASE}/export/range`, body, {
      responseType: 'blob' as const,
    });
  }
}
