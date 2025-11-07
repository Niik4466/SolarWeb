import { Component, computed, signal, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { UsersApi, UsuarioOut } from '../../services/user.api';

type UsuarioUI = {
  id: number;
  nombre: string;
  correo: string;
  aprobado_el: string | null;  // ISO o null
  eliminado?: boolean;
  eliminado_el?: string | null;
};

type Evento = { fecha: string; accion: string; detalle?: string };

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './usuarios.html',
  styleUrls: ['./usuarios.scss'],
})

export class UsuariosComponent implements OnInit {
  private api = inject(UsersApi);

  listaAprobados = signal<UsuarioUI[]>([]);
  listaEliminados = signal<UsuarioUI[]>([]);

  buscar = new FormControl('', { nonNullable: true });
  mostrarEliminados = signal(false);

  cargando = signal(false);
  error = signal<string | null>(null);

  ngOnInit() { this.cargarAprobados(); }

  // ✅ IMPLEMENTADO
  private mapToUI(u: UsuarioOut): UsuarioUI {
    const nombreCompleto = [u.nombre, u.apellido].filter(Boolean).join(' ');
    return {
      id: u.id,
      nombre: nombreCompleto,
      correo: u.correo,
      aprobado_el: u.aprobado_en ?? null,
      eliminado: u.estado === 'eliminado',
      eliminado_el: u.estado === 'eliminado' ? (u.actualizado_en ?? null) : null,
    };
  }

  private cargarAprobados() {
    this.cargando.set(true);
    this.error.set(null);
    this.api.getByStatus('aprobado').subscribe({
      next: (data) => {
        this.listaAprobados.set(data.map(u => this.mapToUI(u)));
        this.cargando.set(false);
      },
      error: () => { this.error.set('No se pudo cargar usuarios aprobados'); this.cargando.set(false); }
    });
  }

  private cargarEliminados() {
    this.api.getByStatus('eliminado').subscribe({
      next: (data) => this.listaEliminados.set(data.map(u => this.mapToUI(u))),
      error: () => this.error.set('No se pudo cargar usuarios eliminados')
    });
  }

  abrirPapelera() {
    this.mostrarEliminados.set(true);
    this.cargarEliminados(); // 👈 dispara GET status=eliminado
  }
  cerrarPapelera() { this.mostrarEliminados.set(false); }

  activos  = computed(() => this.listaAprobados());
  filtrados = computed(() => {
    const q = this.buscar.value.toLowerCase().trim();
    const base = this.activos();
    if (!q) return base;
    return base.filter(u => (u.nombre + ' ' + u.correo).toLowerCase().includes(q));
  });

  pendiente = signal<UsuarioUI | null>(null);
  abrirConfirmacion(u: UsuarioUI) { this.pendiente.set(u); }
  cancelarEliminacion() { this.pendiente.set(null); }

  confirmarEliminacion() {
    const u = this.pendiente(); if (!u) return;
    this.api.updateStatus(u.id, 'eliminado').subscribe({
      next: () => {
        this.listaAprobados.update(xs => xs.filter(x => x.id !== u.id));
        if (this.mostrarEliminados()) {
          this.listaEliminados.update(xs => [{ ...u, eliminado: true, eliminado_el: new Date().toISOString() }, ...xs]);
        }
        this.pendiente.set(null);
      },
      error: () => this.error.set('No se pudo eliminar el usuario'),
    });
  }

  restaurar(u: UsuarioUI) {
    this.api.updateStatus(u.id, 'aprobado').subscribe({
      next: () => {
        this.listaEliminados.update(xs => xs.filter(x => x.id !== u.id));
        this.listaAprobados.update(xs => [{ ...u, eliminado: false }, ...xs]);
      },
      error: () => this.error.set('No se pudo restaurar el usuario'),
    });
  }

  borrarDefinitivo(u: UsuarioUI) {
    this.listaEliminados.update(xs => xs.filter(x => x.id !== u.id));
  }

  historialUser = signal<UsuarioUI | null>(null);
  abrirHistorial(u: UsuarioUI) { this.historialUser.set(u); }
  cerrarHistorial() { this.historialUser.set(null); }

  // ✅ firma con parámetro (para que compile tu template)
  eventosDe(_u: UsuarioUI): Evento[] { return []; }
}
