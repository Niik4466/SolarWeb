// src/app/services/export.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API_BASE = 'http://127.0.0.1:8000/api/v1';

export type ExportDailyBody = {
  date: string;                         // "YYYY-MM-DD"
  variables: ('GHI'|'DNI'|'DHI')[];
  format: 'csv'|'json';
  include_images: boolean;
  images_bucket?: string;               // opcional
};

@Injectable({ providedIn: 'root' })
export class ExportApi {
  private http = inject(HttpClient);

  exportDaily(body: ExportDailyBody) {
    return this.http.post(`${API_BASE}/export/daily`, body, {
      responseType: 'blob'
    });
  }
}
