import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * URL base de la API backend.
 * Puede externalizarse a environment.apiUrl si se requiere.
 */
const API_BASE = '/api';

/**
 * Representa el estado del uso de disco del servidor.
 * Se utiliza para mostrar métricas de almacenamiento
 * y generar alertas preventivas.
 */
export interface DiskUsage {
  /** Capacidad total del disco en bytes */
  total_bytes: number;

  /** Espacio utilizado en bytes */
  used_bytes: number;

  /** Porcentaje de uso del disco (0 a 100) */
  used_pct: number;
}

/**
 * Servicio de estado del sistema.
 *
 * Centraliza la consulta de métricas básicas del servidor,
 * como el uso de disco, para fines de monitoreo y visualización.
 */
@Injectable({
  providedIn: 'root',
})
export class SystemStatusService {
  /** Cliente HTTP de Angular */
  private http = inject(HttpClient);

  /**
   * Obtiene el estado actual del uso de disco del servidor.
   *
   * @returns Observable<DiskUsage>
   *
   * Endpoint backend:
   * GET /api/monitor/disk
   */
  getDiskUsage(): Observable<DiskUsage> {
    return this.http.get<DiskUsage>(`${API_BASE}/monitor/disk`);
  }
}
