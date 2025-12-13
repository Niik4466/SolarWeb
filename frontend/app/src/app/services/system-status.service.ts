import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_BASE = '/api';export interface DiskUsage {
  total_bytes: number;
  used_bytes: number;
  used_pct: number;
}

@Injectable({
  providedIn: 'root',
})
export class SystemStatusService {
  private http = inject(HttpClient);

  getDiskUsage(): Observable<DiskUsage> {
    return this.http.get<DiskUsage>(`${API_BASE}/monitor/disk`);
  }
}
