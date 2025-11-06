// solicitar-registro.component.ts
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
  ReactiveFormsModule,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RegistroService } from '../../../services/registro.service'; // ruta real
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-solicitar-registro',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './solicitar-registro.html',
  styleUrls: ['./solicitar-registro.scss'],
})

export class SolicitarRegistroComponent {
  fb = new FormBuilder();
  enviado = signal(false);
  mostrandoError = signal<string | null>(null);
  loading = signal(false);
  mostrarPassword = signal(false);
  private static match =
    (a: string, b: string, key: string): ValidatorFn =>
    (g: AbstractControl): ValidationErrors | null => {
      const v1 = g.get(a)?.value ?? '';
      const v2 = g.get(b)?.value ?? '';
      return v1 && v2 && v1 !== v2 ? { [key]: true } : null;
    };

  form = this.fb.group(
    {
      nombre: ['', [Validators.required]],
      apellido: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      confirmEmail: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      motivo: [
        '',
        [Validators.required, Validators.minLength(150), Validators.maxLength(1000)],
      ],
    },
    {
      validators: [
        SolicitarRegistroComponent.match('email', 'confirmEmail', 'emailMismatch'),
        SolicitarRegistroComponent.match('password', 'confirmPassword', 'passwordMismatch'),
      ],
    }
  );

  constructor(private registroSrv: RegistroService) {}

  get motivoCtrl() { return this.form.get('motivo')!; }
  get motivoLen()  { return (this.motivoCtrl.value || '').length; }
  get emailMismatch() {
    return this.form.hasError('emailMismatch');
  }
  get passwordMismatch() {
    return this.form.hasError('passwordMismatch');
  }

  enviar() {
    this.mostrandoError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.registroSrv.solicitarRegistro(this.form.value as any).subscribe({
      next: () => {
        this.loading.set(false);
        this.enviado.set(true);      // abre modal
        this.form.reset();           // limpia el form
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // intenta leer el mensaje del backend
        const msg =
          (err.error && (err.error.detail || err.error.msg)) ||
          err.message ||
          'No se pudo enviar la solicitud.';
        this.mostrandoError.set(msg);
      }
    });
  }
}
