// frontend/app/services/transactions.api.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * ----------------------------------------------------------
 * INTERFACES: Modelos usados para crear y recibir transacciones
 * ----------------------------------------------------------
 */

/**
 * Estructura usada para crear una transacción de exportación.
 * Coincide con `TransaccionCreate` del backend FastAPI.
 */
export interface TransaccionCreate {
  /** ID del usuario que realiza la exportación */
  usuario_id: number;

  /**
   * Lista de archivos exportados (CSV/ZIP).
   * Puede ser null, undefined o array vacío según lo que se exporte.
   */
  archivos?: string[] | null;

  /** Si la exportación incluye imágenes del cielo */
  imagenes: boolean;

  /** Si incluye la variable GHI */
  var_ghi: boolean;

  /** Si incluye la variable DNI */
  var_dni: boolean;

  /** Si incluye irradiancia global */
  var_global: boolean;
}

/**
 * Respuesta completa del backend cuando se crea o consulta una transacción.
 * Extiende TransaccionCreate con:
 *  - id numérico
 *  - timestamps en formato ISO
 */
export interface TransaccionOut extends TransaccionCreate {
  /** ID único asignado por el backend */
  id: number;

  /** Fecha en la que el usuario realizó la exportación (ISO) */
  exportado_en: string | null;

  /** Fecha en la que se guardó la transacción en la base de datos (ISO) */
  creado_en: string;
}

/**
 * Servicio de Angular para manejar el historial de transacciones de exportación.
 *
 * Se encarga de enviar al backend:
 *  - qué usuario exportó,
 *  - qué variables incluyó,
 *  - si exportó imágenes,
 *  - qué archivos se generaron.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsApi {

  /** Cliente HTTP inyectado */
  private http = inject(HttpClient);

  /**
   * Base URL del backend.
   *
   * Se obtiene así por compatibilidad con cómo tienes UsersApi:
   *  - Primero intenta leer (window as any).environment.apiBase
   *  - Si no existe, usa localhost por defecto
   */
  private base = `${(window as any).environment?.apiBase ?? '/api'}/users`;

  // ----------------------------------------------------------
  // MÉTODOS DEL SERVICIO
  // ----------------------------------------------------------

  /**
   * Guarda una transacción en el backend.
   *
   * Llama al endpoint:
   *   POST /users/save_transaction
   *
   * @param payload Objeto con los datos de la transacción (usuario, variables, imágenes, archivos)
   * @returns Observable<TransaccionOut> → respuesta del backend con ID y fechas
   *
   * Ejemplo de uso:
   *  transactionsApi.saveTransaction({
   *    usuario_id: 5,
   *    imagenes: true,
   *    var_ghi: true,
   *    var_dni: false,
   *    var_global: true,
   *    archivos: ['datos_ghi.csv'],
   *  }).subscribe(...)
   */
  saveTransaction(payload: TransaccionCreate): Observable<TransaccionOut> {
    return this.http.post<TransaccionOut>(
      `${this.base}/save_transaction`,
      payload
    );
  }
}
