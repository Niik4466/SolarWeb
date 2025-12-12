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
import { RegistroService } from '../../../services/registro.service'; // servicio que llama al backend de registro
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
  // FormBuilder para crear el formulario reactivo
  fb = new FormBuilder();

  /**
   * Indica si la solicitud fue enviada correctamente.
   * Se usa para mostrar el modal/mensaje de éxito.
   */
  enviado = signal(false);

  /**
   * Mensaje de error que se muestra en la UI
   * cuando el backend responde con algún problema.
   */
  mostrandoError = signal<string | null>(null);
  
  /**
   * Controla si se muestra/oculta el password en el input
   * (por ejemplo con un ojito en el template).
   */
  mostrarPassword = signal(false);

  /**
   * Validador estático para comparar dos campos de un form group.
   * - a, b: nombres de los controles a comparar.
   * - key: nombre de la propiedad de error (p.ej. 'emailMismatch').
   *
   * Si los valores son distintos, marca el form con { [key]: true }.
   */
  private static match =
    (a: string, b: string, key: string): ValidatorFn =>
    (g: AbstractControl): ValidationErrors | null => {
      const v1 = g.get(a)?.value ?? '';
      const v2 = g.get(b)?.value ?? '';
      return v1 && v2 && v1 !== v2 ? { [key]: true } : null;
    };

  /**
   * Formulario de solicitud de registro.
   * Incluye:
   * - nombre, apellido
   * - email + confirmación
   * - password + confirmación
   * - motivo (texto largo con min y max de caracteres)
   *
   * A nivel de grupo se aplican validadores para:
   * - emailMismatch  (email y confirmEmail deben coincidir)
   * - passwordMismatch (password y confirmPassword deben coincidir)
   */
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
        [
          Validators.required,
          Validators.minLength(150),   // mínimo de caracteres del motivo
          Validators.maxLength(1000),  // máximo de caracteres del motivo
        ],
      ],
    },
    {
      validators: [
        // Verifica que email y confirmEmail coincidan
        SolicitarRegistroComponent.match('email', 'confirmEmail', 'emailMismatch'),
        // Verifica que password y confirmPassword coincidan
        SolicitarRegistroComponent.match('password', 'confirmPassword', 'passwordMismatch'),
      ],
    }
  );

  constructor(
    private registroSrv: RegistroService,  // servicio que hace el POST al backend
    private loadingSrv: LoadingService,    // overlay de “cargando…”
  ) {}

  /**
   * Getter para saber si hay una operación en curso.
   * Se apoya en el LoadingService.
   */
  get cargando() {
    return this.loadingSrv.isLoading();
  }

  /**
   * Acceso directo al control 'motivo' desde el template/ts.
   */
  get motivoCtrl() {
    return this.form.get('motivo')!;
  }

  /**
   * Largo actual del texto ingresado en 'motivo'.
   * Útil para mostrar contador "X / 1000".
   */
  get motivoLen()  {
    return (this.motivoCtrl.value || '').length;
  }

  /**
   * Indica si el formulario tiene el error 'emailMismatch'
   * (emails distintos).
   */
  get emailMismatch() {
    return this.form.hasError('emailMismatch');
  }

  /**
   * Indica si el formulario tiene el error 'passwordMismatch'
   * (passwords distintos).
   */
  get passwordMismatch() {
    return this.form.hasError('passwordMismatch');
  }

  /**
   * Envía la solicitud de registro al backend.
   * - Si el formulario es inválido: marca todos los campos como tocados y no envía.
   * - Si es válido:
   *    - Muestra loading global.
   *    - Llama a registroSrv.solicitarRegistro(...)
   *    - En éxito: marca 'enviado = true' y resetea el formulario.
   *    - En error: muestra mensaje proveniente del backend o uno genérico.
   */
  enviar() {
    // limpiamos error y modal de éxito anterior
    this.mostrandoError.set(null);
    this.enviado.set(false);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loadingSrv.show();

    this.registroSrv
      .solicitarRegistro(this.form.value as any)
      .pipe(finalize(() => this.loadingSrv.hide()))
      .subscribe({
        next: () => {
          this.enviado.set(true);
          this.form.reset();
        },
        error: (err: any) => {
          console.error('Error en solicitar registro:', err);

          // 🚨 BACKEND CAÍDO
          if (err?.backendDown) {
            this.mostrandoError.set(err.message);
            return;
          }

          const emailCtrl = this.form.get('email');

          if (
            err.status === 400 &&
            typeof err.error?.detail === 'string' &&
            err.error.detail.startsWith('Ya existe un usuario con el correo')
          ) {
            const msg =
              'Ya existe una cuenta aprobada o una solicitud pendiente asociada a este correo.';

            emailCtrl?.setErrors({
              ...(emailCtrl.errors || {}),
              alreadyUsed: true,
            });

            this.mostrandoError.set(msg);
            return;
          }

          const msg =
            (err.error && (err.error.detail || err.error.msg)) ||
            err.message ||
            'No se pudo enviar la solicitud.';
          this.mostrandoError.set(msg);
        },
      });


  }
}