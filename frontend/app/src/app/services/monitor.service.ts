// src/app/services/monitor.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export type DiskStatus = {
  total_bytes: number;
  used_bytes: number;
  used_pct: number;
};

export type SimpleState = {
  ok: boolean;
  raw: string;
};

@Injectable({ providedIn: 'root' })
export class MonitorApi {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:8000'; // o desde environment.apiUrl

  getDiskStatus(): Observable<DiskStatus> {
    return this.http.get<DiskStatus>(`${this.baseUrl}/monitor/disk`);
  }

  getDataServiceState(): Observable<SimpleState> {
    return this.http
      .get<string>(`${this.baseUrl}/monitor/data_service/state`)
      .pipe(map(raw => ({ raw, ok: raw === 'OK' })));
  }

  getLogoState(): Observable<SimpleState> {
    return this.http
      .get<string>(`${this.baseUrl}/monitor/data_service/LOGO/state`)
      .pipe(map(raw => ({ raw, ok: raw === 'OK' })));
  }
}
