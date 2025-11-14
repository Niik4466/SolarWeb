import { Component, signal, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize, take } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../services/login.service';

/**
 * Respuesta esperada del endpoint /users/log-in.
 * - success: indica si las credenciales fueron válidas.
 * - estado: estado del usuario (aprobado, pendiente, eliminado, etc.).
 * - message: mensaje opcional desde el backend.
 * - user_id: id interno del usuario (para guardar en sesión).
 * - access_token: token JWT o similar.
 * - token_type: tipo de token (p.ej. "bearer").
 */
type LoginResponse = {
  success: boolean;
  estado?: 'aprobado' | 'pendiente' | 'eliminado' | string | null;
  message?: string;
  user_id?: number;
  access_token?: string;
  token_type?: string;
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent {
  // ---------------------------------------------------------
  // Inyección de dependencias
  // ---------------------------------------------------------
  private fb = inject(FormBuilder);     // para construir el formulario reactivo
  private http = inject(HttpClient);    // para llamar al endpoint /users/log-in
  private router = inject(Router);      // para hacer la navegación tras login
  private auth = inject(AuthService);   // servicio de autenticación (estado local)
  private route = inject(ActivatedRoute); // para leer query params (returnUrl)

  /**
   * Controla si se muestra/oculta el password en el input.
   */
  mostrarPassword = signal(false);

  /**
   * Formulario de login con:
   * - email (requerido + formato email)
   * - password (requerido)
   */
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  /**
   * Indica si está en proceso de enviar las credenciales al backend.
   * Se usa para deshabilitar el botón y mostrar un spinner.
   */
  loading = signal(false);

  /**
   * Mensaje de error a mostrar debajo del formulario
   * (credenciales inválidas, usuario pendiente, etc.).
   */
  errorMsg = signal<string | null>(null);

  /**
   * Handler del submit del formulario de login.
   * 1) Valida el formulario.
   * 2) Llama al backend /users/log-in.
   * 3) Según la respuesta:
   *    - Si éxito y estado='aprobado':
   *        • Guarda login en AuthService (email, token, user_id).
   *        • Redirige a returnUrl o /graficos.
   *    - Si estado='pendiente' o 'eliminado':
   *        • Muestra mensaje específico.
   *    - Si credenciales malas:
   *        • Muestra 'Credenciales inválidas' o message del backend.
   */
  onSubmit() {
    // Limpiamos errores previos
    this.errorMsg.set(null);

    // Si el formulario no es válido, marcamos todos los campos y no enviamos
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Obtenemos valores tipeados
    const { email, password } = this.form.value as { email: string; password: string };

    // Limpia estado previo por si hay un login viejo en AuthService
    this.auth.setLoggedOut();

    // Marcamos estado de carga
    this.loading.set(true);

    // Llamada al endpoint de login
    this.http.post<LoginResponse>(`${environment.apiBase}/users/log-in`, { email, password })
      .pipe(
        // finalize siempre se ejecuta (éxito o error): útil para apagar el loading
        finalize(() => this.loading.set(false)),
        take(1) // Nos aseguramos de tomar solo una emisión y completar
      )
      .subscribe({
        next: (res) => {
          // Caso: login exitoso y usuario APROBADO
          if (res.success && res.estado === 'aprobado') {
            // Guarda login básico (por ejemplo, email logueado)
            this.auth.setLoggedIn(email);

            // Guarda token (para interceptor de Auth)
            if (res.access_token) {
              this.auth.setToken(res.access_token);
            }

            // Si viene user_id en la respuesta → lo guardamos directo
            if (res.user_id != null) {
              this.auth.setUserId(res.user_id);
            } else {
              // Si no, consultamos al backend usando el correo
              this.auth.fetchUserIdByEmail(environment.apiBase, email)
                .pipe(take(1))
                .subscribe({
                  next: r => this.auth.setUserId(r.id),
                  error: () => console.warn('No se pudo obtener user_id por correo'),
                });
            }

            // Redirección tras login:
            // - Si hay returnUrl en query params, va ahí.
            // - Si no, cae por defecto a /graficos.
            const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/graficos';
            this.router.navigateByUrl(returnUrl);
            return;
          }

          // -----------------------------
          // Casos de usuario no aprobado
          // -----------------------------
          if (res.estado === 'pendiente') {
            this.errorMsg.set('Su solicitud sigue en estado de espera en aprobación.');
          } else if (res.estado === 'eliminado') {
            this.errorMsg.set('Su solicitud ha sido rechazada.');
          } else {
            // Caso genérico: credenciales inválidas u otro mensaje del backend
            this.errorMsg.set(res.message ?? 'Credenciales inválidas.');
          }
        },
        error: (err) => {
          // Error en la llamada HTTP (500, conexión, etc.)
          this.errorMsg.set(err?.error?.detail ?? 'Error al iniciar sesión.');
        },
      });
  }
}
