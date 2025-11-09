import { Component, computed, signal, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { UsersApi, UsuarioOut } from '../../services/user.api';
import { AuthService } from '../../services/auth.service';

type UsuarioUI = {
  id: number;
  nombre: string;
  correo: string;
  aprobado_el: string | null;
  eliminado?: boolean;
  eliminado_el?: string | null; // viene de backend
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
  private auth = inject(AuthService);

  // ⚠️ Define de dónde obtienes el adminId actual (token/estado global).
  // De momento, déjalo fijo o inyéctalo desde tu AuthService.
  private adminIdActual = this.auth.adminId; // <-- reemplaza por tu id real del admin logueado

  listaAprobados = signal<UsuarioUI[]>([]);
  listaEliminados = signal<UsuarioUI[]>([]);

  buscar = new FormControl('', { nonNullable: true });
  mostrarEliminados = signal(false);

  cargando = signal(false);
  error = signal<string | null>(null);

  ngOnInit() { this.cargarAprobados(); }

  private mapToUI(u: UsuarioOut): UsuarioUI {
    const nombreCompleto = [u.nombre, u.apellido].filter(Boolean).join(' ');
    return {
      id: u.id,
      nombre: nombreCompleto,
      correo: u.correo,
      aprobado_el: u.aprobado_en ?? null,
      eliminado: u.estado === 'eliminado',
      eliminado_el: (u as any).eliminado_en ?? null, // ✅ del backend (deleted_users)
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
    this.cargando.set(true);
    this.api.getDeletedUsers().subscribe({
      next: (data) => {
        this.listaEliminados.set(data.map(u => this.mapToUI(u)));
        this.cargando.set(false);
      },
      error: () => { this.error.set('No se pudo cargar usuarios eliminados'); this.cargando.set(false); }
    });
  }

  abrirPapelera() {
    this.mostrarEliminados.set(true);
    this.cargarEliminados(); // ✅ ahora usa /deleted_users
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
    const u = this.pendiente();
    if (!u) return;

    const adminId = this.auth.getUserId(); // ✅ toma el ID guardado del login
    if (!adminId) {
      this.error.set('No se pudo obtener el ID del administrador autenticado.');
      return;
    }

    this.cargando.set(true);
    this.api.deleteUser(u.id, adminId).subscribe({
      next: () => {
        this.listaAprobados.update(xs => xs.filter(x => x.id !== u.id));
        if (this.mostrarEliminados()) this.cargarEliminados();
        this.pendiente.set(null);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo eliminar el usuario');
        this.cargando.set(false);
      },
    });
  }

  restaurar(u: UsuarioUI) {
    // si quieres restaurar, puedes seguir usando updateStatus('aprobado')
    this.api.updateStatus(u.id, 'aprobado').subscribe({
      next: () => {
        this.listaEliminados.update(xs => xs.filter(x => x.id !== u.id));
        this.listaAprobados.update(xs => [{ ...u, eliminado: false, eliminado_el: null }, ...xs]);
      },
      error: () => this.error.set('No se pudo restaurar el usuario'),
    });
  }

  borrarDefinitivo(u: UsuarioUI) {
    this.listaEliminados.update(xs => xs.filter(x => x.id !== u.id));
    // si tienes endpoint de borrado definitivo físico, lo llamas aquí
  }

  historialUser = signal<UsuarioUI | null>(null);
  abrirHistorial(u: UsuarioUI) { this.historialUser.set(u); }
  cerrarHistorial() { this.historialUser.set(null); }

  eventosDe(_u: UsuarioUI): Evento[] { return []; }
}
