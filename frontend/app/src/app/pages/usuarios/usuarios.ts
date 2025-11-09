// src/app/pages/usuarios/usuarios.ts
import { Component, computed, signal, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { UsersApi, UsuarioOut, TransaccionOut } from '../../services/user.api';
import { AuthService } from '../../services/auth.service';

type UsuarioUI = {
  id: number;
  nombre: string;
  correo: string;
  aprobado_el: string | null;
  eliminado?: boolean;
  eliminado_el?: string | null;
};

type FilaHistorial = {
  fecha: string;     // creado_en
  tipo: 'dias' | 'rango';
  fechas: string;    // lista o “ini – fin”
  detalle: string;   // variables e imágenes
};

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

  private get adminId(): number | null {
    const id = this.auth.getUserId?.() ?? this.auth.adminId ?? null;
    return id != null ? Number(id) : null;
  }
  private excluirActual(xs: UsuarioUI[]): UsuarioUI[] {
    const id = this.adminId;
    return id == null ? xs : xs.filter(u => u.id !== id);
  }

  listaAprobados = signal<UsuarioUI[]>([]);
  listaEliminados = signal<UsuarioUI[]>([]);

  buscar = new FormControl('', { nonNullable: true });
  mostrarEliminados = signal(false);

  cargando = signal(false);
  error = signal<string | null>(null);

  // ----------------- NUEVO: cache de historial por usuario
  cargandoHist = signal(false);
  errorHist = signal<string | null>(null);
  historialUser = signal<UsuarioUI | null>(null);
  // cache: userId -> filas formateadas
  privados_histCache = new Map<number, FilaHistorial[]>();

  ngOnInit() { this.cargarAprobados(); }

  private mapToUI(u: UsuarioOut): UsuarioUI {
    const nombreCompleto = [u.nombre, u.apellido].filter(Boolean).join(' ');
    return {
      id: u.id,
      nombre: nombreCompleto,
      correo: u.correo,
      aprobado_el: u.aprobado_en ?? null,
      eliminado: u.estado === 'eliminado',
      eliminado_el: (u as any).eliminado_en ?? null,
    };
  }

  private cargarAprobados() {
    this.cargando.set(true);
    this.error.set(null);
    this.api.getByStatus('aprobado').subscribe({
      next: (data) => {
        const mapeados = data.map(u => this.mapToUI(u));
        this.listaAprobados.set(this.excluirActual(mapeados));
        this.cargando.set(false);
      },
      error: () => { this.error.set('No se pudo cargar usuarios aprobados'); this.cargando.set(false); }
    });
  }

  private cargarEliminados() {
    this.cargando.set(true);
    this.api.getDeletedUsers().subscribe({
      next: (data) => {
        const mapeados = data.map(u => this.mapToUI(u));
        this.listaEliminados.set(this.excluirActual(mapeados));
        this.cargando.set(false);
      },
      error: () => { this.error.set('No se pudo cargar usuarios eliminados'); this.cargando.set(false); }
    });
  }

  abrirPapelera() { this.mostrarEliminados.set(true); this.cargarEliminados(); }
  cerrarPapelera() { this.mostrarEliminados.set(false); }

  activos  = computed(() => this.excluirActual(this.listaAprobados()));
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
    const adminId = this.auth.getUserId();
    if (!adminId) { this.error.set('No se pudo obtener el ID del administrador autenticado.'); return; }
    this.cargando.set(true);
    this.api.deleteUser(u.id, adminId).subscribe({
      next: () => {
        this.listaAprobados.update(xs => xs.filter(x => x.id !== u.id));
        if (this.mostrarEliminados()) this.cargarEliminados();
        this.pendiente.set(null);
        this.cargando.set(false);
      },
      error: () => { this.error.set('No se pudo eliminar el usuario'); this.cargando.set(false); },
    });
  }

  restaurar(u: UsuarioUI) {
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
  }

  // ---------- helpers de formateo
  private buildDetalle(t: TransaccionOut): string {
    const vars: string[] = [];
    if (t.var_ghi) vars.push('GHI');
    if (t.var_dni) vars.push('DNI');
    if (t.var_global) vars.push('Global');
    const varsTxt = vars.length ? `Vars: ${vars.join(', ')}` : 'Vars: —';
    const imgsTxt = t.imagenes ? 'con imágenes' : 'sin imágenes';
    return `${varsTxt} · ${imgsTxt}`;
  }

  private buildFechas(t: TransaccionOut): string {
    if (t.tipo_exportar === 'dias') {
      // Lista de días elegidos
      return t.archivos.join(', ');
    }
    // rango: usa fecha_ini/fecha_fin si existen (o el primer string de archivos)
    if (t.fecha_ini && t.fecha_fin) return `${t.fecha_ini} – ${t.fecha_fin}`;
    return t.archivos?.[0] ?? '—';
  }

  // ----------- carga / acceso al historial
  abrirHistorial(u: UsuarioUI) {
    this.historialUser.set(u);
    this.errorHist.set(null);

    if (this.privados_histCache.has(u.id)) return; // ya cargado

    this.cargandoHist.set(true);
    this.api.getUserTransactions(u.id).subscribe({
      next: (res) => {
        const filas: FilaHistorial[] = (res.data || []).map(t => ({
          fecha: t.creado_en,
          tipo: t.tipo_exportar,
          fechas: this.buildFechas(t),
          detalle: this.buildDetalle(t),
        }))
        // opcional: ordenar por fecha desc
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

        this.privados_histCache.set(u.id, filas);
        this.cargandoHist.set(false);
      },
      error: () => {
        this.errorHist.set('No se pudo cargar el historial de transacciones.');
        this.cargandoHist.set(false);
      }
    });
  }

  cerrarHistorial() { this.historialUser.set(null); }

  filasHistorialDe(u: UsuarioUI): FilaHistorial[] {
    return this.privados_histCache.get(u.id) ?? [];
  }
}
