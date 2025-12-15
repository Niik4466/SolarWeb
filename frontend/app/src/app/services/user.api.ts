// frontend/app/services/users.api.ts
// -----------------------------------------------------------
// Servicio Angular para manejar todas las operaciones
// relacionadas con usuarios y sus transacciones en el backend.
//
// Aquí se centralizan:
// - Obtener usuarios según su estado (pendiente / aprobado / eliminado)
// - Actualizar el estado de un usuario
// - Obtener usuarios eliminados
// - Eliminar usuarios (temporal y permanente)
// - Obtener historial de transacciones de un usuario
// -----------------------------------------------------------

import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

// -----------------------------------------------------------
// Tipos recibidos desde el backend
// -----------------------------------------------------------

/**
 * Representa un usuario tal como viene desde el backend.
 * Los campos corresponden al modelo UsuarioOut del API.
 */
export type UsuarioOut = {
  id: number;
  correo: string;
  nombre: string;
  apellido?: string | null;
  es_admin: boolean;                       // Permite distinguir si un usuario tiene rol administrador
  owner: boolean;                          // Si es el usuario dueño del sistema
  estado: 'pendiente' | 'aprobado' | 'eliminado';
  creado_en: string;                       // ISO datetime
  actualizado_en: string;
  aprobado_en?: string | null;             // Solo si fue aprobado
  eliminado_en?: string | null;            // Solo si fue eliminado
};

/**
 * Representa una transacción de exportación realizada por un usuario.
 * Puede ser por días específicos o por un rango.
 */
export type TransaccionOut = {
  id: number;
  usuario_id: number;
  archivos: string[];           // Ej: ["2025-11-05", "2025-11-15"] o ["2025-11-11 - 2025-11-15"]
  exportado_en: string | null;  // Fecha de exportación
  imagenes: boolean;            // Si incluyó imágenes
  var_ghi: boolean;             // Si incluyó GHI
  var_dni: boolean;             // Si incluyó DNI
  var_global: boolean;          // Si incluyó global
  creado_en: string;            // Fecha donde se creó la transacción
  tipo_exportar: 'dias' | 'rango';
  fecha_ini: string | null;     // Solo para rango
  fecha_fin: string | null;     // Solo para rango
};

// Para responses que devuelven { total, data }
type ByStatusResp = { total: number; data: UsuarioOut[] };

// Alias de tipo para pedir usuarios por estado
export type UsuarioEstado = 'pendiente' | 'aprobado' | 'eliminado';

// -----------------------------------------------------------
// Servicio principal
// -----------------------------------------------------------
@Injectable({ providedIn: 'root' })
export class UsersApi {
  private http = inject(HttpClient);

  /**
   * Base del API obtenida desde environment o fallback local.
   * Finalmente apunta a algo como: /api/users
   */
  private base = `${(window as any).environment?.apiBase ?? '/api'}/users`;

  // -----------------------------------------------------------
  // GET usuarios por estado
  // -----------------------------------------------------------

  /**
   * Obtiene usuarios filtrados por estado (pendiente, aprobado, eliminado).
   * Devuelve solo el array `data`, no el total.
   */
  getByStatus(status: UsuarioEstado): Observable<UsuarioOut[]> {
    const params = new HttpParams().set('status', status);

    return this.http.get<ByStatusResp>(`${this.base}/by_status`, { params })
      .pipe(map(r => r.data)); // Transformamos el response para extraer solo los usuarios
  }

  // -----------------------------------------------------------
  // PUT actualizar estado de usuario
  // -----------------------------------------------------------

  /**
   * Actualiza el estado del usuario:
   * - 'pendiente'
   * - 'aprobado'
   * - 'eliminado'
   *
   * Llama al endpoint PUT /update_status/{userId}
   */
  updateStatus(userId: number, estado: UsuarioEstado) {
    return this.http.put<{ msg: string; user: UsuarioOut }>(
      `${this.base}/update_status/${userId}`,
      { estado } // envía { estado: 'aprobado' }
    );
  }

  // -----------------------------------------------------------
  // GET obtener usuarios eliminados (solo administradores)
  // -----------------------------------------------------------

  /**
   * Devuelve todos los usuarios que estén en estado 'eliminado'.
   */
  getDeletedUsers(): Observable<UsuarioOut[]> {
    return this.http.get<{ total: number; data: UsuarioOut[] }>(`${this.base}/deleted_users`)
      .pipe(map(r => r.data));
  }

  // -----------------------------------------------------------
  // DELETE eliminación lógica (marcar usuario como eliminado)
  // -----------------------------------------------------------

  /**
   * Marca un usuario para eliminación (dependiendo del backend).
   * Es una eliminación NO permanente.
   */
  deleteUser(userId: number) {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.base}/delete_scheduled/?usuario_id=${userId}`
    );
  }

  // -----------------------------------------------------------
  // GET historial de transacciones del usuario
  // -----------------------------------------------------------

  /**
   * Obtiene todas las transacciones realizadas por un usuario.
   */
  getUserTransactions(userId: number) {
    return this.http.get<{ total: number; data: TransaccionOut[] }>(
      `${this.base}/get_transactions/${userId}`
    );
  }

  // -----------------------------------------------------------
  // DELETE eliminación permanente
  // -----------------------------------------------------------

  /**
   * Elimina un usuario PERMANENTEMENTE de la base de datos.
   * Requiere permisos de administrador en el backend.
   */
  deleteUserPermanently(id: number) {
    const params = new HttpParams().set('usuario_id', id);
    return this.http.delete<any>(`${this.base}/delete_permanently`, { params });
  }
}
