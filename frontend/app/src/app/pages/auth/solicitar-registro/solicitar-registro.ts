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
import { LoadingService } from '../../../services/loading.service';
import { finalize } from 'rxjs/operators';

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

  constructor(
    private registroSrv: RegistroService, 
    private loadingSrv: LoadingService) {}
  get cargando() {
    return this.loadingSrv.isLoading();
  }
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

    this.loadingSrv.show();


    this.registroSrv
      .solicitarRegistro(this.form.value as any)
      .pipe(
        // se ejecuta tanto en éxito como en error
        finalize(() => this.loadingSrv.hide())
      )
      .subscribe({
        next: () => {
          this.enviado.set(true);      // abre modal
          this.form.reset();           // limpia el form
        },
      error: (err: HttpErrorResponse) => {
          const msg =
            (err.error && (err.error.detail || err.error.msg)) ||
            err.message ||
            'No se pudo enviar la solicitud.';
          this.mostrandoError.set(msg);
        },
    });
  }
}
