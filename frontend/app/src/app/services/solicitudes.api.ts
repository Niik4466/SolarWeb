import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export const environment = {
  production: false,
  apiBase: 'http://127.0.0.1:8000',
};
export type Usuario = {
  id: number;
  correo: string;
  nombre: string;
  apellido: string | null;
  estado: 'pendiente' | 'aprobado' | 'eliminado' | string;
  es_admin: boolean;
  creado_en?: string;          // ISO
  actualizado_en?: string;     // ISO
  aprobado_en?: string | null; // ISO
};

export type UsersByStatusResponse = {
  total: number;
  data: Usuario[];
};

export type SolicitudAPI = {
  id: number;
  usuario_id: number;
  justificacion: string | null;
  creado_en: string; // ISO
};

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/users`;

  /** Usuarios por estado */
  getByStatus(status: 'pendiente' | 'aprobado' | 'eliminado') {
    return this.http.get<UsersByStatusResponse>(`${this.base}/by_status?status=${status}`).pipe(
      map(resp => {
        const data = (resp?.data ?? []).map(u => ({
          ...u,
          // normalizar enum -> string si viniera como objeto
          estado: (u as any).estado?.value ?? u.estado,
        }));
        return { total: data.length, data };
      })
    );
  }

  /**
   * (Opcional) Obtener la solicitud de un usuario.
   * Si aún NO tienes este endpoint, déjalo por ahora: el componente caerá en fallback.
   * Endpoint sugerido: GET /api/v1/solicitudes/by_user/{usuario_id}
   */
  getSolicitudByUsuario(usuarioId: number) {
    const url = `${environment.apiBase}/solicitudes/by_user/${usuarioId}`;
    return this.http.get<SolicitudAPI>(url).pipe(
      catchError(() => of<SolicitudAPI | null>(null)) // fallback silencioso
    );
  }

  /** (Opcional) Aprobar usuario con o sin admin */
  approveUser(userId: number, admin: boolean) {
    return this.http.put(`${this.base}/approve/${userId}/${admin}`, {});
  }

  /** (Opcional) Cambiar estado (por ejemplo, a 'eliminado') */
  updateStatus(userId: number, estado: 'pendiente' | 'aprobado' | 'eliminado') {
    return this.http.put(`${this.base}/update_status/${userId}`, { estado });
  }
  getPendingWithSolicitudes() {
  // environment.apiBase = 'http://127.0.0.1:8000'
  // Backend: GET /users/pending_with_solicitudes
    return this.http.get<{ total: number; data: any[] }>(`${this.base}/pending_with_solicitudes`);
  }
  
  deleteUser(userId: number) {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.base}/delete_scheduled/?usuario_id=${userId}`
    );
  }

}

