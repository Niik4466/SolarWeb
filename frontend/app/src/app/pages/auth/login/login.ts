// src/app/pages/auth/login/login.ts
import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LoginService, LoginResponse } from '../../../services/login.service';
import { HttpErrorResponse } from '@angular/common/http';
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private loginService = inject(LoginService);

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

    const { email, password } = this.form.value as {
      email: string;
      password: string;
    };

    this.loading.set(true);

    this.loginService
      .login(email, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res: LoginResponse) => {
          if (res.success && res.estado === 'aprobado') {
            const returnUrl =
              this.route.snapshot.queryParamMap.get('returnUrl') || '**';
            this.router.navigateByUrl(returnUrl);
            return;
          }

          if (res.estado === 'pendiente') {
            this.errorMsg.set('Su solicitud sigue en estado de espera en aprobación.');
          } else if (res.estado === 'eliminado') {
            this.errorMsg.set('Su solicitud ha sido rechazada.');
          } else {
            this.errorMsg.set(res.message ?? 'Credenciales inválidas.');
          }
        },

        error: (err: HttpErrorResponse) => {
          // 🔴 Backend caído / sin respuesta
          if (err.status === 0) {
            this.errorMsg.set('No se pudo conectar con el servidor. Intenta nuevamente.');
            return;
          }

          // 🔴 Error interno del backend
          if (err.status >= 500) {
            this.errorMsg.set('Ocurrió un error interno del servidor. Intenta nuevamente más tarde.');
            return;
          }

          // 🟡 Mensaje desde backend (FastAPI suele mandar detail)
          this.errorMsg.set(err.error?.detail ?? 'Error al iniciar sesión.');
        },
      });
  }

  ngOnInit(): void {
    document.body.classList.add('login-bg');
  }

  ngOnDestroy(): void {
    document.body.classList.remove('login-bg');
  }
}
