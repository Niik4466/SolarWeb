// src/app/pages/auth/login/login.ts
import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LoginService, LoginResponse } from '../../../services/login.service';
import { HttpErrorResponse } from '@angular/common/http';
import { MonitorApi, SimpleState } from '../../../services/monitor.service';
import { AuthService } from '../../../services/auth.service';

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
  private monitorApi = inject(MonitorApi);
  auth = inject(AuthService);

  mostrarPassword = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  loading = signal(false);
  errorMsg = signal<string | null>(null);

  dataServiceState = signal<string | null>(null);


  onSubmit() {
    this.errorMsg.set(null);
    this.dataServiceState.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.value as { email: string; password: string };

    this.loading.set(true);

    this.loginService
      .login(email, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res: LoginResponse) => {
          // si NO fue login exitoso -> flujo normal
          if (!(res.success && res.estado === 'aprobado')) {
            if (res.estado === 'pendiente') {
              this.errorMsg.set('Su solicitud sigue en estado de espera en aprobación.');
            } else if (res.estado === 'eliminado') {
              this.errorMsg.set('Su solicitud ha sido rechazada.');
            } else {
              this.errorMsg.set(res.message ?? 'Credenciales inválidas.');
            }
            return;
          }

          // Si fue exitoso -> consulto estado del servicio
          this.monitorApi.getDataServiceState().subscribe({
            next: (state) => {
              // guardo "OK" / "DOWN" / "DEGRADED"
              this.dataServiceState.set(state.raw);

              // si está caído (o degradado) -> muestro mensaje y NO navego
              if (state.raw === 'DOWN' || state.raw === 'DEGRADED') {
                this.auth.logout(); // cierro sesión por seguridad  
                this.errorMsg.set(
                  'Actualmente la página no está disponible (servicio de datos con problemas). Intenta más tarde.'
                );
                return;
              }

              //  si está OK -> navego normal
              const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
              this.router.navigateByUrl(returnUrl);
            },
            error: () => {
              // si falla la consulta del monitor, lo tratamos como no disponible
              this.errorMsg.set('Actualmente la página no está disponible. Intenta más tarde.');
            },
          });
        },

        error: (err: HttpErrorResponse) => {
          if (err.status === 0) {
            this.errorMsg.set('No se pudo conectar con el servidor. Intenta nuevamente.');
            return;
          }
          if (err.status >= 500) {
            this.errorMsg.set('Ocurrió un error interno del servidor. Intenta nuevamente más tarde.');
            return;
          }
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
