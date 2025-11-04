import { Component, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';

type LoginResponse = { success: boolean };

export const environment = {
  production: false,
  apiBase: 'http://127.0.0.1:8000/api/v1',
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

    // Tu backend expone GET /users/log-in con query params
    const params = new HttpParams().set('email', email).set('password', password);

    this.loading.set(true);
    this.http
      .get<LoginResponse>(`${environment.apiBase}/users/log-in`, { params })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          if (res.success) {
            // Guarda un flag simple (hasta que agreguen JWT)
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userEmail', email);
            this.router.navigateByUrl('/graficos'); // o la ruta que corresponda
          } else {
            this.errorMsg.set('Credenciales inválidas o usuario no aprobado.');
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.errorMsg.set(err?.error?.detail ?? 'Error al iniciar sesión.');
        },
      });
  }
}
