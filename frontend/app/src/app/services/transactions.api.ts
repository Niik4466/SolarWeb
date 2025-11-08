// frontend/app/services/transactions.api.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Basado en TransaccionBase y TransaccionCreate
export interface TransaccionCreate {
  usuario_id: number;
  archivos?: string[] | null;
  imagenes: boolean;
  var_ghi: boolean;
  var_dni: boolean;
  var_global: boolean;
}

// Basado en TransaccionOut
export interface TransaccionOut extends TransaccionCreate {
  id: number;
  exportado_en: string | null; // Las fechas (datetime) llegan como strings ISO
  creado_en: string;         // Las fechas (datetime) llegan como strings ISO
}

@Injectable({ providedIn: 'root' })
export class TransactionsApi {
  private http = inject(HttpClient);
  // Asumo una URL base similar a tu UsersApi
  private base = `${(window as any).environment?.apiBase ?? 'http://127.0.0.1:8000'}/users`;

   //Llama al endpoint /save_transaction
   
  saveTransaction(payload: TransaccionCreate): Observable<TransaccionOut> {
    return this.http.post<TransaccionOut>(
      `${this.base}/save_transaction`,
      payload
    );
  }
}
