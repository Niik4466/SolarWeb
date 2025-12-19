// src/app/services/monitor.api.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

/**
 * Representa el estado del uso de disco del servidor.
 * Se utiliza para monitoreo de almacenamiento y alertas preventivas.
 */
export type DiskStatus = {
  /** Capacidad total del disco en bytes */
  total_bytes: number;

  /** Espacio utilizado en bytes */
  used_bytes: number;

  /** Porcentaje de uso del disco (0 a 100) */
  used_pct: number;
};

/**
 * Representa el estado básico de un servicio monitoreado.
 * La propiedad `ok` se interpreta a partir de la respuesta cruda (`raw`)
 * entregada por el backend.
 */
export type SimpleState = {
  /** Indica si el servicio se encuentra operativo */
  ok: boolean;

  /** Respuesta cruda del backend (ej: "OK", "ERROR", "DOWN") */
  raw: string;
};

/**
 * Servicio de monitoreo del sistema.
 *
 * Centraliza las llamadas a los endpoints de monitoreo del backend,
 * permitiendo consultar:
 *  - Estado del disco del servidor
 *  - Estado del servicio de adquisición de datos
 *  - Estado de servicios específicos (ej: sensor LOGO)
 *
 * Este servicio no maneja lógica de UI, solo entrega estados
 * que son interpretados por componentes o guards.
 */
@Injectable({ providedIn: 'root' })
export class MonitorApi {
  /** Cliente HTTP de Angular */
  private http = inject(HttpClient);

  /**
   * URL base de la API.
   * Puede externalizarse a environment.apiUrl si se desea.
   */
  private baseUrl = '/api';

  /**
   * Obtiene el estado actual del uso de disco del servidor.
   *
   * @returns Observable<DiskStatus>
   *
   * Endpoint backend:
   * GET /api/monitor/disk
   */
  getDiskStatus(): Observable<DiskStatus> {
    return this.http.get<DiskStatus>(`${this.baseUrl}/monitor/disk`);
  }

  /**
   * Consulta el estado del servicio principal de adquisición de datos.
   *
   * El backend responde con un string (por ejemplo "OK").
   * Este método transforma la respuesta en un objeto `SimpleState`
   * para facilitar su uso en la UI.
   *
   * @returns Observable<SimpleState>
   *
   * Endpoint backend:
   * GET /api/monitor/data_service/state
   */
  getDataServiceState(): Observable<SimpleState> {
    return this.http
      .get<string>(`${this.baseUrl}/monitor/data_service/state`)
      .pipe(
        map(raw => ({
          raw,
          ok: raw === 'OK',
        }))
      );
  }

  /**
   * Consulta el estado del servicio de adquisición asociado al sensor LOGO.
   *
   * Sigue la misma lógica que `getDataServiceState`,
   * pero apunta a un servicio específico.
   *
   * @returns Observable<SimpleState>
   *
   * Endpoint backend:
   * GET /api/monitor/data_service/LOGO/state
   */
  getLogoState(): Observable<SimpleState> {
    return this.http
      .get<string>(`${this.baseUrl}/monitor/data_service/LOGO/state`)
      .pipe(
        map(raw => ({
          raw,
          ok: raw === 'OK',
        }))
      );
  }
}
