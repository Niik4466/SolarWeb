// registro.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

// Endpoint base del backend para usuarios.
// Si cambia la URL del backend, ajústala aquí.
const API = '/api';

/**
 * Interfaz que representa los datos ingresados por el usuario
 * en el formulario de solicitud de registro.
 */
export interface SolicitudRegistroForm {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  motivo: string;  // razón o justificación para pedir acceso
}

@Injectable({ providedIn: 'root' })
export class RegistroService {

  /**
   * Se inyecta HttpClient para realizar solicitudes HTTP al backend.
   */
  constructor(private http: HttpClient) {}

  /**
   * Envía una solicitud de registro al backend.
   *
   * @param f Datos capturados desde el formulario.
   * @returns Observable de la respuesta del backend (POST /create_user)
   *
   * Este método:
   * - Mapea los campos del formulario al formato requerido por FastAPI.
   * - Establece campos adicionales necesarios por el backend como:
   *   - es_admin (false, siempre)
   *   - estado ("pendiente" hasta que un admin apruebe o rechace)
   */
  solicitarRegistro(f: SolicitudRegistroForm) {

    // Traducción de los nombres del formulario al modelo esperado por FastAPI (UsuarioCreate)
    const body = {
      correo: f.email,              // correo del solicitante
      nombre: f.nombre,             // nombre
      apellido: f.apellido,         // apellido
      password: f.password,         // contraseña
      justificacion: f.motivo,      // motivo/razón del registro
      es_admin: false,              // siempre falso al registrarse
      estado: 'pendiente'           // estado inicial hasta evaluación del admin
    };

    // Se ejecuta el POST al endpoint backend
    return this.http.post(`${API}/create_user`, body);
  }
}
