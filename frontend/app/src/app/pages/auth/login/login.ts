import { Component, signal, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize, take } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../services/login.service';

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

    // Limpia estado previo por si hay un login viejo
    this.auth.setLoggedOut();

    this.loading.set(true);
    this.http.post<LoginResponse>(`${environment.apiBase}/users/log-in`, { email, password })
      .pipe(finalize(() => this.loading.set(false)), take(1))
      .subscribe({
        next: (res) => {
          if (res.success && res.estado === 'aprobado') {
            // Guarda login básico
            this.auth.setLoggedIn(email);

            // Guarda token (que usará el interceptor)
            if (res.access_token) {
              this.auth.setToken(res.access_token);
            }

            // Guarda user_id si vino; si no, lo busca por email
            if (res.user_id != null) {
              this.auth.setUserId(res.user_id);
            } else {
              this.auth.fetchUserIdByEmail(environment.apiBase, email)
                .pipe(take(1))
                .subscribe({
                  next: r => this.auth.setUserId(r.id),
                  error: () => console.warn('No se pudo obtener user_id por correo'),
                });
            }

            // Redirige (usa returnUrl si viene en query)
            const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/graficos';
            this.router.navigateByUrl(returnUrl);
            return;
          }

          // Estados no-aprobados o credenciales malas
          if (res.estado === 'pendiente') {
            this.errorMsg.set('Su solicitud sigue en estado de espera en aprobación.');
          } else if (res.estado === 'eliminado') {
            this.errorMsg.set('Su solicitud ha sido rechazada.');
          } else {
            this.errorMsg.set(res.message ?? 'Credenciales inválidas.');
          }
        },
        error: (err) => {
          this.errorMsg.set(err?.error?.detail ?? 'Error al iniciar sesión.');
        },
      });
  }
}
