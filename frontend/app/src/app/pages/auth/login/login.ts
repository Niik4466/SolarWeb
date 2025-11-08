import { Component, signal, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

type LoginResponse = {
  success: boolean;
  estado?: 'aprobado' | 'pendiente' | 'eliminado' | string | null;
  message?: string;
  user_id?: number; // ✅ coincide con backend
  access_token?: string;
  token_type?: string;
};

export const environment = {
  production: false,
  apiBase: 'http://127.0.0.1:8000',
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  mostrarPassword = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  loading = signal(false);
  errorMsg = signal<string | null>(null);

  onSubmit() {
    this.errorMsg.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.value as { email: string; password: string };

    this.loading.set(true);
    this.http
      .post<LoginResponse>(`${environment.apiBase}/users/log-in`, { email, password })
      .subscribe({
        next: (res) => {
          this.loading.set(false);

          // Éxito solo si está aprobado
          if (res.success && res.estado === 'aprobado') {
            this.auth.setLoggedIn(email);

            // Guardar el token de acceso
            if (res.access_token) {
              localStorage.setItem('access_token', res.access_token);
            }

            // Guarda el ID correctamente (coincide con backend)
            if (res.user_id != null) {
              this.auth.setUserId(res.user_id);
            } else {
              // Si no viene el ID, intenta obtenerlo por email
              this.auth.fetchUserIdByEmail(environment.apiBase, email).subscribe({
                next: (r) => this.auth.setUserId(r.id),
                error: () => {
                  console.warn('No se pudo obtener user_id por correo');
                },
              });
            }

            // Redirige según returnUrl
            const returnUrl =
              this.route.snapshot.queryParamMap.get('returnUrl') || '/graficos';
            this.router.navigateByUrl(returnUrl);
            return;
          }

          // ⚠️ Mensajes según estado
          switch (res.estado) {
            case 'pendiente':
              this.errorMsg.set(
                'Su solicitud sigue en estado de espera en aprobación.'
              );
              break;
            case 'eliminado':
              this.errorMsg.set('Su solicitud ha sido rechazada.');
              break;
            case 'aprobado':
              this.errorMsg.set(
                'No se pudo iniciar sesión. Intente nuevamente.'
              );
              break;
            default:
              this.errorMsg.set(res.message ?? 'Credenciales inválidas.');
              break;
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.errorMsg.set(err?.error?.detail ?? 'Error al iniciar sesión.');
        },
      });
  }
}
