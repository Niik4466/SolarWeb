// frontend/app/services/users.api.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

export type UsuarioOut = {
  id: number;
  correo: string;
  nombre: string;
  apellido?: string | null;
  es_admin: boolean;
  estado: 'pendiente' | 'aprobado' | 'eliminado';
  creado_en: string;
  actualizado_en: string;
  aprobado_en?: string | null;
  eliminado_en?: string | null;
};

export type TransaccionOut = {
  id: number;
  usuario_id: number;
  archivos: string[];          // p.ej. ["2025-11-05", "2025-11-15"] o ["2025-11-11 - 2025-11-15"]
  exportado_en: string | null;
  imagenes: boolean;
  var_ghi: boolean;
  var_dni: boolean;
  var_global: boolean;
  creado_en: string;           // ISO
  tipo_exportar: 'dias' | 'rango';
  fecha_ini: string | null;    // "2025-11-11" si rango
  fecha_fin: string | null;    // "2025-11-15" si rango
};

type ByStatusResp = { total: number; data: UsuarioOut[] };
export type UsuarioEstado = 'pendiente' | 'aprobado' | 'eliminado';

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private http = inject(HttpClient);
  private base = `${(window as any).environment?.apiBase ?? 'http://127.0.0.1:8000'}/users`;

  getByStatus(status: UsuarioEstado): Observable<UsuarioOut[]> {
    const params = new HttpParams().set('status', status);
    return this.http.get<ByStatusResp>(`${this.base}/by_status`, { params })
      .pipe(map(r => r.data));
  }

  updateStatus(userId: number, estado: UsuarioEstado) {
    return this.http.put<{ msg: string; user: UsuarioOut }>(
      `${this.base}/update_status/${userId}`,
      { estado }  // body: { estado: 'eliminado' | 'aprobado' | 'pendiente' }
    );
  }
  getDeletedUsers(): Observable<UsuarioOut[]> {
    return this.http.get<{ total: number; data: UsuarioOut[] }>(`${this.base}/deleted_users`)
      .pipe(map(r => r.data));
  }

  deleteUser(userId: number) {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.base}/delete_scheduled/?usuario_id=${userId}`
    );
  }

  getUserTransactions(userId: number) {
    return this.http.get<{ total: number; data: TransaccionOut[] }>(
      `${this.base}/get_transactions/${userId}`
    );
  }
}
