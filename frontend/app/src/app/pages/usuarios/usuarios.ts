import { Component, computed, signal, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { UsersApi, UsuarioOut, TransaccionOut } from '../../services/user.api';
import { AuthService } from '../../services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith, debounceTime, distinctUntilChanged, finalize } from 'rxjs/operators';
import { LoadingService } from '../../services/loading.service';
import { HttpErrorResponse } from '@angular/common/http';


type UsuarioUI = {
  id: number;
  nombre: string;
  correo: string;
  aprobado_el: string | null;
  rol: 'admin' | 'user'; 
  eliminado?: boolean;
  eliminado_el?: string | null;
};

type FilaHistorial = {
  fecha: string;     // creado_en
  tipo: 'dias' | 'rango';
  fechas: string;    // lista o “ini – fin”
  detalle: string;   // variables e imágenes
};

type Orden = 'recientes' | 'antiguos' | 'nombre' | 'correo';

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
  private loadingSrv = inject(LoadingService);

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

  // ---- buscador y orden ----
  buscar = new FormControl('', { nonNullable: true });
  orden  = signal<Orden>('recientes'); // default: más recientes primero
  private termino = toSignal(
  this.buscar.valueChanges.pipe(
    startWith(this.buscar.value),   // valor inicial
    debounceTime(200),              // suaviza tecleo rápido
    distinctUntilChanged()
  ),
  { initialValue: this.buscar.value }
);

  mostrarEliminados = signal(false);

  cargando = signal(false);
  error = signal<string | null>(null);

  // ----------------- cache de historial por usuario
  cargandoHist = signal(false);
  errorHist = signal<string | null>(null);
  historialUser = signal<UsuarioUI | null>(null);
  privados_histCache = new Map<number, FilaHistorial[]>();

  ngOnInit() { this.cargarAprobados(); }
  
  onOrdenChange(ev: Event) {
    const value = (ev.target as HTMLSelectElement).value as any; // 'recientes' | ...
    this.orden.set(value);
  }

  private mapToUI(u: UsuarioOut): UsuarioUI {
    const nombreCompleto = [u.nombre, u.apellido].filter(Boolean).join(' ');
    const rol = ((u as any).rol ??
              (((u as any).es_admin === true) ? 'admin' : 'user')) as 'admin' | 'user';

    return {
      id: u.id,
      nombre: nombreCompleto,
      correo: u.correo,
      aprobado_el: u.aprobado_en ?? null,
      rol,
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

  // ---------- helpers buscador/orden ----------
  private norm(s: string) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  private ts(u: UsuarioUI): number {
    return u.aprobado_el ? new Date(u.aprobado_el).getTime() : NaN;
  }

  // Lista final visible (filtrada + ordenada)
  visibles = computed(() => {
    const q = this.norm(this.termino() ?? '');
    const base = this.activos();

    // filtro
    let xs = !q ? base : base.filter(u => {
      const hay = this.norm(u.nombre + ' ' + u.correo);
      return hay.includes(q);
    });

    // orden
    const ord = this.orden();
    xs = [...xs].sort((a, b) => {
      if (ord === 'nombre') return this.norm(a.nombre).localeCompare(this.norm(b.nombre));
      if (ord === 'correo') return this.norm(a.correo).localeCompare(this.norm(b.correo));

      const av = this.ts(a), bv = this.ts(b);
      const aNan = Number.isNaN(av), bNan = Number.isNaN(bv);
      if (aNan && bNan) return 0;
      if (aNan) return 1;   // sin fecha -> al final
      if (bNan) return -1;

      return ord === 'recientes' ? (bv - av) : (av - bv);
    });

    return xs;
  });

  toggleFechaSort() {
    this.orden.set(this.orden() === 'recientes' ? 'antiguos' : 'recientes');
  }

  // ---------- helpers historial ----------
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
    if (t.tipo_exportar === 'dias') return t.archivos.join(', ');
    if (t.fecha_ini && t.fecha_fin) return `${t.fecha_ini} – ${t.fecha_fin}`;
    return t.archivos?.[0] ?? '—';
  }

  abrirHistorial(u: UsuarioUI) {
    this.historialUser.set(u);
    this.errorHist.set(null);
    if (this.privados_histCache.has(u.id)) return;

    this.cargandoHist.set(true);
    this.api.getUserTransactions(u.id).subscribe({
      next: (res) => {
        const filas: FilaHistorial[] = (res.data || []).map(t => ({
          fecha: t.creado_en,
          tipo: t.tipo_exportar,
          fechas: this.buildFechas(t),
          detalle: this.buildDetalle(t),
        }))
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

        this.privados_histCache.set(u.id, filas);
        this.cargandoHist.set(false);
      },
      error: (err: HttpErrorResponse) => {
        // 👇 Si el backend responde 404, lo interpretamos como “no tiene historial todavía”
        if (err.status === 404) {
          this.privados_histCache.set(u.id, []);   // caché vacío
          this.errorHist.set(null);                // sin error
        } else {
          // 👇 otros errores sí son reales (500, 0, etc.)
          this.errorHist.set('No se pudo cargar el historial de transacciones.');
        }
        this.cargandoHist.set(false);
      }
    });
  }

  cerrarHistorial() { this.historialUser.set(null); }

  filasHistorialDe(u: UsuarioUI): FilaHistorial[] {
    return this.privados_histCache.get(u.id) ?? [];
  }

  // ---- eliminar/restaurar (sin cambios)
  pendiente = signal<UsuarioUI | null>(null);
  abrirConfirmacion(u: UsuarioUI) { this.pendiente.set(u); }
  cancelarEliminacion() { this.pendiente.set(null); }

  confirmarEliminacion() {
    const u = this.pendiente();
    if (!u) return;
    const adminId = this.auth.getUserId();
    if (!adminId) { this.error.set('No se pudo obtener el ID del administrador autenticado.'); return; }
    this.cargando.set(true);
    this.loadingSrv.show();
    this.api.deleteUser(u.id).pipe(
      finalize(() => {
        // 👇 siempre se ejecuta (éxito o error)
        this.cargando.set(false);
        this.loadingSrv.hide();  // 👈 oculta overlay global
      })
    ).subscribe({
      next: () => {
        this.listaAprobados.update(xs => xs.filter(x => x.id !== u.id));
        if (this.mostrarEliminados()) this.cargarEliminados();
        this.pendiente.set(null);
      },
      error: () => {
        this.error.set('No se pudo eliminar el usuario');
      },
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
}
