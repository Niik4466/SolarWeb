import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

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
  mostrarPassword = signal(false); // 👈 para alternar la visibilidad de la contraseña

  form = this.fb.group({
    nombre: ['', [Validators.required]],
    apellido: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]], // 👈 Largo mínimo 8
    motivo: ['', [Validators.required, Validators.minLength(150), Validators.maxLength(1000)]],  // 👈 También obligatorio
  });
  // Helpers para el contador
  get motivoCtrl() { return this.form.get('motivo')!; }
  get motivoLen()  { return (this.motivoCtrl.value || '').length; }
  
  enviar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // Muestra errores si hay campos vacíos o inválidos
      console.warn('Formulario inválido:', this.form.errors, this.form.value);
      return;
    }

    console.log('Datos enviados correctamente:', this.form.value);
    this.enviado.set(true); // ✅ Muestra el modal
  }
}
