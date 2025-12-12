// src/app/pages/forgot-password/forgot-password.ts
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.scss'],
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  // 1 = pedir código, 2 = cambiar contraseña
  step = signal<1 | 2>(1);

  loading = signal(false);
  serverError = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // ---- FORM 1: pedir código ----
  generateForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  // ---- FORM 2: cambiar contraseña ----
  recoveryForm = this.fb.group(
    {
      email: ['', [Validators.required, Validators.email]],
      code: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    {
      validators: (group: any) =>
        group.value.password === group.value.confirmPassword
          ? null
          : { passwordMismatch: true },
    }
  );

  get passwordMismatch() {
    return this.recoveryForm.hasError('passwordMismatch');
  }

  // ================== ACCIONES ==================

  onGenerateCode() {
    if (this.generateForm.invalid) return;

    this.loading.set(true);
    this.serverError.set(null);
    this.successMessage.set(null);

    const email = this.generateForm.value.email!;

    this.auth.generateRecoveryCode(email).subscribe({
      next: () => {
        this.loading.set(false);
        this.successMessage.set('Se ha enviado un código de recuperación.');
        this.recoveryForm.patchValue({ email });
        this.step.set(2);
      },
      error: (err) => {
        this.loading.set(false);

        // 🚨 BACKEND CAÍDO
        if (err?.backendDown) {
          this.serverError.set(err.message);
          return;
        }

        this.serverError.set(
          'Ocurrió un error al enviar el código. Intenta nuevamente.'
        );
      }
    });
  }


  onRecoverPassword() {
    if (this.recoveryForm.invalid) return;

    this.loading.set(true);
    this.serverError.set(null);
    this.successMessage.set(null);

    const { email, code, password } = this.recoveryForm.value as {
      email: string;
      code: string;
      password: string;
    };

    this.auth.recoverPassword(email, code, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.successMessage.set(
          'Contraseña actualizada correctamente. Ahora puedes iniciar sesión.'
        );
        this.router.navigate(['/login'], {
          queryParams: { reset: 'success' },
        });
      },
      error: (err) => {
        this.loading.set(false);

        // 🚨 BACKEND CAÍDO
        if (err?.backendDown) {
          this.serverError.set(err.message);
          return;
        }

        this.serverError.set(
          'Código inválido o expirado. Revisa tus datos e inténtalo de nuevo.'
        );
      }
    });
  }
}
