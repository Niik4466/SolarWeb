// src/app/services/export.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/**
 * Base de la API (mueve a environments para producción).
 */
const API_BASE = 'http://127.0.0.1:8000/api/v1';

/* =========================
   MODELOS DE EXPORTACIÓN
   ========================= */

/**
 * Cuerpo de la petición para exportar datos de **un solo día**.
 */
export type ExportDailyBody = {
  /** Fecha en formato `YYYY-MM-DD`. */
  date: string;

  /** Variables de irradiancia a exportar. */
  variables: ('GHI'|'DNI'|'DHI')[];

  /** Formato de exportación (`csv` o `json`). */
  format: 'csv'|'json';

  /** Si `true`, incluye imágenes asociadas al día. */
  include_images: boolean;

  /** Nombre del bucket de imágenes (opcional). */
  images_bucket?: string;
};

/**
 * Cuerpo de la petición para exportar datos de un **rango de fechas**.
 */
export type ExportRangeBody = {
  /** Fecha inicial en formato `YYYY-MM-DD`. */
  inicio: string;

  /** Fecha final en formato `YYYY-MM-DD`. */
  fin: string;

  /** Variables de irradiancia a exportar. */
  variables: ('GHI'|'DNI'|'DHI')[];

  /** Formato de exportación (`csv` o `json`). */
  format: 'csv'|'json';

  /**
   * Si `true`, incluye imágenes del rango de fechas.
   * Normalmente el backend devuelve un ZIP con los datos + imágenes.
   */
  include_images: boolean;

  /** Nombre del bucket de imágenes (opcional). */
  images_bucket?: string;
};

/* =========================
   SERVICIO (HTTP)
   ========================= */

/**
 * Servicio Angular para interactuar con los endpoints de **exportación de datos**.
 *
 * Permite solicitar al backend la exportación de:
 * - Datos de un **día** específico.
 * - Datos de un **rango de fechas**.
 *
 * Las respuestas vienen como `Blob`, ya que se espera descargar
 * archivos (CSV, JSON o ZIP).
 */
@Injectable({ providedIn: 'root' })
export class ExportApi {
  private http = inject(HttpClient);

  /**
   * Exporta datos de un **día específico**.
   *
   * @param body Objeto con fecha, variables y formato de exportación.
   * @returns Observable con un `Blob` (archivo descargable).
   */
  exportDaily(body: ExportDailyBody) {
    return this.http.post(`${API_BASE}/export/daily`, body, {
      responseType: 'blob' as const
    });
  }

  /**
   * Exporta datos de un **rango de fechas**.
   *
   * @param body Objeto con rango de fechas, variables y formato de exportación.
   * @returns Observable con un `Blob` (archivo descargable).
   */
  exportRange(body: ExportRangeBody) {
    return this.http.post(`${API_BASE}/export/range`, body, {
      responseType: 'blob' as const
    });
  }
}
