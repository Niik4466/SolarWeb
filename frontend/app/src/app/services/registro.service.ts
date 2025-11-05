import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API = 'http://localhost:8000/users'; // ajusta si cambia

export interface SolicitudRegistroForm {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  motivo: string;
}

@Injectable({ providedIn: 'root' })
export class RegistroService {
  constructor(private http: HttpClient) {}

  solicitarRegistro(f: SolicitudRegistroForm) {
    // Mapeo a lo que espera el backend (UsuarioCreate)
    const body = {
      correo: f.email,
      nombre: f.nombre,
      apellido: f.apellido,
      password: f.password,
      justificacion: f.motivo,
      es_admin: false,
      estado: 'pendiente'
    };
    return this.http.post(`${API}/create_user`, body);
  }
}