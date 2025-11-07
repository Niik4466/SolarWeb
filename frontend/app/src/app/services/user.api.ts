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
  creado_en: string;        // ISO
  actualizado_en: string;   // ISO
  aprobado_en?: string | null; // ISO
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
}
