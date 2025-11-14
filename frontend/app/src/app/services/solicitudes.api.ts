// solicitudes.api.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export const environment = {
  production: false,
  apiBase: 'http://127.0.0.1:8000',
};

/**
 * Representa un usuario según el backend.
 * Se asume que algunos valores pueden venir en formato enum del backend,
 * por eso se normalizan luego en el servicio.
 */
export type Usuario = {
  id: number;
  correo: string;
  nombre: string;
  apellido: string | null;
  estado: 'pendiente' | 'aprobado' | 'eliminado' | string;
  es_admin: boolean;
  creado_en?: string;          // fechas ISO
  actualizado_en?: string;
  aprobado_en?: string | null;
};

/**
 * Respuesta estándar del endpoint /users/by_status
 */
export type UsersByStatusResponse = {
  total: number;
  data: Usuario[];
};

/**
 * Representa la solicitud de registro asociada a un usuario.
 */
export type SolicitudAPI = {
  id: number;
  usuario_id: number;
  justificacion: string | null;
  creado_en: string; // ISO
};

@Injectable({ providedIn: 'root' })
export class UserService {

  /** HttpClient inyectado mediante API de Angular Signals */
  private http = inject(HttpClient);

  /** Base del endpoint para usuarios */
  private base = `${environment.apiBase}/users`;

  // ============================================================
  // 1. Obtener usuarios por estado
  // ============================================================

  /**
   * Obtiene la lista de usuarios según su estado:
   *  - pendiente
   *  - aprobado
   *  - eliminado
   *
   * @param status Estado a consultar.
   * @returns Observable<{ total: number; data: Usuario[] }>
   *
   * Además:
   * - Normaliza `estado` por si el backend retorna enums como objetos.
   */
  getByStatus(status: 'pendiente' | 'aprobado' | 'eliminado') {
    return this.http
      .get<UsersByStatusResponse>(`${this.base}/by_status?status=${status}`)
      .pipe(
        map(resp => {
          // Seguridad ante respuesta nula/indefinida
          const data = (resp?.data ?? []).map(u => ({
            ...u,
            // Normalización: backend podría enviar estado.enum.value
            estado: (u as any).estado?.value ?? u.estado,
          }));

          return { total: data.length, data };
        })
      );
  }

  // ============================================================
  // 2. Obtener solicitud asociada a un usuario
  // ============================================================

  /**
   * Devuelve la solicitud de registro del usuario.
   * NOTA: Este endpoint puede no existir aun en tu backend.
   *
   * @param usuarioId ID del usuario.
   * @returns Observable<SolicitudAPI | null>
   *
   * Si el endpoint no existe o retorna error → devuelve `null`
   * para permitir un fallback silencioso en el componente.
   */
  getSolicitudByUsuario(usuarioId: number) {
    const url = `${environment.apiBase}/solicitudes/by_user/${usuarioId}`;
    return this.http.get<SolicitudAPI>(url).pipe(
      catchError(() => of<SolicitudAPI | null>(null))
    );
  }

  // ============================================================
  // 3. Aprobar usuarios
  // ============================================================

  /**
   * Aprueba a un usuario.
   * El backend permite elegir si se le asigna rol admin o no.
   *
   * @param userId ID del usuario a aprobar.
   * @param admin boolean → true si será administrador.
   *
   * @returns Observable<any>
   *
   * Endpoint esperado: PUT /users/approve/{id}/{admin}
   */
  approveUser(userId: number, admin: boolean) {
    return this.http.put(`${this.base}/approve/${userId}/${admin}`, {});
  }

  // ============================================================
  // 4. Cambiar estado de un usuario
  // ============================================================

  /**
   * Permite cambiar el estado de un usuario (pendiente/aprobado/eliminado).
   *
   * @param userId ID del usuario.
   * @param estado Nuevo estado.
   *
   * @returns Observable<any>
   *
   * Endpoint backend: PUT /users/update_status/{id}
   */
  updateStatus(userId: number, estado: 'pendiente' | 'aprobado' | 'eliminado') {
    return this.http.put(`${this.base}/update_status/${userId}`, { estado });
  }

  // ============================================================
  // 5. Obtener pendientes junto con sus solicitudes
  // ============================================================

  /**
   * Obtiene usuarios pendientes junto con su solicitud asociada.
   * Ideal para una vista donde admin revisa todo en un solo llamado.
   *
   * Endpoint backend sugerido:
   *    GET /users/pending_with_solicitudes
   *
   * @returns Observable<{ total: number; data: any[] }>
   */
  getPendingWithSolicitudes() {
    return this.http.get<{ total: number; data: any[] }>(
      `${this.base}/pending_with_solicitudes`
    );
  }

  // ============================================================
  // 6. Eliminar usuarios (borrado programado)
  // ============================================================

  /**
   * Marca un usuario para eliminación.
   * Importante: No elimina inmediatamente, depende del backend.
   *
   * @param userId ID del usuario.
   * @returns Observable<{ success: boolean; message: string }>
   *
   * Endpoint backend:
   *    DELETE /users/delete_scheduled/?usuario_id={id}
   */
  deleteUser(userId: number) {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.base}/delete_scheduled/?usuario_id=${userId}`
    );
  }
}
