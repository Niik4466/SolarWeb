import { Component, computed, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';

type Usuario = {
  id: string;
  nombre: string;
  correo: string;
  aprobado_el: string;   // ISO
  eliminado?: boolean;
  eliminado_el?: string; // ISO
};

type Evento = { fecha: string; accion: string; detalle?: string };

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './usuarios.html',
  styleUrls: ['./usuarios.scss'],
})
export class UsuariosComponent {
  // estado en memoria
  lista = signal<Usuario[]>([
    { id:'u1', nombre:'Javiera González Riquelme', correo:'javiera.gonzalez@gmail.com', aprobado_el:'2024-10-12T16:33:00Z' },
    { id:'u2', nombre:'Matías Herrera Valenzuela', correo:'matias.herrera@outlook.com', aprobado_el:'2025-04-05T13:35:00Z' },
    { id:'u3', nombre:'Felipe Castro Morales', correo:'felipe.castro@alumnos.uach.cl', aprobado_el:'2025-05-20T21:54:00Z' },
    { id:'u4', nombre:'Valentina Soto Aravena', correo:'valentina.soto@alumnos.uach.cl', aprobado_el:'2024-08-23T17:19:00Z' },
  ]);

  buscar = new FormControl('', { nonNullable: true });
  mostrarEliminados = signal(false);

  activos  = computed(() => this.lista().filter(u => !u.eliminado));
  papelera = computed(() => this.lista().filter(u =>  u.eliminado));

  filtrados = computed(() => {
    const q = this.buscar.value.toLowerCase().trim();
    if (!q) return this.activos();
    return this.activos().filter(u =>
      (u.nombre + ' ' + u.correo).toLowerCase().includes(q)
    );
  });

  // -------- Confirmación de eliminación --------
  pendiente = signal<Usuario | null>(null);
  abrirConfirmacion(u: Usuario) { this.pendiente.set(u); }
  cancelarEliminacion() { this.pendiente.set(null); }
  confirmarEliminacion() {
    const u = this.pendiente(); if (!u) return;
    this.lista.update(xs =>
      xs.map(x => x.id === u.id ? { ...x, eliminado: true, eliminado_el: new Date().toISOString() } : x)
    );
    this.pendiente.set(null);
  }

  restaurar(u: Usuario) {
    this.lista.update(xs =>
      xs.map(x => x.id === u.id ? { ...x, eliminado: false, eliminado_el: undefined } : x)
    );
  }
  borrarDefinitivo(u: Usuario) {
    this.lista.update(xs => xs.filter(x => x.id !== u.id));
  }

  // -------- Historial de aprobados (modal) --------
  historialUser = signal<Usuario | null>(null);
  private eventosMock = new Map<string, Evento[]>([
    ['u1', [
      { fecha:'2024-10-10T11:05:00Z', accion:'Solicitud recibida' },
      { fecha:'2024-10-12T16:33:00Z', accion:'Aprobación de cuenta', detalle:'Admin: Valentina' },
      { fecha:'2024-10-15T09:01:00Z', accion:'Primer ingreso', detalle:'IP 190.45.x.x' },
    ]],
    ['u2', [
      { fecha:'2025-04-03T10:22:00Z', accion:'Solicitud recibida' },
      { fecha:'2025-04-05T13:35:00Z', accion:'Aprobación de cuenta', detalle:'Admin: Iván' },
    ]],
    ['u3', [
      { fecha:'2025-05-18T21:14:00Z', accion:'Solicitud recibida' },
      { fecha:'2025-05-20T21:54:00Z', accion:'Aprobación de cuenta', detalle:'Admin: Claudia' },
      { fecha:'2025-06-01T12:00:00Z', accion:'Cambio de contraseña' },
    ]],
    ['u4', [
      { fecha:'2024-08-20T10:30:00Z', accion:'Solicitud recibida' },
      { fecha:'2024-08-23T17:19:00Z', accion:'Aprobación de cuenta', detalle:'Admin: Jorge' },
    ]],
  ]);

  abrirHistorial(u: Usuario) { this.historialUser.set(u); }
  cerrarHistorial() { this.historialUser.set(null); }
  eventosDe(u: Usuario | null): Evento[] {
    if (!u) return [];
    return (this.eventosMock.get(u.id) || []).slice()
             .sort((a,b) => a.fecha.localeCompare(b.fecha));
  }
}
