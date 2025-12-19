// src/app/services/mail.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/**
 * URL base de la API backend.
 * Puede externalizarse a environment.apiUrl si se requiere.
 */
const API_BASE = '/api';

/**
 * Servicio de envío de correos electrónicos.
 *
 * Este servicio encapsula la comunicación con el backend
 * para el envío de correos mediante el endpoint /mail/send_mail.
 *
 * Se utiliza para:
 *  - Notificaciones del sistema
 *  - Envío de credenciales
 *  - Alertas automáticas
 *  - Comunicación con usuarios y administradores
 */
@Injectable({ providedIn: 'root' })
export class MailApi {
  /** Cliente HTTP de Angular */
  private http = inject(HttpClient);

  /**
   * Envía un correo electrónico utilizando el backend.
   *
   * Realiza una petición GET al endpoint correspondiente,
   * enviando los parámetros del correo vía query params.
   *
   * @param to Correo electrónico del destinatario
   * @param subject Asunto del correo
   * @param body Contenido del correo (texto o HTML)
   *
   * @returns Observable con el estado del envío
   *
   * Respuesta esperada:
   * {
   *   status: "ok" | "error",
   *   detail?: string
   * }
   *
   * Endpoint backend:
   * GET /api/mail/send_mail
   */
  sendMail(to: string, subject: string, body: string) {
    const params = new HttpParams()
      .set('to', to)
      .set('subject', subject)
      .set('body', body);

    return this.http.get<{ status: string; detail?: string }>(
      `${API_BASE}/mail/send_mail`,
      { params }
    );
  }
}
