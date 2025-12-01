// src/app/pages/auth/login/login.ts
import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LoginService, LoginResponse } from '../../../services/login.service'; // ajusta la ruta

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
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private loginService = inject(LoginService); // nuevo servicio

  /**
   * Controla si se muestra/oculta el password en el input.
   */
  mostrarPassword = signal(false);

  /**
   * Formulario de login.
   */
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  /**
   * Estado de carga y mensaje de error.
   */
  loading = signal(false);
  errorMsg = signal<string | null>(null);
  
  /**
   * Handler del submit del formulario de login.
   */
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
          // Caso: login exitoso y usuario APROBADO
          if (res.success && res.estado === 'aprobado') {
            const returnUrl =
              this.route.snapshot.queryParamMap.get('returnUrl') || '/inicio';
            this.router.navigateByUrl(returnUrl);
            return;
          }

          // Casos de usuario no aprobado
          if (res.estado === 'pendiente') {
            this.errorMsg.set('Su solicitud sigue en estado de espera en aprobación.');
          } else if (res.estado === 'eliminado') {
            this.errorMsg.set('Su solicitud ha sido rechazada.');
          } else {
            // Credenciales inválidas u otro mensaje del backend
            this.errorMsg.set(res.message ?? 'Credenciales inválidas.');
          }
        },
        error: (err) => {
          this.errorMsg.set(err?.error?.detail ?? 'Error al iniciar sesión.');
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
